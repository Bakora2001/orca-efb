/**
 * rtow.service.js
 * ───────────────
 * Core RTOW (Regulated Take-Off Weight) computation engine.
 *
 * Computes the maximum take-off weight considering:
 *   • Structural limit (MTOW)
 *   • WAT (Weight-Altitude-Temperature) limit
 *   • TODA (Take-Off Distance Available) field limit
 *   • ASDA (Accelerate-Stop Distance Available) field limit
 *
 * The RTOW is the minimum of all applicable limits.
 *
 * Features:
 *   • Self-contained — accepts aircraft/airport UUIDs and loads data internally
 *   • Also accepts pre-loaded objects for batch efficiency
 *   • Single-query performance cell loading (not N+1)
 *   • Sparse-grid tolerant bilinear interpolation
 *   • Surface factor adjustment for unpaved runways
 *   • Optional airport-specific pre-calibrated field limits
 *   • Conservative low-end extrapolation for short runways
 *   • Detailed breakdown via computeRTOWBreakdown()
 *
 * Depends on: interpolation.service.js, database query
 */

import { query } from '../config/database.js'
import {
  bilinearInterpolate,
  findWeightLimitForRunway,
} from './interpolation.service.js'
import AppError from '../utils/AppError.js'

// ═══════════════════════════════════════════════════════════════════════════
// MAIN ENTRY POINT (accepts UUIDs — self-contained)
// ═══════════════════════════════════════════════════════════════════════════

export async function computeRTOW(aircraftId, airportId, oat, flap = 'auto') {
  const acRes = await query(
    `SELECT id, registration, type, mtow_kg, mlw_kg, mzfw_kg, bew_kg,
            max_pax, cruise_tas_kt, fuel_burn_kg_hr, flaps
     FROM aircraft WHERE id = $1 AND is_active = true`,
    [aircraftId]
  )
  if (acRes.rows.length === 0) throw new AppError('Aircraft not found', 404)
  const aircraft = acRes.rows[0]

  const apRes = await query(
    `SELECT id, icao_code, name, elevation_ft, rwy_m, surface
     FROM airports WHERE id = $1 AND is_active = true`,
    [airportId]
  )
  if (apRes.rows.length === 0) throw new AppError('Airport not found', 404)
  const airport = apRes.rows[0]

  return computeRTOWFromObjects(aircraft, airport, oat, flap)
}

// ═══════════════════════════════════════════════════════════════════════════
// OBJECT-BASED ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════

