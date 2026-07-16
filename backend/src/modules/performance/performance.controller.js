import * as perfService from './performance.service.js'
import { parseReviewedCsv, buildSourceNote } from '../../services/reviewedPerformance.service.js'
import { query } from '../../config/database.js'
import AppError from '../../utils/AppError.js'
import asyncHandler from '../../utils/asyncHandler.js'
import { bilinearInterpolate, findWeightLimitForRunway } from '../../services/interpolation.service.js'
import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

// ESM __dirname equivalent
const __filename = fileURLToPath(import.meta.url)
const __dirname  = path.dirname(__filename)
// Backend root = src/modules/performance/ -> ../../.. -> backend/
const BACKEND_ROOT = path.resolve(__dirname, '..', '..', '..')

// ═══════════════════════════════════════════════════════════════════════════
// READ
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/performance/:aircraft_id
export const getCells = asyncHandler(async (req, res) => {
  const data = await perfService.getCellsForAircraft(req.params.aircraft_id)
  res.json({ success: true, data })
})

// ═══════════════════════════════════════════════════════════════════════════
// CHART DATA
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/performance/chart-data
 * Query params: aircraft_id, airport_id, oat, flap (optional), table_type (optional)
 *
 * Returns raw performance cells + computed interpolated values for each table type,
 * so the frontend can render interactive WAT/TODA/ASDA charts showing how the
 * RTOW was calculated (mirrors Python interp() and _field_limit_from_weight_slices logic).
 */
