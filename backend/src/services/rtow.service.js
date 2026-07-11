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

/**
 * Compute RTOW for one aircraft / airport / OAT / flap combination.
 *
 * @param {string} aircraftId  — Aircraft UUID
 * @param {string} airportId   — Airport UUID
 * @param {number} oat         — Outside Air Temperature in °C
 * @param {string} [flap='auto'] — Flap setting ("0","5","10","15" or "auto")
 * @returns {Promise<object>} { rtow_kg, factor, wat_flap, field_limit_note, detail }
 */
export async function computeRTOW(aircraftId, airportId, oat, flap = 'auto') {
  // ── Load aircraft ───────────────────────────────────────────────
  const acRes = await query(
    `SELECT id, registration, type, mtow_kg, mlw_kg, mzfw_kg, bew_kg,
            max_pax, cruise_tas_kt, fuel_burn_kg_hr, flaps
     FROM aircraft WHERE id = $1 AND is_active = true`,
    [aircraftId]
  )
  if (acRes.rows.length === 0) throw new AppError('Aircraft not found', 404)
  const aircraft = acRes.rows[0]

  // ── Load airport ────────────────────────────────────────────────
  const apRes = await query(
    `SELECT id, icao_code, name, elevation_ft, rwy_m, surface
     FROM airports WHERE id = $1 AND is_active = true`,
    [airportId]
  )
  if (apRes.rows.length === 0) throw new AppError('Airport not found', 404)
  const airport = apRes.rows[0]

  // Delegate to the object-based engine
  return computeRTOWFromObjects(aircraft, airport, oat, flap)
}

// ═══════════════════════════════════════════════════════════════════════════
// OBJECT-BASED ENTRY POINT (for batch efficiency or pre-loaded data)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Compute RTOW using pre-loaded aircraft and airport objects.
 * Useful when calling in a loop or when the caller already has the objects.
 *
 * @param {object} aircraft — Row from `aircraft` table
 * @param {object} airport  — Row from `airports` table
 * @param {number} oat      — Outside Air Temperature in °C
 * @param {string} [flap='auto'] — Flap setting
 * @returns {Promise<object>}
 */
