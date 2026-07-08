/**
 * RTOW (Regulated Take-Off Weight) Computation Service
 * 
 * Computes the maximum take-off weight considering:
 * - Structural limit (MTOW)
 * - WAT (Weight-Altitude-Temperature) limit
 * - TODA (Take-Off Distance Available) field limit
 * - ASDA (Accelerate-Stop Distance Available) field limit
 * 
 * The RTOW is the minimum of all applicable limits.
 */

import { query } from '../config/database.js'
import { 
  interp1D, 
  interp2D, 
  loadPerfTable, 
  loadFieldPerfTable, 
  getFieldWeightOptions 
} from './interpolation.service.js'

const LB_TO_KG = 0.453592

/**
 * Get best WAT limit across all available flaps
 */
async function getBestWAT(aircraft, elevFt, oatC) {
  const flaps = Array.isArray(aircraft.flaps) ? aircraft.flaps : JSON.parse(aircraft.flaps || '[]')
  const structuralKg = Math.round(parseFloat(aircraft.mtow_kg))

  let best = 0
  let bestFlap = null

  for (const flap of flaps) {
    const table = await loadPerfTable(query, aircraft.id, 'WAT', parseFloat(flap))
    if (!table) continue

    const wat = interp2D(table, elevFt, oatC)
    if (wat && wat > best) {
      best = wat
      bestFlap = parseFloat(flap)
    }
  }

  if (best === 0) {
    return { wat: structuralKg, flap: null } // No WAT data → structural only
  }

  return { wat: Math.min(best, structuralKg), flap: bestFlap }
}

/**
 * Get airport-specific field limit (pre-calibrated for specific runway/airport)
 */
async function getAirportFieldLimit(aircraft, airport, oatC, tableType, forceFlap = null) {
  if (!['TODA', 'ASDA'].includes(tableType)) return null

  const flaps = forceFlap != null && forceFlap !== 'auto'
    ? [parseFloat(forceFlap)]
    : (Array.isArray(aircraft.flaps) ? aircraft.flaps : JSON.parse(aircraft.flaps || '[]'))

  const structuralKg = Math.round(parseFloat(aircraft.mtow_kg))
  let best = null

  for (const flap of flaps) {
    const { rows } = await query(
      `SELECT oat_c, limit_kg
       FROM airport_field_limits
       WHERE aircraft_id = $1 AND airport_id = $2 AND table_type = $3 AND flap = $4
         AND limit_kg IS NOT NULL
         AND (source_note LIKE '%REVIEWED%' OR source_note LIKE '%CALIBRATED%' OR source_note LIKE '%AFM%')`,
      [aircraft.id, airport.id, tableType, parseFloat(flap)]
    )

    const points = rows.map(r => [parseFloat(r.oat_c), parseFloat(r.limit_kg)])
    const value = interp1D(points, oatC)

    if (value != null && (best == null || value > best)) {
      best = value
    }
  }

  if (best == null) return null

  return Math.max(0, Math.min(Math.round(best), structuralKg))
}

/**
 * Compute field limit from weight-aware TODA/ASDA grids
 */