export const getChartData = asyncHandler(async (req, res) => {
  const { aircraft_id, airport_id, oat: oatStr, flap = 'auto', table_type } = req.query
  if (!aircraft_id || !airport_id || oatStr == null) {
    throw new AppError('aircraft_id, airport_id, and oat are required', 400)
  }
  const oat = parseFloat(oatStr)

  // ── Load aircraft & airport ──────────────────────────────────────────────
  const { rows: acRows } = await query(
    `SELECT id, registration, type, mtow_kg, flaps FROM aircraft WHERE id = $1`,
    [aircraft_id]
  )
  if (acRows.length === 0) throw new AppError('Aircraft not found', 404)
  const ac = acRows[0]

  const { rows: apRows } = await query(
    `SELECT id, icao_code, name, elevation_ft, rwy_m, surface FROM airports WHERE id = $1`,
    [airport_id]
  )
  if (apRows.length === 0) throw new AppError('Airport not found', 404)
  const ap = apRows[0]

  const elevFt = parseFloat(ap.elevation_ft) || 0
  const rwyM = ap.rwy_m ? parseFloat(ap.rwy_m) : null

  // Surface factor (murram/grass: 1.12, paved: 1.0)
  let surfaceFactor = 1.0
  if (ap.surface) {
    const s = ap.surface.toUpperCase()
    if (s.includes('MURRAM') || s.includes('GRASS') || s.includes('GRAVEL')) {
      try {
        const sfRes = await query(`SELECT value FROM app_config WHERE key = $1`, ['surface_factor'])
        surfaceFactor = sfRes.rows.length > 0 ? parseFloat(sfRes.rows[0].value) || 1.12 : 1.12
      } catch { surfaceFactor = 1.12 }
    }
  }
  const effRwyM = rwyM != null ? rwyM / surfaceFactor : null

  // ── Determine flaps to evaluate ──────────────────────────────────────────
  let availableFlaps = []
  try {
    availableFlaps = Array.isArray(ac.flaps) ? ac.flaps : JSON.parse(ac.flaps || '[]')
  } catch { availableFlaps = [] }

  const flapsToEvaluate = (flap === 'auto' || !flap)
    ? (availableFlaps.length > 0 ? availableFlaps : ['0'])
    : [String(flap)]

  // ── Load all performance cells for this aircraft ─────────────────────────
  const wantedTypes = table_type ? [table_type.toUpperCase()] : ['WAT', 'TODA', 'ASDA']

  const cellsRes = await query(
    `SELECT table_type, flap_setting, elevation_ft, temp_c, value_kg, weight_kg
     FROM performance_cells
     WHERE aircraft_id = $1 AND table_type = ANY($2::text[])`,
    [aircraft_id, wantedTypes]
  )
  const allCells = cellsRes.rows.map(c => ({
    table_type:    c.table_type,
    flap_setting:  String(c.flap_setting),
    elevation_ft:  parseFloat(c.elevation_ft),
    temp_c:        parseFloat(c.temp_c),
    value_kg:      c.value_kg != null ? parseFloat(c.value_kg) : null,
    weight_kg:     c.weight_kg != null ? parseFloat(c.weight_kg) : null,
  }))

  // ── Build WAT chart data ─────────────────────────────────────────────────
  // Mirror of Python interp(table, elev_ft, oat) + get_best_wat()
  // One set of elevation-temperature curves per flap setting.
  let watChart = null
  if (wantedTypes.includes('WAT')) {
    let bestWatKg = null
    let bestWatFlap = null
    const flapCurves = []

    for (const fl of flapsToEvaluate) {
      const watCells = allCells.filter(
        c => c.table_type === 'WAT' && c.flap_setting === String(fl) && c.value_kg != null
      )
      if (watCells.length === 0) continue

      const interpolatedKg = bilinearInterpolate(watCells, elevFt, oat)

      // Build curves: for each unique elevation, sort by temp and produce chart points
      const elevations = [...new Set(watCells.map(c => c.elevation_ft))].sort((a, b) => a - b)
      const curves = elevations.map(elev => {
        const points = watCells
          .filter(c => c.elevation_ft === elev)
          .sort((a, b) => a.temp_c - b.temp_c)
          .map(c => ({ temp_c: c.temp_c, value_kg: c.value_kg }))
        return { elevation_ft: elev, points }
      })

      if (interpolatedKg != null && (bestWatKg === null || interpolatedKg > bestWatKg)) {
        bestWatKg = interpolatedKg
        bestWatFlap = fl
      }

      flapCurves.push({ flap: fl, curves, interpolated_kg: interpolatedKg })
    }

    // Cap at MTOW
    const mtow = parseFloat(ac.mtow_kg)
    if (bestWatKg != null && bestWatKg > mtow) bestWatKg = mtow

    watChart = {
      flap_used: bestWatFlap,
      interpolated_kg: bestWatKg != null ? Math.round(bestWatKg) : null,
      oat_c: oat,
      elevation_ft: elevFt,
      flapCurves,
    }
  }

  // ── Build TODA/ASDA chart data ───────────────────────────────────────────
  // Mirror of Python _field_limit_from_weight_slices():
  // For each weight slice, interpolate required distance at (elevFt, oat),
  // then find the max weight whose required distance ≤ effRwyM.
  const buildFieldChart = (tableType) => {
    if (!wantedTypes.includes(tableType)) return null
    let bestWeightKg = null
    const flapData = []

    for (const fl of flapsToEvaluate) {
      const cells = allCells.filter(
        c => c.table_type === tableType && c.flap_setting === String(fl) && c.weight_kg != null
      )
      if (cells.length === 0) continue

      const weights = [...new Set(cells.map(c => c.weight_kg))].sort((a, b) => a - b)

      // For each weight slice interpolate the required distance at (elevFt, oat)
      const weightPoints = []
      const matrixTemps = [20, 30, 40]
      const weightMatrix = []

      for (const w of weights) {
        const slice = cells.filter(c => c.weight_kg === w)
        const reqDist = bilinearInterpolate(slice, elevFt, oat)
        if (reqDist != null) {
          weightPoints.push({ weight_kg: w, required_m: Math.round(reqDist) })
        }

        // Generate matrix of distances at 20, 30, 40 deg C
        const tempsObj = {}
        for (const t of matrixTemps) {
          const d = bilinearInterpolate(slice, elevFt, t)
          tempsObj[`temp_${t}`] = d != null ? Math.round(d) : null
        }
        weightMatrix.push({ weight_kg: w, ...tempsObj })
      }

      if (weightPoints.length === 0) continue

      // Find limiting weight: last weight whose required_m ≤ effRwyM
      let limitingWeight = null
      if (effRwyM != null) {
        const usable = weightPoints.filter(p => p.required_m <= effRwyM)
        if (usable.length > 0) {
          const cap = usable[usable.length - 1]
          const heavier = weightPoints.find(p => p.weight_kg > cap.weight_kg)
          if (heavier && heavier.required_m > cap.required_m) {
            // Linear interpolation between cap and heavier slice
            const frac = (effRwyM - cap.required_m) / (heavier.required_m - cap.required_m)
            limitingWeight = Math.round(cap.weight_kg + frac * (heavier.weight_kg - cap.weight_kg))
          } else {
            limitingWeight = Math.round(cap.weight_kg)
          }
        } else if (weightPoints.length >= 2) {
          // Conservative low-end extrapolation for strips below lightest slice
          const lo = weightPoints[0], hi = weightPoints[1]
          if (hi.required_m !== lo.required_m) {
            const frac = (effRwyM - lo.required_m) / (hi.required_m - lo.required_m)
            limitingWeight = Math.max(0, Math.round(lo.weight_kg + frac * (hi.weight_kg - lo.weight_kg)))
          }
        }
        // Cap at MTOW
        if (limitingWeight != null) {
          const mtow = parseFloat(ac.mtow_kg)
          limitingWeight = Math.min(limitingWeight, mtow)
        }
      }

      if (limitingWeight != null && (bestWeightKg === null || limitingWeight > bestWeightKg)) {
        bestWeightKg = limitingWeight
      }

      flapData.push({
        flap: fl,
        weight_points: weightPoints,
        weight_matrix: weightMatrix,
        limiting_weight_kg: limitingWeight,
      })
    }

    return {
      available_rwy_m: rwyM ? Math.round(rwyM) : null,
      eff_rwy_m: effRwyM ? Math.round(effRwyM) : null,
      surface_factor: surfaceFactor,
      limiting_weight_kg: bestWeightKg,
      oat_c: oat,
      elevation_ft: elevFt,
      flapData,
    }
  }

  const todaChart = buildFieldChart('TODA')
  const asdaChart = buildFieldChart('ASDA')

  res.json({
    success: true,
    data: {
      aircraft: { id: ac.id, registration: ac.registration, type: ac.type, mtow_kg: parseFloat(ac.mtow_kg) },
      airport:  { id: ap.id, icao: ap.icao_code, name: ap.name, elevation_ft: elevFt, rwy_m: rwyM, surface: ap.surface },
      oat_c: oat,
      flap,
      wat:  watChart,
      toda: todaChart,
      asda: asdaChart,
    }
  })
})

