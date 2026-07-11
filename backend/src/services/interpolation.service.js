/**
 * interpolation.service.js
 * ─────────────────────────
 * Shared interpolation helpers for the RTOW / dispatch engine.
 *
 * Features:
 *   • 1D linear interpolation
 *   • 2D bilinear interpolation (sparse-grid tolerant)
 *   • Weight-limit finder for TODA / ASDA
 *   • Performance table loaders (optional DB integration)
 *
 * All interpolation functions are pure — no database calls, no side effects.
 * Loader functions accept a query function for dependency injection.
 */

// ═══════════════════════════════════════════════════════════════════════════
// 1D LINEAR INTERPOLATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 1D linear interpolation.
 * Points are sorted by x, then the segment bracketing the target is found.
 * Values outside the data bounds are clamped to the nearest edge.
 *
 * @param {Array<[number, number]>} points - Array of [x, value] pairs
 * @param {number} x - X coordinate to interpolate at
 * @returns {number|null} Interpolated value, or null if input is empty
 */
export function interp1D(points, x) {
  const pts = points
    .filter(([, v]) => v != null)
    .map(([px, v]) => [parseFloat(px), parseFloat(v)])
    .sort((a, b) => a[0] - b[0])

  if (pts.length === 0) return null

  const xVal = parseFloat(x)

  // Clamp to bounds (conservative — no extrapolation)
  if (xVal <= pts[0][0]) return pts[0][1]
  if (xVal >= pts[pts.length - 1][0]) return pts[pts.length - 1][1]

  // Find bracketing segment and interpolate
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
// 2D BILINEAR INTERPOLATION (SPARSE-GRID TOLERANT)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Given a sparse grid of { elevation_ft, temp_c, value_kg } cells,
 * return the interpolated value at (targetElevFt, targetTempC).
 *
 * Uses bilinear interpolation:
 *   1. Find the two elevation rows bracketing the target
 *   2. Linearly interpolate along temp axis at the lower elevation → v1
 *   3. Linearly interpolate along temp axis at the upper elevation → v2
 *   4. Linearly interpolate between v1 and v2 along the elevation axis
 *
 * Clamping behaviour: if the target is outside the grid bounds, the value
 * is clamped to the nearest edge (no extrapolation). This is conservative
 * for aviation use — never returns a higher RTOW than the AFM supports.
 *
 * Unlike simpler bilinear implementations, this handles sparse grids where
 * individual cells may be missing. If a corner value is unavailable, that
 * axis collapses gracefully rather than returning null.
 *
 * @param {Array<{elevation_ft: number, temp_c: number, value_kg: number}>} cells
 * @param {number} targetElevFt
 * @param {number} targetTempC
 * @returns {number|null} interpolated value, or null if grid is empty
 */
export function bilinearInterpolate(cells, targetElevFt, targetTempC) {
  if (!cells || cells.length === 0) return null

  // Get sorted unique elevation and temp values from the grid
  const elevations = [...new Set(cells.map(c => c.elevation_ft))].sort((a, b) => a - b)
  const temps      = [...new Set(cells.map(c => c.temp_c))].sort((a, b) => a - b)

  if (elevations.length === 0 || temps.length === 0) return null

  // Clamp to grid bounds
  const clampedElev = Math.max(elevations[0], Math.min(elevations[elevations.length - 1], targetElevFt))
  const clampedTemp = Math.max(temps[0], Math.min(temps[temps.length - 1], targetTempC))

  // Find bracketing elevations
  const elevLow  = _findFloor(elevations, clampedElev)
  const elevHigh = _findCeil(elevations, clampedElev)

  // Find bracketing temps
  const tempLow  = _findFloor(temps, clampedTemp)
  const tempHigh = _findCeil(temps, clampedTemp)

  // Build a quick lookup map: "elevation_temp" → value_kg
  const lookup = {}
  for (const c of cells) {
    lookup[`${c.elevation_ft}_${c.temp_c}`] = c.value_kg
  }

  const getValue = (elev, temp) => lookup[`${elev}_${temp}`] ?? null

  // Interpolate at lower elevation row
  const v_low_low  = getValue(elevLow, tempLow)
  const v_low_high = getValue(elevLow, tempHigh)
  const v1 = _linearInterp(tempLow, v_low_low, tempHigh, v_low_high, clampedTemp)

  // Interpolate at upper elevation row
  const v_high_low  = getValue(elevHigh, tempLow)
  const v_high_high = getValue(elevHigh, tempHigh)
  const v2 = _linearInterp(tempLow, v_high_low, tempHigh, v_high_high, clampedTemp)

  if (v1 === null && v2 === null) return null
  if (v1 === null) return v2
  if (v2 === null) return v1

  // Interpolate between the two elevation rows
  return _linearInterp(elevLow, v1, elevHigh, v2, clampedElev)
}

// ═══════════════════════════════════════════════════════════════════════════
// WEIGHT-LIMIT FINDER (TODA / ASDA)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * For TODA/ASDA: given a set of (weight_kg, distance_m) pairs at a specific
 * (elevation_ft, temp_c) point, find the maximum weight_kg whose interpolated
 * distance is ≤ the available runway length.
 *
 * The cells array must already be filtered to one table_type and one flap_setting.
 * Each unique weight_kg is a "slice" — a complete grid at that weight.
 *
 * Weights are processed ascending — once a weight exceeds the runway limit,
 * all heavier weights are skipped (early termination).
 *
 * @param {Array} allCells — ALL cells for this aircraft/table_type/flap
 * @param {number} elevFt  — airport elevation
 * @param {number} tempC   — OAT
 * @param {number} rwyM    — available runway in metres
 * @returns {{ weight_kg: number, distance_m: number }|null}
 */
export function findWeightLimitForRunway(allCells, elevFt, tempC, rwyM) {
  // Get all unique weight slices, sorted ascending
  const weights = [...new Set(allCells.map(c => c.weight_kg).filter(w => w != null))]
    .sort((a, b) => a - b)

  if (weights.length === 0) return null

  let bestWeight = null
  let bestDistance = null

  for (const w of weights) {
    const sliceCells = allCells.filter(c => c.weight_kg === w)
    const distM = bilinearInterpolate(sliceCells, elevFt, tempC)
    if (distM === null) continue

    if (distM <= rwyM) {
      // This weight is achievable — keep going to find the highest
      bestWeight   = w
      bestDistance = distM
    } else {
      // distM > rwyM → too heavy. All heavier slices will also exceed
      break
    }
  }

  if (bestWeight === null) return null
  return { weight_kg: bestWeight, distance_m: bestDistance }
}

// ═══════════════════════════════════════════════════════════════════════════
// 2D BILINEAR (NESTED-OBJECT FORMAT) — for backward compatibility
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 2D bilinear interpolation using a nested object table: {elev: {temp: value}}.
 * Falls back to the nearest temperature if an exact match is unavailable.
 *
 * @param {Object} table - Nested object: {elev: {temp: value}}
 * @param {number} elevFt - Elevation in feet
 * @param {number} oatC - OAT in Celsius
 * @returns {number|null} Interpolated value (rounded) or null if insufficient data
 */
export function interp2D(table, elevFt, oatC) {
  const elevs = Object.keys(table).map(parseFloat).sort((a, b) => a - b)

  const tempSet = new Set()
  Object.values(table).forEach(row => {
    Object.keys(row).forEach(t => tempSet.add(parseFloat(t)))
  })
  const temps = Array.from(tempSet).sort((a, b) => a - b)

  if (elevs.length === 0 || temps.length === 0) return null

  // Clamp to bounds
  const e = Math.max(elevs[0], Math.min(elevs[elevs.length - 1], elevFt))
  const t = Math.max(temps[0], Math.min(temps[temps.length - 1], oatC))

  // Find bracketing values
  const e1 = Math.max(...elevs.filter(x => x <= e))
  const e2 = Math.min(...elevs.filter(x => x >= e))
  const t1 = Math.max(...temps.filter(x => x <= t))
  const t2 = Math.min(...temps.filter(x => x >= t))

  // Helper with nearest-temperature fallback
  const getCell = (elev, temp) => {
    const row = table[elev] || {}
    if (row[temp] != null) return row[temp]

    const available = Object.keys(row).map(parseFloat)
    if (available.length === 0) return null

    const nearest = available.reduce((prev, curr) =>
      Math.abs(curr - temp) < Math.abs(prev - temp) ? curr : prev
    )
    return row[nearest]
  }

  const w11 = getCell(e1, t1)
  const w12 = getCell(e1, t2)
  const w21 = getCell(e2, t1)
  const w22 = getCell(e2, t2)

  if ([w11, w12, w21, w22].some(v => v == null)) return null

  const tf = (t2 === t1) ? 0 : (t - t1) / (t2 - t1)
  const ef = (e2 === e1) ? 0 : (e - e1) / (e2 - e1)

  const w1 = w11 + tf * (w12 - w11)
  const w2 = w21 + tf * (w22 - w21)

  return Math.round(w1 + ef * (w2 - w1))
}

// ═══════════════════════════════════════════════════════════════════════════
// DATABASE LOADERS (optional — inject your query function)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Load a WAT performance table from the database.
 *
 * @param {Function} query - Database query function (e.g., pool.query)
 * @param {string} aircraftId - Aircraft UUID
 * @param {string} tableType - 'WAT', 'TODA', or 'ASDA'
 * @param {number} flap - Flap setting
 * @returns {Promise<Array|null>} Flat array of cells, or null if no data
 */
export async function loadPerfTable(query, aircraftId, tableType, flap) {
  const { rows } = await query(
    `SELECT elevation_ft, temp_c, value_kg
     FROM performance_cells
     WHERE aircraft_id = $1 AND table_type = $2 AND flap_setting = $3
       AND value_kg IS NOT NULL`,
    [aircraftId, tableType, parseFloat(flap)]
  )

  if (rows.length === 0) return null

  return rows.map(r => ({
    elevation_ft: parseFloat(r.elevation_ft),
    temp_c:       parseFloat(r.temp_c),
    value_kg:     parseFloat(r.value_kg),
  }))
}

/**
 * Load a field performance table (weight-aware TODA/ASDA) from the database.
 *
 * @param {Function} query - Database query function
 * @param {string} aircraftId - Aircraft UUID
 * @param {string} tableType - 'TODA' or 'ASDA'
 * @param {number} flap - Flap setting
 * @param {number} weightKg - Weight in kg
 * @returns {Promise<Array|null>} Flat array of cells, or null if no data
 */
export async function loadFieldPerfTable(query, aircraftId, tableType, flap, weightKg) {
  const { rows } = await query(
    `SELECT elevation_ft, temp_c, value_m
     FROM field_perf_cells
     WHERE aircraft_id = $1 AND table_type = $2 AND flap_setting = $3
       AND weight_kg = $4 AND value_m IS NOT NULL
       AND (source_note LIKE '%REVIEWED%'
         OR source_note LIKE '%CALIBRATED%'
         OR source_note LIKE '%AFM%')`,
    [aircraftId, tableType, parseFloat(flap), parseFloat(weightKg)]
  )

  if (rows.length === 0) return null

  return rows.map(r => ({
    elevation_ft: parseFloat(r.elevation_ft),
    temp_c:       parseFloat(r.temp_c),
    value_m:      parseFloat(r.value_m),
  }))
}

/**
 * Get available weight slices for field performance.
 *
 * @param {Function} query - Database query function
 * @param {string} aircraftId - Aircraft UUID
 * @param {string} [tableType] - 'TODA' or 'ASDA' (optional filter)
 * @param {number} [flap] - Flap setting (optional filter)
 * @returns {Promise<number[]>} Array of weight values in kg, sorted ascending
 */
export async function getFieldWeightOptions(query, aircraftId, tableType = null, flap = null) {
  const conditions = ['aircraft_id = $1', 'value_m IS NOT NULL']
  const params = [aircraftId]
  let paramIndex = 2

  conditions.push(
    "(source_note LIKE '%REVIEWED%' OR source_note LIKE '%CALIBRATED%' OR source_note LIKE '%AFM%')"
  )

  if (tableType) {
    conditions.push(`table_type = $${paramIndex}`)
    params.push(tableType)
    paramIndex++
  }

  if (flap != null) {
    conditions.push(`flap_setting = $${paramIndex}`)
    params.push(parseFloat(flap))
  }

  const { rows } = await query(
    `SELECT DISTINCT weight_kg
     FROM field_perf_cells
     WHERE ${conditions.join(' AND ')}
     ORDER BY weight_kg`,
    params
  )

  return rows.map(r => parseFloat(r.weight_kg))
}

// ═══════════════════════════════════════════════════════════════════════════
// PRIVATE HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function _linearInterp(x0, y0, x1, y1, x) {
  if (y0 === null || y1 === null) return null
  if (x0 === x1) return y0
  return y0 + (y1 - y0) * ((x - x0) / (x1 - x0))
}