export async function computeRTOWFromObjects(aircraft, airport, oat, flap = 'auto') {
  const elevFt = parseFloat(airport.elevation_ft) || 0
  const rwyM   = airport.rwy_m ? parseFloat(airport.rwy_m) : null

  // ── Apply surface factor ────────────────────────────────────────
  const surfaceFactor = await getSurfaceFactor(airport)
  const effRwyM = rwyM != null ? rwyM / surfaceFactor : null

  // ── Determine which flap settings to evaluate ───────────────────
  const availableFlaps = Array.isArray(aircraft.flaps)
    ? aircraft.flaps
    : (typeof aircraft.flaps === 'string' ? JSON.parse(aircraft.flaps) : [])
  const flapsToEvaluate = (flap === 'auto' || !flap)
    ? (availableFlaps.length > 0 ? availableFlaps : ['0'])
    : [String(flap)]

  // ── Check for airport-specific pre-calibrated field limits ──────
  const airportFieldLimits = await loadAirportFieldLimits(aircraft.id, airport.id, oat)

  // ── Load ALL performance cells for this aircraft (1 query) ──────
  const cellRes = await query(
    `SELECT table_type, flap_setting, elevation_ft, temp_c, value_kg, weight_kg
     FROM performance_cells WHERE aircraft_id = $1`,
    [aircraft.id]
  )
  const allCells = cellRes.rows

  if (allCells.length === 0) {
    throw new AppError(
      `No performance data found for aircraft ${aircraft.registration}. ` +
      `Load WAT/TODA/ASDA data via the admin panel first.`,
      422
    )
  }

  // ── Evaluate each flap setting and pick the best ────────────────
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

  // ── Check field table readiness ─────────────────────────────────
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
// DETAILED BREAKDOWN (for reporting / debug / crew brief)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Compute a detailed RTOW breakdown with all intermediate limits exposed.
 *
 * @param {string} aircraftId
 * @param {string} airportId
 * @param {number} oat
 * @param {string} [flap='auto']
 * @returns {Promise<object>} Full breakdown object
 */
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

/**
 * Evaluate a single flap setting against all applicable limits.
 *
 * @param {Array} allCells        — All performance cells for this aircraft
 * @param {object} aircraft       — Aircraft row
 * @param {number} elevFt         — Airport elevation in feet
 * @param {number|null} effRwyM   — Effective runway length (after surface factor)
 * @param {number} oat            — OAT in °C
 * @param {string} flapSetting    — Flap setting string
 * @param {object|null} airportFieldLimits — Pre-calibrated limits {toda, asda}
 * @returns {object|null}
 */
function evaluateFlap(allCells, aircraft, elevFt, effRwyM, oat, flapSetting, airportFieldLimits) {
  const filterCells = (tableType, weightKg = null) =>
    allCells.filter(c =>
      c.table_type    === tableType &&
      c.flap_setting  === String(flapSetting) &&
      (weightKg != null
        ? c.weight_kg === weightKg
        : c.weight_kg == null)
    )

  const mtowKg = parseFloat(aircraft.mtow_kg)

  // ── WAT limit ──────────────────────────────────────────────────
  const watCells = filterCells('WAT')
  const watKg    = watCells.length > 0
    ? bilinearInterpolate(watCells, elevFt, oat)
    : null

  if (watKg === null) return null // No WAT data for this flap — skip

  // ── TODA limit ─────────────────────────────────────────────────
  let todaKg = null

  if (airportFieldLimits?.toda != null) {
    // Use pre-calibrated airport-specific limit
    todaKg = airportFieldLimits.toda
  } else if (effRwyM != null) {
    const todaCells = allCells.filter(c =>
      c.table_type   === 'TODA' &&
      c.flap_setting === String(flapSetting) &&
      c.weight_kg    != null
    )
    if (todaCells.length > 0) {
      const todaResult = findWeightLimitForRunwayWithExtrap(todaCells, elevFt, oat, effRwyM)
      todaKg = todaResult ? todaResult.weight_kg : 0
    }
  }

  // ── ASDA limit ─────────────────────────────────────────────────
  let asdaKg = null

  if (airportFieldLimits?.asda != null) {
    asdaKg = airportFieldLimits.asda
  } else if (effRwyM != null) {
    const asdaCells = allCells.filter(c =>
      c.table_type   === 'ASDA' &&
      c.flap_setting === String(flapSetting) &&
      c.weight_kg    != null
    )
    if (asdaCells.length > 0) {
      const asdaResult = findWeightLimitForRunwayWithExtrap(asdaCells, elevFt, oat, effRwyM)
      asdaKg = asdaResult ? asdaResult.weight_kg : 0
    }
  }

  // ── Governing RTOW ─────────────────────────────────────────────
  const limits = [
    { label: 'WAT',    value: Math.min(watKg, mtowKg) },
    { label: 'STRUCT', value: mtowKg },
  ]
  if (todaKg != null) limits.push({ label: 'TODA', value: Math.min(todaKg, mtowKg) })
  if (asdaKg != null) limits.push({ label: 'ASDA', value: Math.min(asdaKg, mtowKg) })

  const governing = limits.reduce((min, cur) =>
    cur.value < min.value ? cur : min
  )

  return {
    flapSetting,
    rtow_kg: governing.value,
    factor:  governing.label,
    watKg,
    todaKg,
    asdaKg,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// WEIGHT LIMIT FINDER WITH CONSERVATIVE EXTRAPOLATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extended weight-limit finder that falls back to conservative extrapolation
 * when the available runway is shorter than the lowest weight slice.
 *
 * @param {Array} allCells
 * @param {number} elevFt
 * @param {number} tempC
 * @param {number} rwyM
 * @returns {{ weight_kg: number, distance_m: number }|null}
 */
function findWeightLimitForRunwayWithExtrap(allCells, elevFt, tempC, rwyM) {
  const result = findWeightLimitForRunway(allCells, elevFt, tempC, rwyM)
  if (result !== null) return result

  // No weight is within the runway limit — try conservative low-end extrapolation
  const weights = [...new Set(allCells.map(c => c.weight_kg).filter(w => w != null))]
    .sort((a, b) => a - b)

  if (weights.length < 2) return null

  // Get the two lightest weight slices
  const w1 = weights[0]
  const w2 = weights[1]

  const d1 = bilinearInterpolate(allCells.filter(c => c.weight_kg === w1), elevFt, tempC)
  const d2 = bilinearInterpolate(allCells.filter(c => c.weight_kg === w2), elevFt, tempC)

  if (d1 == null || d2 == null) return null
  if (d1 === d2) return null // Can't interpolate

  // Linear extrapolation below w1 (conservative — caps at 0 kg)
  const frac = (rwyM - d1) / (d2 - d1)
  const extrapKg = Math.max(0, w1 + frac * (w2 - w1))

  return { weight_kg: extrapKg, distance_m: rwyM }
}

// ═══════════════════════════════════════════════════════════════════════════
// SURFACE FACTOR
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get the surface factor for an airport.
 * Unpaved surfaces reduce effective runway length.
 *
 * @param {object} airport
 * @returns {Promise<number>}
 */
async function getSurfaceFactor(airport) {
  if (!airport.surface) return 1.0

  const surface = airport.surface.toUpperCase()

  // Only apply to unpaved surfaces
  if (!surface.includes('MURRAM') && !surface.includes('GRASS') && !surface.includes('GRAVEL')) {
    return 1.0
  }

  try {
    const { rows } = await query(
      `SELECT value FROM app_config WHERE key = $1`,
      ['surface_factor']
    )
    if (rows.length > 0) {
      return parseFloat(rows[0].value) || 1.0
    }
  } catch {
    // Config not available — use default
  }

  // Default surface factor for unpaved runways
  return 1.12
}

// ═══════════════════════════════════════════════════════════════════════════
// AIRPORT-SPECIFIC PRE-CALIBRATED FIELD LIMITS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Load pre-calibrated airport-specific field limits if available.
 * These are manually entered limits that override the generic grid interpolation.
 *
 * @param {string} aircraftId
 * @param {string} airportId
 * @param {number} oat
 * @returns {Promise<{toda: number|null, asda: number|null}>}
 */
async function loadAirportFieldLimits(aircraftId, airportId, oat) {
  try {
    const { rows } = await query(
      `SELECT table_type, oat_c, limit_kg
       FROM airport_field_limits
       WHERE aircraft_id = $1 AND airport_id = $2 AND limit_kg IS NOT NULL
         AND (source_note LIKE '%REVIEWED%'
           OR source_note LIKE '%CALIBRATED%'
           OR source_note LIKE '%AFM%')
       ORDER BY table_type, oat_c`,
      [aircraftId, airportId]
    )

    if (rows.length === 0) return null

    // Separate TODA and ASDA points
    const todaPoints = []
    const asdaPoints = []

    for (const r of rows) {
      const point = [parseFloat(r.oat_c), parseFloat(r.limit_kg)]
      if (r.table_type === 'TODA') todaPoints.push(point)
      if (r.table_type === 'ASDA') asdaPoints.push(point)
    }

    // 1D interpolate each to the target OAT
    const toda = todaPoints.length >= 2 ? interp1DFromPoints(todaPoints, oat) : null
    const asda = asdaPoints.length >= 2 ? interp1DFromPoints(asdaPoints, oat) : null

    if (toda == null && asda == null) return null
    return { toda, asda }
  } catch {
    // Table might not exist — that's fine
    return null
  }
}

/**
 * Simple 1D interpolation from sorted [x, value] pairs.
 */
function interp1DFromPoints(points, x) {
  const pts = points
    .filter(([, v]) => v != null)
    .map(([px, v]) => [parseFloat(px), parseFloat(v)])
    .sort((a, b) => a[0] - b[0])

  if (pts.length < 2) return null

  const xVal = parseFloat(x)

  if (xVal <= pts[0][0]) return pts[0][1]
  if (xVal >= pts[pts.length - 1][0]) return pts[pts.length - 1][1]

  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i]
    const [x2, y2] = pts[i + 1]
    if (x1 <= xVal && xVal <= x2) {
      const span = x2 - x1
      const frac = span === 0 ? 0 : (xVal - x1) / span
      return y1 + frac * (y2 - y1)
    }
  }

  return pts[pts.length - 1][1]
}

// ═══════════════════════════════════════════════════════════════════════════
// FIELD TABLE PRESENCE CHECK
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check whether TODA and ASDA tables have any data for this aircraft.
 */
function checkFieldTablePresence(allCells) {
  const todaCount = allCells.filter(c => c.table_type === 'TODA').length
  const asdaCount = allCells.filter(c => c.table_type === 'ASDA').length
  return todaCount > 0 && asdaCount > 0
}

// ═══════════════════════════════════════════════════════════════════════════
// FIELD LIMIT NOTE BUILDER
// ═══════════════════════════════════════════════════════════════════════════

function buildFieldNote(result, effRwyM, rawRwyM, surfaceFactor, airport, oat, fieldTablesReady) {
  const icao = airport.icao_code || '????'
  const elev = Math.round(airport.elevation_ft || 0)

  // Surface factor note
  let surfaceNote = ''
  if (surfaceFactor > 1.0 && rawRwyM != null) {
    surfaceNote = ` (effective ${Math.round(effRwyM)}m after surface factor ×${surfaceFactor.toFixed(2)})`
  }

  // No runway data at all
  if (rawRwyM == null) {
    return `No runway data for ${icao} — field performance limits not applied. WAT limit only.`
  }

  // Field tables not loaded
  if (!fieldTablesReady) {
    return `TODA/ASDA field-length charts are not fully calibrated for this aircraft. WAT + structural limits only.`
  }

  // Governing factor notes
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

// /**
//  * RTOW (Regulated Take-Off Weight) Computation Service
//  * 
//  * Computes the maximum take-off weight considering:
//  * - Structural limit (MTOW)
//  * - WAT (Weight-Altitude-Temperature) limit
//  * - TODA (Take-Off Distance Available) field limit
//  * - ASDA (Accelerate-Stop Distance Available) field limit
//  * 
//  * The RTOW is the minimum of all applicable limits.
//  */

// import { query } from '../config/database.js'
// import { 
//   interp1D, 
//   interp2D, 
//   loadPerfTable, 
//   loadFieldPerfTable, 
//   getFieldWeightOptions 
// } from './interpolation.service.js'

// const LB_TO_KG = 0.453592

// /**
//  * Get best WAT limit across all available flaps
//  */
// async function getBestWAT(aircraft, elevFt, oatC) {
//   const flaps = Array.isArray(aircraft.flaps) ? aircraft.flaps : JSON.parse(aircraft.flaps || '[]')
//   const structuralKg = Math.round(parseFloat(aircraft.mtow_kg))

//   let best = 0
//   let bestFlap = null

//   for (const flap of flaps) {
//     const table = await loadPerfTable(query, aircraft.id, 'WAT', parseFloat(flap))
//     if (!table) continue

//     const wat = interp2D(table, elevFt, oatC)
//     if (wat && wat > best) {
//       best = wat
//       bestFlap = parseFloat(flap)
//     }
//   }

//   if (best === 0) {
//     return { wat: structuralKg, flap: null } // No WAT data → structural only
//   }

//   return { wat: Math.min(best, structuralKg), flap: bestFlap }
// }

// /**
//  * Get airport-specific field limit (pre-calibrated for specific runway/airport)
//  */
// async function getAirportFieldLimit(aircraft, airport, oatC, tableType, forceFlap = null) {
//   if (!['TODA', 'ASDA'].includes(tableType)) return null

//   const flaps = forceFlap != null && forceFlap !== 'auto'
//     ? [parseFloat(forceFlap)]
//     : (Array.isArray(aircraft.flaps) ? aircraft.flaps : JSON.parse(aircraft.flaps || '[]'))

//   const structuralKg = Math.round(parseFloat(aircraft.mtow_kg))
//   let best = null

//   for (const flap of flaps) {
//     const { rows } = await query(
//       `SELECT oat_c, limit_kg
//        FROM airport_field_limits
//        WHERE aircraft_id = $1 AND airport_id = $2 AND table_type = $3 AND flap = $4
//          AND limit_kg IS NOT NULL
//          AND (source_note LIKE '%REVIEWED%' OR source_note LIKE '%CALIBRATED%' OR source_note LIKE '%AFM%')`,
//       [aircraft.id, airport.id, tableType, parseFloat(flap)]
//     )

//     const points = rows.map(r => [parseFloat(r.oat_c), parseFloat(r.limit_kg)])
//     const value = interp1D(points, oatC)

//     if (value != null && (best == null || value > best)) {
//       best = value
//     }
//   }

//   if (best == null) return null

//   return Math.max(0, Math.min(Math.round(best), structuralKg))
// }

// /**
//  * Compute field limit from weight-aware TODA/ASDA grids
//  */
// async function fieldLimitFromWeightSlices(aircraft, airport, oatC, effRunwayM, flaps, tableType = null) {
//   const structuralKg = Math.round(parseFloat(aircraft.mtow_kg))
//   let best = null

//   for (const flap of flaps) {
//     // Get available weight slices
//     let weights
//     if (tableType) {
//       weights = await getFieldWeightOptions(query, aircraft.id, tableType, flap)
//     } else {
//       const todaWeights = new Set(await getFieldWeightOptions(query, aircraft.id, 'TODA', flap))
//       const asdaWeights = new Set(await getFieldWeightOptions(query, aircraft.id, 'ASDA', flap))
//       weights = Array.from(todaWeights).filter(w => asdaWeights.has(w)).sort((a, b) => a - b)
//     }

//     const points = []

//     for (const weight of weights) {
//       let required

//       if (tableType) {
//         const table = await loadFieldPerfTable(query, aircraft.id, tableType, flap, weight)
//         if (!table) continue
//         required = interp2D(table, airport.elevation_ft, oatC)
//       } else {
//         const todaTable = await loadFieldPerfTable(query, aircraft.id, 'TODA', flap, weight)
//         const asdaTable = await loadFieldPerfTable(query, aircraft.id, 'ASDA', flap, weight)
//         if (!todaTable || !asdaTable) continue

//         const tr = interp2D(todaTable, airport.elevation_ft, oatC)
//         const ar = interp2D(asdaTable, airport.elevation_ft, oatC)
//         required = (tr != null && ar != null) ? Math.max(tr, ar) : null
//       }

//       if (required == null) continue
//       points.push([parseFloat(weight), parseFloat(required)])
//     }

//     if (points.length === 0) continue

//     points.sort((a, b) => a[0] - b[0])

//     // Find usable weights (where required distance ≤ available runway)
//     const usable = points.filter(([w, d]) => d <= effRunwayM)

//     let cap = null

//     if (usable.length > 0) {
//       // Take the heaviest usable weight
//       cap = usable[usable.length - 1][0]

//       // Check if we can interpolate to a heavier weight
//       const heavier = points.find(([w, d]) => w > cap)
//       if (heavier && heavier[1] > usable[usable.length - 1][1]) {
//         const [loW, loD] = usable[usable.length - 1]
//         const [hiW, hiD] = heavier
//         const frac = (effRunwayM - loD) / (hiD - loD)
//         cap = loW + frac * (hiW - loW)
//       }
//     } else if (points.length >= 2 && points[1][1] !== points[0][1]) {
//       // Conservative low-end extrapolation for short runways
//       const [loW, loD] = points[0]
//       const [hiW, hiD] = points[1]
//       const frac = (effRunwayM - loD) / (hiD - loD)
//       cap = loW + frac * (hiW - loW)
//     } else if (points.length > 0 && points[0][1] <= effRunwayM) {
//       cap = points[0][0]
//     }

//     if (cap == null) continue

//     cap = Math.max(0, Math.min(Math.round(cap), structuralKg))
//     if (best == null || cap > best) {
//       best = cap
//     }
//   }

//   return best
// }

// /**
//  * Get single field limit (TODA or ASDA)
//  */
// async function getSingleFieldLimit(aircraft, airport, oatC, tableType, forceFlap = null) {
//   // Check for airport-specific limit first
//   const airportLimit = await getAirportFieldLimit(aircraft, airport, oatC, tableType, forceFlap)
//   if (airportLimit != null) return airportLimit

//   const flaps = forceFlap != null && forceFlap !== 'auto'
//     ? [parseFloat(forceFlap)]
//     : (Array.isArray(aircraft.flaps) ? aircraft.flaps : JSON.parse(aircraft.flaps || '[]'))

//   if (!['TODA', 'ASDA'].includes(tableType) || !airport.rwy_m) return null

//   // Get config for surface factor
//   const { rows: configRows } = await query('SELECT key, value FROM app_config WHERE key = $1', ['surface_factor'])
//   const surfaceFactor = airport.surface && airport.surface.toUpperCase().includes('MURRAM')
//     ? parseFloat(configRows.find(r => r.key === 'surface_factor')?.value || '1.12')
//     : 1.0

//   const effRunwayM = parseFloat(airport.rwy_m) / surfaceFactor

//   return await fieldLimitFromWeightSlices(aircraft, airport, oatC, effRunwayM, flaps, tableType)
// }

// /**
//  * Get combined field limit (lower of TODA and ASDA)
//  */
// async function getFieldLimit(aircraft, airport, oatC, forceFlap = null) {
//   // Check for airport-specific limits first
//   const todaAirport = await getAirportFieldLimit(aircraft, airport, oatC, 'TODA', forceFlap)
//   const asdaAirport = await getAirportFieldLimit(aircraft, airport, oatC, 'ASDA', forceFlap)
  
//   const airportLimits = [todaAirport, asdaAirport].filter(v => v != null)
//   if (airportLimits.length > 0) {
//     return Math.min(...airportLimits)
//   }

//   const flaps = forceFlap != null && forceFlap !== 'auto'
//     ? [parseFloat(forceFlap)]
//     : (Array.isArray(aircraft.flaps) ? aircraft.flaps : JSON.parse(aircraft.flaps || '[]'))

//   // Get surface factor
//   const { rows: configRows } = await query('SELECT key, value FROM app_config')
//   const config = Object.fromEntries(configRows.map(r => [r.key, r.value]))
  
//   const surfaceFactor = airport.surface && airport.surface.toUpperCase().includes('MURRAM')
//     ? parseFloat(config.surface_factor_murram || config.surface_factor || '1.12')
//     : 1.0

//   if (!airport.rwy_m) return null

//   const effRunwayM = parseFloat(airport.rwy_m) / surfaceFactor

//   const weighted = await fieldLimitFromWeightSlices(aircraft, airport, oatC, effRunwayM, flaps)
//   return weighted // Don't fall back to legacy TODA/ASDA without weight dimension
// }

// /**
//  * Compute RTOW with breakdown
//  */
// export async function computeRTOWBreakdown(aircraft, airport, oatC, forceFlap = null) {
//   const structuralKg = Math.round(parseFloat(aircraft.mtow_kg))

//   // WAT limit
//   let watKg, watFlap
//   if (forceFlap != null && forceFlap !== 'auto') {
//     const flap = parseFloat(forceFlap)
//     const table = await loadPerfTable(query, aircraft.id, 'WAT', flap)
//     const wat = table ? interp2D(table, airport.elevation_ft, oatC) : null
//     watKg = wat ? Math.min(wat, structuralKg) : structuralKg
//     watFlap = (table && wat < structuralKg) ? flap : null
//   } else {
//     const result = await getBestWAT(aircraft, airport.elevation_ft, oatC)
//     watKg = result.wat
//     watFlap = result.flap
//   }

//   // Field limits
//   const todaKg = await getSingleFieldLimit(aircraft, airport, oatC, 'TODA', forceFlap)
//   const asdaKg = await getSingleFieldLimit(aircraft, airport, oatC, 'ASDA', forceFlap)

//   // Find minimum
//   const candidates = [
//     ['STRUCTURAL', structuralKg],
//     ['WAT', watKg]
//   ]

//   if (todaKg != null) candidates.push(['TODA', todaKg])
//   if (asdaKg != null) candidates.push(['ASDA', asdaKg])

//   const [factor, rtowKg] = candidates.reduce((min, curr) => curr[1] < min[1] ? curr : min)

//   return {
//     structural_kg: structuralKg,
//     wat_kg: watKg != null ? Math.round(watKg) : null,
//     wat_flap: watFlap,
//     toda_kg: todaKg != null ? Math.round(todaKg) : null,
//     asda_kg: asdaKg != null ? Math.round(asdaKg) : null,
//     rtow_kg: Math.round(rtowKg),
//     factor
//   }
// }

// /**
//  * Compute RTOW (main API function)
//  */
// export async function computeRTOW(aircraft, airport, oatC, forceFlap = null) {
//   const structuralKg = Math.round(parseFloat(aircraft.mtow_kg))

//   // WAT limit
//   let watKg, watFlap
//   if (forceFlap != null && forceFlap !== 'auto') {
//     const flap = parseFloat(forceFlap)
//     const table = await loadPerfTable(query, aircraft.id, 'WAT', flap)
//     const wat = table ? interp2D(table, airport.elevation_ft, oatC) : null
//     watKg = wat ? Math.min(wat, structuralKg) : structuralKg
//     watFlap = (table && wat < structuralKg) ? flap : null
//   } else {
//     const result = await getBestWAT(aircraft, airport.elevation_ft, oatC)
//     watKg = result.wat
//     watFlap = result.flap
//   }

//   let rtowKg = structuralKg
//   let factor = 'STRUCTURAL'

//   // Check WAT limit
//   if (watKg < structuralKg - 5) {
//     rtowKg = watKg
//     factor = 'WAT'
//   } else {
//     watFlap = null
//   }

//   // Check field limit
//   const fieldLimit = await getFieldLimit(aircraft, airport, oatC, forceFlap)
//   if (fieldLimit != null && fieldLimit < rtowKg) {
//     rtowKg = fieldLimit
//     factor = 'FIELD LENGTH'
//     watFlap = null
//   }

//   // Get field table coverage
//   const { rows: todaCells } = await query(
//     'SELECT COUNT(*) as count FROM performance_cells WHERE aircraft_id = $1 AND table_type = $2',
//     [aircraft.id, 'TODA']
//   )
//   const { rows: asdaCells } = await query(
//     'SELECT COUNT(*) as count FROM performance_cells WHERE aircraft_id = $1 AND table_type = $2',
//     [aircraft.id, 'ASDA']
//   )

//   const fieldTablesReady = todaCells[0].count > 0 && asdaCells[0].count > 0

//   return {
//     rtow_kg: Math.round(rtowKg),
//     factor,
//     wat_flap: watFlap,
//     structural_kg: structuralKg,
//     field_limit_available: fieldLimit != null,
//     field_tables_ready: fieldTablesReady,
//     field_limit_note: fieldTablesReady ? null : 'TODA/ASDA field-length charts are not fully calibrated for this aircraft.'
//   }
// }