/**
 * GET /api/performance/chart-image
 * Query params: aircraft_id, airport_id, table_type, flap, oat, rtow_kg, factor
 *
 * Spawns the draw_trace.py script to draw calibration overlay solution lines
 * onto the scanned chart image and streams the resulting JPEG back.
 */
export const getChartImage = asyncHandler(async (req, res) => {
  const { aircraft_id, airport_id, table_type, flap, oat, rtow_kg, factor } = req.query
  if (!aircraft_id || !airport_id || !table_type || !flap || oat == null) {
    throw new AppError('aircraft_id, airport_id, table_type, flap, and oat are required', 400)
  }

  // Fetch aircraft
  const { rows: acRows } = await query(
    `SELECT type, flaps FROM aircraft WHERE id = $1`,
    [aircraft_id]
  )
  if (acRows.length === 0) throw new AppError('Aircraft not found', 404)
  const ac = acRows[0]

  // Map type to model prefix — handles all known type string formats
  //   DASH 8-200, DHC-8-200, DH8B, Q200  → Q200
  //   DASH 8-300, DHC-8-300, DH8C, Q300  → Q300 (default)
  let modelPrefix = 'Q300'
  const typeUpper = String(ac.type || '').toUpperCase()
  if (
    typeUpper.includes('DH8B') ||
    typeUpper.includes('Q200') ||
    typeUpper.includes('DHC-8-200') ||
    typeUpper.includes('DASH 8-200') ||
    typeUpper.includes('DASH8-200') ||
    typeUpper.includes('-200')
  ) {
    modelPrefix = 'Q200'
  }

  // Fetch airport
  const { rows: apRows } = await query(
    `SELECT icao_code, elevation_ft, rwy_m FROM airports WHERE id = $1`,
    [airport_id]
  )
  if (apRows.length === 0) throw new AppError('Airport not found', 404)
  const ap = apRows[0]

  // Normalise flap: strip non-numeric chars, so "flap15" -> "15"
  const flapNorm = String(flap).replace(/[^0-9]/g, '') || '0'
  const tableTypeUpper = String(table_type).toUpperCase()

  // Absolute paths anchored to backend root (never CWD-dependent)
  const calPath = path.join(BACKEND_ROOT, 'data', 'performance_calibrations',
    `${modelPrefix}_${tableTypeUpper}_flap_${flapNorm}.json`)
  const imgPath = path.join(BACKEND_ROOT, 'public', 'performance_previews',
    `${modelPrefix}_${tableTypeUpper}_flap_${flapNorm}_candidate_overlay.jpg`)
  const scriptPath = path.join(BACKEND_ROOT, 'scripts', 'draw_trace.py')

  // Validate all three files exist before spawning Python
  const missing = []
  if (!fs.existsSync(calPath))    missing.push(`calibration: ${path.basename(calPath)}`)
  if (!fs.existsSync(imgPath))    missing.push(`image: ${path.basename(imgPath)}`)
  if (!fs.existsSync(scriptPath)) missing.push(`script: draw_trace.py`)
  if (missing.length > 0) {
    throw new AppError(`Chart asset(s) not found — ${missing.join(', ')}`, 404)
  }

  const payload = {
    cal_path: calPath,
    img_path: imgPath,
    table_type: tableTypeUpper,
    oat: parseFloat(oat),
    elev_ft: parseFloat(ap.elevation_ft) || 0,
    rwy_m:   parseFloat(ap.rwy_m) || 0,
    rtow_kg: rtow_kg != null ? parseFloat(rtow_kg) : null,
    factor:  factor  || '-',
    icao:    ap.icao_code || '',
  }

  // ── Spawn Python (try `python` first, fall back to `python3`) ──────────────
  const spawnPython = (cmd) => new Promise((resolve, reject) => {
    const py = spawn(cmd, [scriptPath], { stdio: ['pipe', 'pipe', 'pipe'] })
    const chunks = []
    let errLog = ''
    const timer = setTimeout(() => {
      py.kill()
      reject(new Error('Python draw_trace.py timed out after 30s'))
    }, 30000)

    py.stdout.on('data', d => chunks.push(d))
    py.stderr.on('data', d => { errLog += d.toString() })

    py.on('close', code => {
      clearTimeout(timer)
      if (code !== 0) {
        reject(new Error(`draw_trace.py exited ${code}: ${errLog.slice(0, 400)}`))
      } else {
        resolve(Buffer.concat(chunks))
      }
    })

    py.on('error', err => {
      clearTimeout(timer)
      reject(err)
    })

    py.stdin.write(JSON.stringify(payload))
    py.stdin.end()
  })

  // ── Helper: install Pillow via pip then retry ─────────────────────────────
  const installPillow = (cmd) => new Promise((resolve) => {
    console.log(`[chart-image] Installing Pillow via ${cmd} -m pip install Pillow...`)
    const pip = spawn(cmd, ['-m', 'pip', 'install', '--user', 'Pillow'], { stdio: 'inherit' })
    pip.on('close', (code) => resolve(code === 0))
    pip.on('error', () => resolve(false))
  })

  const isPilMissing = (msg) =>
    msg.includes("No module named 'PIL'") ||
    msg.includes("No module named 'Pillow'") ||
    msg.includes('PIL') && msg.includes('ModuleNotFound')

  let imgBuffer
  let pythonCmd = 'python'
  try {
    imgBuffer = await spawnPython('python')
  } catch (err1) {
    const isNotFound = err1.code === 'ENOENT' ||
      String(err1.message).includes('ENOENT') ||
      String(err1.message).includes('is not recognized')

    if (isPilMissing(err1.message)) {
      // python found but PIL missing — auto-install then retry
      console.log('[chart-image] PIL missing on python, attempting auto-install...')
      const ok = await installPillow('python')
      if (ok) {
        try { imgBuffer = await spawnPython('python') }
        catch (retryErr) { throw new AppError(`Chart render failed after Pillow install: ${retryErr.message}`, 500) }
      } else {
        throw new AppError('Pillow auto-install failed. Run: python -m pip install Pillow', 500)
      }
    } else if (isNotFound) {
      // 'python' not found — try python3
      pythonCmd = 'python3'
      try {
        imgBuffer = await spawnPython('python3')
      } catch (err2) {
        if (isPilMissing(err2.message)) {
          console.log('[chart-image] PIL missing on python3, attempting auto-install...')
          const ok = await installPillow('python3')
          if (ok) {
            try { imgBuffer = await spawnPython('python3') }
            catch (retryErr) { throw new AppError(`Chart render failed after Pillow install: ${retryErr.message}`, 500) }
          } else {
            throw new AppError('Pillow auto-install failed. Run: python3 -m pip install Pillow', 500)
          }
        } else {
          console.error('[chart-image] python3 fallback failed:', err2.message)
          throw new AppError(`Python not available. ${err2.message}`, 500)
        }
      }
    } else {
      console.error(`[chart-image] ${pythonCmd} draw_trace.py failed:`, err1.message)
      throw new AppError(`Chart render failed: ${err1.message}`, 500)
    }
  }

  res.setHeader('Content-Type', 'image/jpeg')
  res.setHeader('Cache-Control', 'public, max-age=60')
  res.send(imgBuffer)
})