export async function computeRTOWFromObjects(aircraft, airport, oat, flap = 'auto') {
  const elevFt = parseFloat(airport.elevation_ft) || 0
  const rwyM   = airport.rwy_m ? parseFloat(airport.rwy_m) : null

  const surfaceFactor = await getSurfaceFactor(airport)
  const effRwyM = rwyM != null ? rwyM / surfaceFactor : null

  const availableFlaps = Array.isArray(aircraft.flaps)
    ? aircraft.flaps
    : (typeof aircraft.flaps === 'string' ? JSON.parse(aircraft.flaps) : [])
  const flapsToEvaluate = (flap === 'auto' || !flap)
    ? (availableFlaps.length > 0 ? availableFlaps : ['0'])
    : [String(flap)]

  const airportFieldLimits = await loadAirportFieldLimits(aircraft.id, airport.id, oat)

  const cellRes = await query(
    `SELECT table_type, flap_setting, elevation_ft, temp_c, value_kg, weight_kg
     FROM performance_cells WHERE aircraft_id = $1`,
    [aircraft.id]
  )
  const allCells = cellRes.rows.map(c => ({
    ...c,
    elevation_ft: parseFloat(c.elevation_ft),
    temp_c:       parseFloat(c.temp_c),
    value_kg:     c.value_kg != null ? parseFloat(c.value_kg) : null,
    weight_kg:    c.weight_kg != null ? parseFloat(c.weight_kg) : null
  }))

  if (allCells.length === 0) {
    throw new AppError(
      `No performance data found for aircraft ${aircraft.registration}. ` +
      `Load WAT/TODA/ASDA data via the admin panel first.`,
      422
    )
  }

  let bestResult = null

  for (const flapSetting of flapsToEvaluate) {
    const result = evaluateFlap(
      allCells, aircraft, elevFt, effRwyM, oat, flapSetting, airportFieldLimits
    )
    if (result === null) continue
    if (bestResult === null || result.rtow_kg > bestResult.rtow_kg) {
      bestResult = result
    }
  }

  if (bestResult === null) {
    throw new AppError(
      `Could not compute RTOW — no WAT data found for flap setting(s): ${flapsToEvaluate.join(', ')}. ` +
      `Check that performance data has been loaded for this aircraft.`,
      422
    )
  }

  const fieldTablesReady = checkFieldTablePresence(allCells)

  return {
    rtow_kg:          Math.round(bestResult.rtow_kg),
    factor:           bestResult.factor,
    wat_flap:         bestResult.flapSetting,
    field_limit_note: buildFieldNote(bestResult, effRwyM, rwyM, surfaceFactor, airport, oat, fieldTablesReady),
    detail: {
      wat_kg:         bestResult.watKg  != null ? Math.round(bestResult.watKg)  : null,
      toda_kg:        bestResult.todaKg != null ? Math.round(bestResult.todaKg) : null,
      asda_kg:        bestResult.asdaKg != null ? Math.round(bestResult.asdaKg) : null,
      mtow_kg:        parseFloat(aircraft.mtow_kg),
      elevation_ft:   elevFt,
      rwy_m:          rwyM,
      eff_rwy_m:      effRwyM,
      oat_c:          oat,
      surface_factor: surfaceFactor,
      flap_evaluated: flapsToEvaluate,
      field_tables_ready: fieldTablesReady,
    },
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DETAILED BREAKDOWN
// ═══════════════════════════════════════════════════════════════════════════

export async function computeRTOWBreakdown(aircraftId, airportId, oat, flap = 'auto') {
  const result = await computeRTOW(aircraftId, airportId, oat, flap)
  return {
    structural_kg: result.detail.mtow_kg,
    wat_kg:        result.detail.wat_kg,
    toda_kg:       result.detail.toda_kg,
    asda_kg:       result.detail.asda_kg,
    rtow_kg:       result.rtow_kg,
    factor:        result.factor,
    wat_flap:      result.wat_flap,
    field_tables_ready: result.detail.field_tables_ready,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FLAP EVALUATION
// ═══════════════════════════════════════════════════════════════════════════

function evaluateFlap(allCells, aircraft, elevFt, effRwyM, oat, flapSetting, airportFieldLimits) {
  const filterCells = (tableType, weightKg = null) =>
    allCells.filter(c =>
      c.table_type    === tableType &&
      Number(c.flap_setting)  === Number(flapSetting) &&
      (weightKg != null ? c.weight_kg === weightKg : c.weight_kg == null)
    )

  const mtowKg = parseFloat(aircraft.mtow_kg)

  const watCells = filterCells('WAT')
  const watKg = watCells.length > 0 ? bilinearInterpolate(watCells, elevFt, oat) : null
  if (watKg === null) return null

  let todaKg = null
  if (airportFieldLimits?.toda != null) {
    todaKg = airportFieldLimits.toda
  } else if (effRwyM != null) {
    const todaCells = allCells.filter(c =>
      c.table_type === 'TODA' && Number(c.flap_setting) === Number(flapSetting) && c.weight_kg != null
    )
    if (todaCells.length > 0) {
      const todaResult = findWeightLimitForRunwayWithExtrap(todaCells, elevFt, oat, effRwyM)
      todaKg = todaResult ? todaResult.weight_kg : 0
    }
  }

  let asdaKg = null
  if (airportFieldLimits?.asda != null) {
    asdaKg = airportFieldLimits.asda
  } else if (effRwyM != null) {
    const asdaCells = allCells.filter(c =>
      c.table_type === 'ASDA' && Number(c.flap_setting) === Number(flapSetting) && c.weight_kg != null
    )
    if (asdaCells.length > 0) {
      const asdaResult = findWeightLimitForRunwayWithExtrap(asdaCells, elevFt, oat, effRwyM)
      asdaKg = asdaResult ? asdaResult.weight_kg : 0
    }
  }

  const limits = [
    { label: 'WAT',    value: Math.min(watKg, mtowKg) },
    { label: 'STRUCT', value: mtowKg },
  ]
  if (todaKg != null) limits.push({ label: 'TODA', value: Math.min(todaKg, mtowKg) })
  if (asdaKg != null) limits.push({ label: 'ASDA', value: Math.min(asdaKg, mtowKg) })

  const governing = limits.reduce((min, cur) => cur.value < min.value ? cur : min)

  return { flapSetting, rtow_kg: governing.value, factor: governing.label, watKg, todaKg, asdaKg }
}

// ═══════════════════════════════════════════════════════════════════════════
// WEIGHT LIMIT FINDER WITH CONSERVATIVE EXTRAPOLATION
// ═══════════════════════════════════════════════════════════════════════════

function findWeightLimitForRunwayWithExtrap(allCells, elevFt, tempC, rwyM) {
  const result = findWeightLimitForRunway(allCells, elevFt, tempC, rwyM)
  if (result !== null) return result

  const weights = [...new Set(allCells.map(c => c.weight_kg).filter(w => w != null))]
    .sort((a, b) => a - b)
  if (weights.length < 2) return null

  const w1 = weights[0], w2 = weights[1]
  const d1 = bilinearInterpolate(allCells.filter(c => c.weight_kg === w1), elevFt, tempC)
  const d2 = bilinearInterpolate(allCells.filter(c => c.weight_kg === w2), elevFt, tempC)

  if (d1 == null || d2 == null || d1 === d2) return null

  const frac = (rwyM - d1) / (d2 - d1)
  return { weight_kg: Math.max(0, w1 + frac * (w2 - w1)), distance_m: rwyM }
}

// ═══════════════════════════════════════════════════════════════════════════
// SURFACE FACTOR
// ═══════════════════════════════════════════════════════════════════════════

async function getSurfaceFactor(airport) {
  if (!airport.surface) return 1.0
  const surface = airport.surface.toUpperCase()
  if (!surface.includes('MURRAM') && !surface.includes('GRASS') && !surface.includes('GRAVEL')) {
    return 1.0
  }
  try {
    const { rows } = await query(`SELECT value FROM app_config WHERE key = $1`, ['surface_factor'])
    if (rows.length > 0) return parseFloat(rows[0].value) || 1.0
  } catch {}
  return 1.12
}

// ═══════════════════════════════════════════════════════════════════════════
// AIRPORT-SPECIFIC PRE-CALIBRATED FIELD LIMITS
// ═══════════════════════════════════════════════════════════════════════════

async function loadAirportFieldLimits(aircraftId, airportId, oat) {
  try {
    const { rows } = await query(
      `SELECT table_type, oat_c, limit_kg
       FROM airport_field_limits
       WHERE aircraft_id = $1 AND airport_id = $2 AND limit_kg IS NOT NULL
         AND (source_note LIKE '%REVIEWED%' OR source_note LIKE '%CALIBRATED%' OR source_note LIKE '%AFM%')
       ORDER BY table_type, oat_c`,
      [aircraftId, airportId]
    )
    if (rows.length === 0) return null

    const todaPoints = [], asdaPoints = []
    for (const r of rows) {
      if (r.table_type === 'TODA') todaPoints.push([parseFloat(r.oat_c), parseFloat(r.limit_kg)])
      if (r.table_type === 'ASDA') asdaPoints.push([parseFloat(r.oat_c), parseFloat(r.limit_kg)])
    }

    const toda = todaPoints.length >= 2 ? interp1DFromPoints(todaPoints, oat) : null
    const asda = asdaPoints.length >= 2 ? interp1DFromPoints(asdaPoints, oat) : null

    if (toda == null && asda == null) return null
    return { toda, asda }
  } catch { return null }
}

function interp1DFromPoints(points, x) {
  const pts = points.filter(([, v]) => v != null).map(([px, v]) => [parseFloat(px), parseFloat(v)]).sort((a, b) => a[0] - b[0])
  if (pts.length < 2) return null
  const xVal = parseFloat(x)
  if (xVal <= pts[0][0]) return pts[0][1]
  if (xVal >= pts[pts.length - 1][0]) return pts[pts.length - 1][1]
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[i + 1]
    if (x1 <= xVal && xVal <= x2) {
      const span = x2 - x1
      return y1 + (span === 0 ? 0 : (xVal - x1) / span) * (y2 - y1)
    }
  }
  return pts[pts.length - 1][1]
}

// ═══════════════════════════════════════════════════════════════════════════
// FIELD TABLE PRESENCE CHECK
// ═══════════════════════════════════════════════════════════════════════════

function checkFieldTablePresence(allCells) {
  return allCells.filter(c => c.table_type === 'TODA').length > 0 &&
         allCells.filter(c => c.table_type === 'ASDA').length > 0
}

// ═══════════════════════════════════════════════════════════════════════════
// FIELD LIMIT NOTE BUILDER
// ═══════════════════════════════════════════════════════════════════════════

function buildFieldNote(result, effRwyM, rawRwyM, surfaceFactor, airport, oat, fieldTablesReady) {
  const icao = airport.icao_code || '????'
  const elev = Math.round(airport.elevation_ft || 0)

  let surfaceNote = ''
  if (surfaceFactor > 1.0 && rawRwyM != null) {
    surfaceNote = ` (effective ${Math.round(effRwyM)}m after surface factor ×${surfaceFactor.toFixed(2)})`
  }

  if (rawRwyM == null) {
    return `No runway data for ${icao} — field performance limits not applied. WAT limit only.`
  }
  if (!fieldTablesReady) {
    return `TODA/ASDA field-length charts are not fully calibrated for this aircraft. WAT + structural limits only.`
  }
  if (result.factor === 'TODA') {
    return `TODA limited at ${icao} (${Math.round(rawRwyM)}m available${surfaceNote}).`
  }
  if (result.factor === 'ASDA') {
    return `ASDA limited at ${icao} (${Math.round(rawRwyM)}m available${surfaceNote}).`
  }
  if (result.factor === 'STRUCT') {
    return `Structural MTOW limit applies — field performance not limiting at ${icao}.`
  }
  return `WAT limited at ${icao} (elevation ${elev}ft, OAT ${oat}°C).`
}