function _findFloor(sortedArr, target) {
  let result = sortedArr[0]
  for (const v of sortedArr) {
    if (v <= target) result = v
    else break
  }
  return result
}

function _findCeil(sortedArr, target) {
  for (const v of sortedArr) {
    if (v >= target) return v
  }
  return sortedArr[sortedArr.length - 1]
}

// /**
//  * Interpolation Service
//  * 
//  * Provides 1D linear and 2D bilinear interpolation for performance tables.
//  * All interpolation is clamped to the bounds of available data (no extrapolation).
//  */

// /**
//  * 1D linear interpolation
//  * @param {Array<[number, number]>} points - Array of [x, value] pairs
//  * @param {number} x - X coordinate to interpolate at
//  * @returns {number|null} Interpolated value or null if no data
//  */
// export function interp1D(points, x) {
//   // Filter out null values and convert to numbers
//   const pts = points
//     .filter(([px, v]) => v != null)
//     .map(([px, v]) => [parseFloat(px), parseFloat(v)])
//     .sort((a, b) => a[0] - b[0])

//   if (pts.length === 0) return null

//   const xVal = parseFloat(x)

//   // Clamp to bounds (no extrapolation)
//   if (xVal <= pts[0][0]) return pts[0][1]
//   if (xVal >= pts[pts.length - 1][0]) return pts[pts.length - 1][1]