// GET /api/performance/:aircraft_id/summary
export const getSummary = asyncHandler(async (req, res) => {
  const data = await perfService.getPerformanceSummary(req.params.aircraft_id)
  res.json({ success: true, data })
})

// ═══════════════════════════════════════════════════════════════════════════
// WRITE
// ═══════════════════════════════════════════════════════════════════════════

// POST /api/performance/save/:aircraft_id
// Body: { table_type, flap_setting, weight_kg?, cells[], source_note? }
export const saveCells = asyncHandler(async (req, res) => {
  const result = await perfService.batchUpsertCells(
    req.params.aircraft_id,
    req.body
  )
  res.json({ success: true, data: result })
})

// ═══════════════════════════════════════════════════════════════════════════
// IMPORT
// ═══════════════════════════════════════════════════════════════════════════

// POST /api/performance/import-json/:aircraft_id
// Body: { table_type?, flap_setting?, weight_kg?, source_note?, data: <json> }
// or upload the raw JSON calibration file directly as req.body (Content-Type: application/json)
export const importJson = asyncHandler(async (req, res) => {
  const { table_type, flap_setting, weight_kg, source_note, data } = req.body

  // Accept either { data: <calibration json> } or the raw calibration json itself
  const jsonPayload = data ?? req.body

  const result = await perfService.importFromCalibrationJson(
    req.params.aircraft_id,
    jsonPayload,
    { table_type, flap_setting, weight_kg, source_note }
  )
  res.json({ success: true, data: result })
})

