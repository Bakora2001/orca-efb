import * as perfService from './performance.service.js'
import { parseReviewedCsv, buildSourceNote } from '../../services/reviewedPerformance.service.js'
import { query } from '../../config/database.js'
import AppError from '../../utils/AppError.js'
import asyncHandler from '../../utils/asyncHandler.js'

// ═══════════════════════════════════════════════════════════════════════════
// READ
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/performance/:aircraft_id
export const getCells = asyncHandler(async (req, res) => {
  const data = await perfService.getCellsForAircraft(req.params.aircraft_id)
  res.json({ success: true, data })
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