//   // Find bracketing points and interpolate
//   for (let i = 0; i < pts.length - 1; i++) {
//     const [x1, y1] = pts[i]
//     const [x2, y2] = pts[i + 1]

//     if (x1 <= xVal && xVal <= x2) {
//       const span = x2 - x1
//       const frac = span === 0 ? 0 : (xVal - x1) / span
//       return y1 + frac * (y2 - y1)
//     }
//   }

//   return pts[pts.length - 1][1]
// }

// /**
//  * 2D bilinear interpolation
//  * @param {Object} table - Nested object: {elev: {temp: value}}
//  * @param {number} elevFt - Elevation in feet
//  * @param {number} oatC - OAT in Celsius
//  * @returns {number|null} Interpolated value (rounded) or null if insufficient data
//  */
// export function interp2D(table, elevFt, oatC) {
//   const elevs = Object.keys(table).map(parseFloat).sort((a, b) => a - b)
  
//   // Get all temperature keys (union across all elevation rows)
//   const tempSet = new Set()
//   Object.values(table).forEach(row => {
//     Object.keys(row).forEach(t => tempSet.add(parseFloat(t)))
//   })
//   const temps = Array.from(tempSet).sort((a, b) => a - b)

//   if (elevs.length === 0 || temps.length === 0) return null