// POST /api/performance/import-reviewed-csv/:aircraft_id
// Body (multipart/form-data): enr_csv (file), modelAircraftMap (JSON string)
export const importReviewedCsv = asyncHandler(async (req, res) => {
  if (!req.file) throw new AppError('CSV file is required', 400)

  // Caller supplies which aircraft UUID each CSV `model` code maps to, e.g.:
  // { "Q200": "uuid-for-DH8B", "Q300": "uuid-for-DH8C" }
  let modelAircraftMap
  try {
    modelAircraftMap = JSON.parse(req.body.modelAircraftMap || '{}')
  } catch {
    throw new AppError('modelAircraftMap must be valid JSON', 400)
  }

  const csvText = req.file.buffer.toString('utf-8')
  const { reviewed, draftCount, totalCount } = parseReviewedCsv(csvText)

  if (reviewed.length === 0) {
    return res.json({
      success: true,
      data: { inserted: 0, updated: 0, skippedDrafts: draftCount, totalRows: totalCount },
    })
  }

  // Use a dedicated client for the transaction
  const { Pool } = await import('pg')
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
  })
  const client = await pool.connect()

  let inserted = 0, updated = 0
  try {
    await client.query('BEGIN')

    for (const row of reviewed) {
      const aircraftId = modelAircraftMap[row.model]
      if (!aircraftId) {
        throw new AppError(`No aircraft_id mapping supplied for model "${row.model}"`, 400)
      }

      const sourceNote = buildSourceNote(row)

      const result = await client.query(
        `INSERT INTO performance_cells
           (aircraft_id, table_type, flap_setting, elevation_ft, temp_c, weight_kg, value_kg, source_note)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (aircraft_id, table_type, flap_setting, elevation_ft, temp_c, weight_kg)
         DO UPDATE SET value_kg = EXCLUDED.value_kg,
                       source_note = EXCLUDED.source_note,
                       updated_at = now()
         RETURNING (xmax = 0) AS inserted`,
        [aircraftId, row.table_type, row.flap_setting, row.elevation_ft, row.temp_c, row.weight_kg, row.value_kg, sourceNote]
      )

      if (result.rows[0].inserted) inserted++
      else updated++
    }

    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
    await pool.end()
  }

  res.json({
    success: true,
    data: { inserted, updated, skippedDrafts: draftCount, totalRows: totalCount },
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// DELETE
// ═══════════════════════════════════════════════════════════════════════════

// DELETE /api/performance/:aircraft_id/flap
// Body: { table_type, flap_setting, weight_kg? }
export const deleteFlap = asyncHandler(async (req, res) => {
  const { table_type, flap_setting, weight_kg } = req.body
  const result = await perfService.deleteCellsForFlap(
    req.params.aircraft_id,
    table_type,
    flap_setting,
    weight_kg ?? null
  )
  res.json({ success: true, data: result })
})

// DELETE /api/performance/:aircraft_id/all
export const deleteAll = asyncHandler(async (req, res) => {
  const { confirm } = req.body
  if (confirm !== 'DELETE ALL') {
    return res.status(400).json({ success: false, message: 'Send { confirm: "DELETE ALL" } to proceed' })
  }
  const result = await perfService.deleteAllCellsForAircraft(req.params.aircraft_id)
  res.json({ success: true, data: result })
})