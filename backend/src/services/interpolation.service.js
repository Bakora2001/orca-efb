/**
 * Interpolation Service
 * 
 * Provides 1D linear and 2D bilinear interpolation for performance tables.
 * All interpolation is clamped to the bounds of available data (no extrapolation).
 */

/**
 * 1D linear interpolation
 * @param {Array<[number, number]>} points - Array of [x, value] pairs
 * @param {number} x - X coordinate to interpolate at
 * @returns {number|null} Interpolated value or null if no data
 */
export function interp1D(points, x) {
  // Filter out null values and convert to numbers
  const pts = points
    .filter(([px, v]) => v != null)
    .map(([px, v]) => [parseFloat(px), parseFloat(v)])
    .sort((a, b) => a[0] - b[0])

  if (pts.length === 0) return null

  const xVal = parseFloat(x)

  // Clamp to bounds (no extrapolation)
  if (xVal <= pts[0][0]) return pts[0][1]
  if (xVal >= pts[pts.length - 1][0]) return pts[pts.length - 1][1]

  // Find bracketing points and interpolate
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

/**
 * 2D bilinear interpolation
 * @param {Object} table - Nested object: {elev: {temp: value}}
 * @param {number} elevFt - Elevation in feet
 * @param {number} oatC - OAT in Celsius
 * @returns {number|null} Interpolated value (rounded) or null if insufficient data
 */
export function interp2D(table, elevFt, oatC) {
  const elevs = Object.keys(table).map(parseFloat).sort((a, b) => a - b)
  
  // Get all temperature keys (union across all elevation rows)
  const tempSet = new Set()
  Object.values(table).forEach(row => {
    Object.keys(row).forEach(t => tempSet.add(parseFloat(t)))
  })
  const temps = Array.from(tempSet).sort((a, b) => a - b)

  if (elevs.length === 0 || temps.length === 0) return null

  // Clamp to bounds
  const e = Math.max(elevs[0], Math.min(elevs[elevs.length - 1], elevFt))
  const t = Math.max(temps[0], Math.min(temps[temps.length - 1], oatC))

  // Find bracketing elevation and temperature values
  const e1 = Math.max(...elevs.filter(x => x <= e))
  const e2 = Math.min(...elevs.filter(x => x >= e))
  const t1 = Math.max(...temps.filter(x => x <= t))
  const t2 = Math.min(...temps.filter(x => x >= t))

  // Helper to get cell value with nearest-temp fallback
  const getCell = (elev, temp) => {
    const row = table[elev] || {}
    if (row[temp] != null) return row[temp]
    
    // Nearest temperature fallback if exact temp not available
    const available = Object.keys(row).map(parseFloat)
    if (available.length === 0) return null
    
    const nearest = available.reduce((prev, curr) => 
      Math.abs(curr - temp) < Math.abs(prev - temp) ? curr : prev
    )
    return row[nearest]
  }

  // Get corner values
  const w11 = getCell(e1, t1)
  const w12 = getCell(e1, t2)
  const w21 = getCell(e2, t1)
  const w22 = getCell(e2, t2)

  // Return null if any corner is missing
  if ([w11, w12, w21, w22].some(v => v == null)) return null

  // Bilinear interpolation
  const tf = (t2 === t1) ? 0 : (t - t1) / (t2 - t1)
  const ef = (e2 === e1) ? 0 : (e - e1) / (e2 - e1)

  const w1 = w11 + tf * (w12 - w11)
  const w2 = w21 + tf * (w22 - w21)

  return Math.round(w1 + ef * (w2 - w1))
}

/**
 * Load performance table from database
 * @param {Function} query - Database query function
 * @param {string} aircraftId - Aircraft UUID
 * @param {string} tableType - 'WAT', 'TODA', or 'ASDA'
 * @param {number} flap - Flap setting
 * @returns {Promise<Object|null>} Table as {elev: {temp: value}} or null
 */
export async function loadPerfTable(query, aircraftId, tableType, flap) {
  const { rows } = await query(
    `SELECT elevation_ft, temp_c, value_kg
     FROM performance_cells
     WHERE aircraft_id = $1 AND table_type = $2 AND flap_setting = $3 AND value_kg IS NOT NULL`,
    [aircraftId, tableType, parseFloat(flap)]
  )

  if (rows.length === 0) return null

  const table = {}
  rows.forEach(r => {
    const elev = parseFloat(r.elevation_ft)
    const temp = parseFloat(r.temp_c)
    const value = parseFloat(r.value_kg)
    
    if (!table[elev]) table[elev] = {}
    table[elev][temp] = value
  })

  return table
}

/**
 * Load field performance table (weight-aware TODA/ASDA)
 * @param {Function} query - Database query function
 * @param {string} aircraftId - Aircraft UUID
 * @param {string} tableType - 'TODA' or 'ASDA'
 * @param {number} flap - Flap setting
 * @param {number} weightKg - Weight in kg
 * @returns {Promise<Object|null>} Table as {elev: {temp: distance_m}} or null
 */
export async function loadFieldPerfTable(query, aircraftId, tableType, flap, weightKg) {
  // Only use reviewed/calibrated field performance data
  const { rows } = await query(
    `SELECT elevation_ft, temp_c, value_m
     FROM field_perf_cells
     WHERE aircraft_id = $1 AND table_type = $2 AND flap_setting = $3 
       AND weight_kg = $4 AND value_m IS NOT NULL
       AND (source_note LIKE '%REVIEWED%' OR source_note LIKE '%CALIBRATED%' OR source_note LIKE '%AFM%')`,
    [aircraftId, tableType, parseFloat(flap), parseFloat(weightKg)]
  )

  if (rows.length === 0) return null

  const table = {}
  rows.forEach(r => {
    const elev = parseFloat(r.elevation_ft)
    const temp = parseFloat(r.temp_c)
    const value = parseFloat(r.value_m)
    
    if (!table[elev]) table[elev] = {}
    table[elev][temp] = value
  })

  return table
}

/**
 * Get available weight slices for field performance
 * @param {Function} query - Database query function
 * @param {string} aircraftId - Aircraft UUID
 * @param {string} tableType - 'TODA' or 'ASDA' (optional)
 * @param {number} flap - Flap setting (optional)
 * @returns {Promise<number[]>} Array of weight values in kg
 */
export async function getFieldWeightOptions(query, aircraftId, tableType = null, flap = null) {
  const conditions = ['aircraft_id = $1', 'value_m IS NOT NULL']
  const params = [aircraftId]
  let paramIndex = 2

  // Only use reviewed field performance
  conditions.push("(source_note LIKE '%REVIEWED%' OR source_note LIKE '%CALIBRATED%' OR source_note LIKE '%AFM%')")

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