async function fieldLimitFromWeightSlices(aircraft, airport, oatC, effRunwayM, flaps, tableType = null) {
  const structuralKg = Math.round(parseFloat(aircraft.mtow_kg))
  let best = null

  for (const flap of flaps) {
    // Get available weight slices
    let weights
    if (tableType) {
      weights = await getFieldWeightOptions(query, aircraft.id, tableType, flap)
    } else {
      const todaWeights = new Set(await getFieldWeightOptions(query, aircraft.id, 'TODA', flap))
      const asdaWeights = new Set(await getFieldWeightOptions(query, aircraft.id, 'ASDA', flap))
      weights = Array.from(todaWeights).filter(w => asdaWeights.has(w)).sort((a, b) => a - b)
    }

    const points = []

    for (const weight of weights) {
      let required

      if (tableType) {
        const table = await loadFieldPerfTable(query, aircraft.id, tableType, flap, weight)
        if (!table) continue
        required = interp2D(table, airport.elevation_ft, oatC)
      } else {
        const todaTable = await loadFieldPerfTable(query, aircraft.id, 'TODA', flap, weight)
        const asdaTable = await loadFieldPerfTable(query, aircraft.id, 'ASDA', flap, weight)
        if (!todaTable || !asdaTable) continue

        const tr = interp2D(todaTable, airport.elevation_ft, oatC)
        const ar = interp2D(asdaTable, airport.elevation_ft, oatC)
        required = (tr != null && ar != null) ? Math.max(tr, ar) : null
      }

      if (required == null) continue
      points.push([parseFloat(weight), parseFloat(required)])
    }

    if (points.length === 0) continue

    points.sort((a, b) => a[0] - b[0])

    // Find usable weights (where required distance ≤ available runway)
    const usable = points.filter(([w, d]) => d <= effRunwayM)

    let cap = null

    if (usable.length > 0) {
      // Take the heaviest usable weight
      cap = usable[usable.length - 1][0]

      // Check if we can interpolate to a heavier weight
      const heavier = points.find(([w, d]) => w > cap)
      if (heavier && heavier[1] > usable[usable.length - 1][1]) {
        const [loW, loD] = usable[usable.length - 1]
        const [hiW, hiD] = heavier
        const frac = (effRunwayM - loD) / (hiD - loD)
        cap = loW + frac * (hiW - loW)
      }
    } else if (points.length >= 2 && points[1][1] !== points[0][1]) {
      // Conservative low-end extrapolation for short runways
      const [loW, loD] = points[0]
      const [hiW, hiD] = points[1]
      const frac = (effRunwayM - loD) / (hiD - loD)
      cap = loW + frac * (hiW - loW)
    } else if (points.length > 0 && points[0][1] <= effRunwayM) {
      cap = points[0][0]
    }

    if (cap == null) continue

    cap = Math.max(0, Math.min(Math.round(cap), structuralKg))
    if (best == null || cap > best) {
      best = cap
    }
  }

  return best
}

/**
 * Get single field limit (TODA or ASDA)
 */
async function getSingleFieldLimit(aircraft, airport, oatC, tableType, forceFlap = null) {
  // Check for airport-specific limit first
  const airportLimit = await getAirportFieldLimit(aircraft, airport, oatC, tableType, forceFlap)
  if (airportLimit != null) return airportLimit

  const flaps = forceFlap != null && forceFlap !== 'auto'
    ? [parseFloat(forceFlap)]
    : (Array.isArray(aircraft.flaps) ? aircraft.flaps : JSON.parse(aircraft.flaps || '[]'))

  if (!['TODA', 'ASDA'].includes(tableType) || !airport.rwy_m) return null

  // Get config for surface factor
  const { rows: configRows } = await query('SELECT key, value FROM app_config WHERE key = $1', ['surface_factor'])
  const surfaceFactor = airport.surface && airport.surface.toUpperCase().includes('MURRAM')
    ? parseFloat(configRows.find(r => r.key === 'surface_factor')?.value || '1.12')
    : 1.0

  const effRunwayM = parseFloat(airport.rwy_m) / surfaceFactor

  return await fieldLimitFromWeightSlices(aircraft, airport, oatC, effRunwayM, flaps, tableType)
}

/**
 * Get combined field limit (lower of TODA and ASDA)
 */
async function getFieldLimit(aircraft, airport, oatC, forceFlap = null) {
  // Check for airport-specific limits first
  const todaAirport = await getAirportFieldLimit(aircraft, airport, oatC, 'TODA', forceFlap)
  const asdaAirport = await getAirportFieldLimit(aircraft, airport, oatC, 'ASDA', forceFlap)
  
  const airportLimits = [todaAirport, asdaAirport].filter(v => v != null)
  if (airportLimits.length > 0) {
    return Math.min(...airportLimits)
  }

  const flaps = forceFlap != null && forceFlap !== 'auto'
    ? [parseFloat(forceFlap)]
    : (Array.isArray(aircraft.flaps) ? aircraft.flaps : JSON.parse(aircraft.flaps || '[]'))

  // Get surface factor
  const { rows: configRows } = await query('SELECT key, value FROM app_config')
  const config = Object.fromEntries(configRows.map(r => [r.key, r.value]))
  
  const surfaceFactor = airport.surface && airport.surface.toUpperCase().includes('MURRAM')
    ? parseFloat(config.surface_factor_murram || config.surface_factor || '1.12')
    : 1.0

  if (!airport.rwy_m) return null

  const effRunwayM = parseFloat(airport.rwy_m) / surfaceFactor

  const weighted = await fieldLimitFromWeightSlices(aircraft, airport, oatC, effRunwayM, flaps)
  return weighted // Don't fall back to legacy TODA/ASDA without weight dimension
}