//   // Clamp to bounds
//   const e = Math.max(elevs[0], Math.min(elevs[elevs.length - 1], elevFt))
//   const t = Math.max(temps[0], Math.min(temps[temps.length - 1], oatC))

//   // Find bracketing elevation and temperature values
//   const e1 = Math.max(...elevs.filter(x => x <= e))
//   const e2 = Math.min(...elevs.filter(x => x >= e))
//   const t1 = Math.max(...temps.filter(x => x <= t))
//   const t2 = Math.min(...temps.filter(x => x >= t))

//   // Helper to get cell value with nearest-temp fallback
//   const getCell = (elev, temp) => {
//     const row = table[elev] || {}
//     if (row[temp] != null) return row[temp]
    
//     // Nearest temperature fallback if exact temp not available
//     const available = Object.keys(row).map(parseFloat)
//     if (available.length === 0) return null
    
//     const nearest = available.reduce((prev, curr) => 
//       Math.abs(curr - temp) < Math.abs(prev - temp) ? curr : prev
//     )
//     return row[nearest]
//   }

//   // Get corner values
//   const w11 = getCell(e1, t1)
//   const w12 = getCell(e1, t2)
//   const w21 = getCell(e2, t1)
//   const w22 = getCell(e2, t2)

//   // Return null if any corner is missing
//   if ([w11, w12, w21, w22].some(v => v == null)) return null