/**
 * Compute RTOW with breakdown
 */
export async function computeRTOWBreakdown(aircraft, airport, oatC, forceFlap = null) {
  const structuralKg = Math.round(parseFloat(aircraft.mtow_kg))

  // WAT limit
  let watKg, watFlap
  if (forceFlap != null && forceFlap !== 'auto') {
    const flap = parseFloat(forceFlap)
    const table = await loadPerfTable(query, aircraft.id, 'WAT', flap)
    const wat = table ? interp2D(table, airport.elevation_ft, oatC) : null
    watKg = wat ? Math.min(wat, structuralKg) : structuralKg
    watFlap = (table && wat < structuralKg) ? flap : null
  } else {
    const result = await getBestWAT(aircraft, airport.elevation_ft, oatC)
    watKg = result.wat
    watFlap = result.flap
  }

  // Field limits
  const todaKg = await getSingleFieldLimit(aircraft, airport, oatC, 'TODA', forceFlap)
  const asdaKg = await getSingleFieldLimit(aircraft, airport, oatC, 'ASDA', forceFlap)

  // Find minimum
  const candidates = [
    ['STRUCTURAL', structuralKg],
    ['WAT', watKg]
  ]

  if (todaKg != null) candidates.push(['TODA', todaKg])
  if (asdaKg != null) candidates.push(['ASDA', asdaKg])

  const [factor, rtowKg] = candidates.reduce((min, curr) => curr[1] < min[1] ? curr : min)

  return {
    structural_kg: structuralKg,
    wat_kg: watKg != null ? Math.round(watKg) : null,
    wat_flap: watFlap,
    toda_kg: todaKg != null ? Math.round(todaKg) : null,
    asda_kg: asdaKg != null ? Math.round(asdaKg) : null,
    rtow_kg: Math.round(rtowKg),
    factor
  }
}

/**
 * Compute RTOW (main API function)
 */
export async function computeRTOW(aircraft, airport, oatC, forceFlap = null) {
  const structuralKg = Math.round(parseFloat(aircraft.mtow_kg))

  // WAT limit
  let watKg, watFlap
  if (forceFlap != null && forceFlap !== 'auto') {
    const flap = parseFloat(forceFlap)
    const table = await loadPerfTable(query, aircraft.id, 'WAT', flap)
    const wat = table ? interp2D(table, airport.elevation_ft, oatC) : null
    watKg = wat ? Math.min(wat, structuralKg) : structuralKg
    watFlap = (table && wat < structuralKg) ? flap : null
  } else {
    const result = await getBestWAT(aircraft, airport.elevation_ft, oatC)
    watKg = result.wat
    watFlap = result.flap
  }

  let rtowKg = structuralKg
  let factor = 'STRUCTURAL'

  // Check WAT limit
  if (watKg < structuralKg - 5) {
    rtowKg = watKg
    factor = 'WAT'
  } else {
    watFlap = null
  }

  // Check field limit
  const fieldLimit = await getFieldLimit(aircraft, airport, oatC, forceFlap)
  if (fieldLimit != null && fieldLimit < rtowKg) {
    rtowKg = fieldLimit
    factor = 'FIELD LENGTH'
    watFlap = null
  }

  // Get field table coverage
  const { rows: todaCells } = await query(
    'SELECT COUNT(*) as count FROM performance_cells WHERE aircraft_id = $1 AND table_type = $2',
    [aircraft.id, 'TODA']
  )
  const { rows: asdaCells } = await query(
    'SELECT COUNT(*) as count FROM performance_cells WHERE aircraft_id = $1 AND table_type = $2',
    [aircraft.id, 'ASDA']
  )

  const fieldTablesReady = todaCells[0].count > 0 && asdaCells[0].count > 0

  return {
    rtow_kg: Math.round(rtowKg),
    factor,
    wat_flap: watFlap,
    structural_kg: structuralKg,
    field_limit_available: fieldLimit != null,
    field_tables_ready: fieldTablesReady,
    field_limit_note: fieldTablesReady ? null : 'TODA/ASDA field-length charts are not fully calibrated for this aircraft.'
  }
}