//   // Bilinear interpolation
//   const tf = (t2 === t1) ? 0 : (t - t1) / (t2 - t1)
//   const ef = (e2 === e1) ? 0 : (e - e1) / (e2 - e1)

//   const w1 = w11 + tf * (w12 - w11)
//   const w2 = w21 + tf * (w22 - w21)

//   return Math.round(w1 + ef * (w2 - w1))
// }

// /**
//  * Load performance table from database
//  * @param {Function} query - Database query function
//  * @param {string} aircraftId - Aircraft UUID
//  * @param {string} tableType - 'WAT', 'TODA', or 'ASDA'
//  * @param {number} flap - Flap setting
//  * @returns {Promise<Object|null>} Table as {elev: {temp: value}} or null
//  */
// export async function loadPerfTable(query, aircraftId, tableType, flap) {
//   const { rows } = await query(
//     `SELECT elevation_ft, temp_c, value_kg
//      FROM performance_cells
//      WHERE aircraft_id = $1 AND table_type = $2 AND flap_setting = $3 AND value_kg IS NOT NULL`,
//     [aircraftId, tableType, parseFloat(flap)]
//   )

//   if (rows.length === 0) return null

//   const table = {}
//   rows.forEach(r => {
//     const elev = parseFloat(r.elevation_ft)
//     const temp = parseFloat(r.temp_c)
//     const value = parseFloat(r.value_kg)
    
//     if (!table[elev]) table[elev] = {}
//     table[elev][temp] = value
//   })

//   return table
// }

// /**
//  * Load field performance table (weight-aware TODA/ASDA)
//  * @param {Function} query - Database query function
//  * @param {string} aircraftId - Aircraft UUID
//  * @param {string} tableType - 'TODA' or 'ASDA'
//  * @param {number} flap - Flap setting
//  * @param {number} weightKg - Weight in kg
//  * @returns {Promise<Object|null>} Table as {elev: {temp: distance_m}} or null
//  */
// export async function loadFieldPerfTable(query, aircraftId, tableType, flap, weightKg) {
//   // Only use reviewed/calibrated field performance data
//   const { rows } = await query(
//     `SELECT elevation_ft, temp_c, value_m
//      FROM field_perf_cells
//      WHERE aircraft_id = $1 AND table_type = $2 AND flap_setting = $3 
//        AND weight_kg = $4 AND value_m IS NOT NULL
//        AND (source_note LIKE '%REVIEWED%' OR source_note LIKE '%CALIBRATED%' OR source_note LIKE '%AFM%')`,
//     [aircraftId, tableType, parseFloat(flap), parseFloat(weightKg)]
//   )

//   if (rows.length === 0) return null

//   const table = {}
//   rows.forEach(r => {
//     const elev = parseFloat(r.elevation_ft)
//     const temp = parseFloat(r.temp_c)
//     const value = parseFloat(r.value_m)
    
//     if (!table[elev]) table[elev] = {}
//     table[elev][temp] = value
//   })

//   return table
// }

// /**
//  * Get available weight slices for field performance
//  * @param {Function} query - Database query function
//  * @param {string} aircraftId - Aircraft UUID
//  * @param {string} tableType - 'TODA' or 'ASDA' (optional)
//  * @param {number} flap - Flap setting (optional)
//  * @returns {Promise<number[]>} Array of weight values in kg
//  */
// export async function getFieldWeightOptions(query, aircraftId, tableType = null, flap = null) {
//   const conditions = ['aircraft_id = $1', 'value_m IS NOT NULL']
//   const params = [aircraftId]
//   let paramIndex = 2

//   // Only use reviewed field performance
//   conditions.push("(source_note LIKE '%REVIEWED%' OR source_note LIKE '%CALIBRATED%' OR source_note LIKE '%AFM%')")

//   if (tableType) {
//     conditions.push(`table_type = $${paramIndex}`)
//     params.push(tableType)
//     paramIndex++
//   }

//   if (flap != null) {
//     conditions.push(`flap_setting = $${paramIndex}`)
//     params.push(parseFloat(flap))
//   }

//   const { rows } = await query(
//     `SELECT DISTINCT weight_kg
//      FROM field_perf_cells
//      WHERE ${conditions.join(' AND ')}
//      ORDER BY weight_kg`,
//     params
//   )

//   return rows.map(r => parseFloat(r.weight_kg))
// }
