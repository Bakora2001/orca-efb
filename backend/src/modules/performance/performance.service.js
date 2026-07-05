import { query } from '../../config/database.js'
import AppError from '../../utils/AppError.js'

// ─── Get all performance cells for an aircraft ────────────────────
// Returns cells grouped by table_type → flap_setting → cells[]
// This is what the perf.html grid editor loads on page open.
export async function getCellsForAircraft(aircraftId) {
  const { rows } = await query(
    `SELECT id, table_type, flap_setting, elevation_ft, temp_c,
            value_kg, weight_kg, source_note
     FROM performance_cells
     WHERE aircraft_id = $1
     ORDER BY table_type ASC, flap_setting ASC, elevation_ft ASC, temp_c ASC`,
    [aircraftId]
  )

  // Group into { WAT: { auto: [...], '5': [...] }, TODA: {...}, ASDA: {...} }
  const grouped = {}
  for (const row of rows) {
    if (!grouped[row.table_type]) grouped[row.table_type] = {}
    const flap = row.flap_setting
    if (!grouped[row.table_type][flap]) grouped[row.table_type][flap] = []
    grouped[row.table_type][flap].push(row)
  }
  return grouped
}

// ─── Batch upsert performance cells ──────────────────────────────
// This is the main save endpoint used by both the admin grid UI
// and the JSON calibration file importer.
//
// cells: [{ elevation_ft, temp_c, value_kg }]
// weight_kg is null for WAT; required for TODA/ASDA (each weight slice is separate)
export async function batchUpsertCells(aircraftId, {
  table_type,
  flap_setting,
  weight_kg = null,
  cells,
  source_note = null,
}) {
  if (!['WAT', 'TODA', 'ASDA'].includes(table_type)) {
    throw new AppError('table_type must be WAT, TODA, or ASDA', 400)
  }
  if (!Array.isArray(cells) || cells.length === 0) {
    throw new AppError('cells must be a non-empty array', 400)
  }

  // Confirm aircraft exists
  const aircraft = await query('SELECT id FROM aircraft WHERE id = $1', [aircraftId])
  if (aircraft.rows.length === 0) throw new AppError('Aircraft not found', 404)

  let inserted = 0
  let updated  = 0

  for (const cell of cells) {
    const { elevation_ft, temp_c, value_kg } = cell
    if (elevation_ft == null || temp_c == null || value_kg == null) continue

    const existing = await query(
      `SELECT id FROM performance_cells
       WHERE aircraft_id = $1
         AND table_type  = $2
         AND flap_setting = $3
         AND elevation_ft = $4
         AND temp_c       = $5
         AND (weight_kg IS NOT DISTINCT FROM $6)`,
      [aircraftId, table_type, flap_setting, elevation_ft, temp_c, weight_kg]
    )

    if (existing.rows.length > 0) {
      await query(
        `UPDATE performance_cells
         SET value_kg = $1, source_note = $2, updated_at = NOW()
         WHERE id = $3`,
        [value_kg, source_note, existing.rows[0].id]
      )
      updated++
    } else {
      await query(
        `INSERT INTO performance_cells
           (aircraft_id, table_type, flap_setting, elevation_ft, temp_c,
            value_kg, weight_kg, source_note)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [aircraftId, table_type, flap_setting, elevation_ft, temp_c,
         value_kg, weight_kg, source_note]
      )
      inserted++
    }
  }

  return { inserted, updated, total: cells.length }
}

// ─── Delete all cells for one table/flap combination ─────────────
// Used when an admin wants to re-enter a specific grid from scratch.
export async function deleteCellsForFlap(aircraftId, tableType, flapSetting, weightKg = null) {
  const { rowCount } = await query(
    `DELETE FROM performance_cells
     WHERE aircraft_id  = $1
       AND table_type   = $2
       AND flap_setting = $3
       AND (weight_kg IS NOT DISTINCT FROM $4)`,
    [aircraftId, tableType, flapSetting, weightKg]
  )
  return { deleted: rowCount }
}

// ─── Delete ALL cells for an aircraft ────────────────────────────
export async function deleteAllCellsForAircraft(aircraftId) {
  const { rowCount } = await query(
    'DELETE FROM performance_cells WHERE aircraft_id = $1',
    [aircraftId]
  )
  return { deleted: rowCount }
}

// ─── Import from JSON calibration file format ────────────────────
// This is what the Python import_reviewed_field_performance.py does.
// We'll support two common JSON shapes:
//
// Shape A — flat array (most common from digitization scripts):
// [
//   { "elevation_ft": 0,    "temp_c": 10, "value_kg": 12800 },
//   { "elevation_ft": 0,    "temp_c": 15, "value_kg": 12650 },
//   { "elevation_ft": 1000, "temp_c": 10, "value_kg": 12500 },
//   ...
// ]
//
// Shape B — nested object:
// {
//   "0":    { "10": 12800, "15": 12650, "20": 12500 },
//   "1000": { "10": 12500, "15": 12350, "20": 12200 },
//   ...
// }
//
// Shape C — calibration output with metadata wrapper:
// {
//   "aircraft": "Q300",
//   "table_type": "TODA",
//   "flap": "flap_10",
//   "weight_kg": 19500,
//   "source_note": "Digitized from Q300 AFM Fig 4-12",
//   "data": [ { "elevation_ft": ..., "temp_c": ..., "value_m": ... } ]
// }
// Note: value_m (metres) is converted to kg for TODA/ASDA via the weight_kg slice.
// For TODA/ASDA the grid stores runway distance (metres) not weight — BUT
// we store them as value_kg in the same column to keep schema simple.
// TODA/ASDA cells: value_kg actually stores the distance in METRES.
// The compute engine knows to treat TODA/ASDA values as distances.
//
// UPDATE: After seeing actual file format, we'll normalise whatever shape to flat array.

export async function importFromCalibrationJson(
  aircraftId,
  jsonData,
  { table_type, flap_setting, weight_kg = null, source_note = null } = {}
) {
  let cells = []
  let effectiveTableType   = table_type
  let effectiveFlapSetting = flap_setting
  let effectiveWeightKg    = weight_kg
  let effectiveSourceNote  = source_note

  // ── Detect Shape C (metadata wrapper) ────────────────────────
  if (jsonData && typeof jsonData === 'object' && !Array.isArray(jsonData) && jsonData.data) {
    effectiveTableType   = jsonData.table_type   || table_type
    effectiveSourceNote  = jsonData.source_note  || source_note
    effectiveWeightKg    = jsonData.weight_kg    != null ? jsonData.weight_kg : weight_kg

    // Normalise flap field — could be "flap_10", "10", 10
    const rawFlap = jsonData.flap || jsonData.flap_setting || flap_setting
    effectiveFlapSetting = String(rawFlap).replace(/^flap_/i, '')

    const rawData = jsonData.data
    if (Array.isArray(rawData)) {
      cells = rawData.map(r => ({
        elevation_ft: parseFloat(r.elevation_ft ?? r.elevation ?? r.pressure_alt_ft ?? 0),
        temp_c:       parseFloat(r.temp_c ?? r.oat_c ?? r.temperature ?? 0),
        value_kg:     parseFloat(r.value_kg ?? r.value_m ?? r.distance_m ?? r.rtow_kg ?? r.value ?? 0),
      }))
    } else {
      // Shape B inside data
      cells = nestedToCells(rawData)
    }
  }
  // ── Detect Shape A (flat array) ───────────────────────────────
  else if (Array.isArray(jsonData)) {
    cells = jsonData.map(r => ({
      elevation_ft: parseFloat(r.elevation_ft ?? r.elevation ?? r.pressure_alt_ft ?? 0),
      temp_c:       parseFloat(r.temp_c ?? r.oat_c ?? r.temperature ?? 0),
      value_kg:     parseFloat(r.value_kg ?? r.value_m ?? r.distance_m ?? r.rtow_kg ?? r.value ?? 0),
    }))
  }
  // ── Detect Shape B (nested object) ───────────────────────────
  else if (jsonData && typeof jsonData === 'object') {
    cells = nestedToCells(jsonData)
  }

  if (cells.length === 0) {
    throw new AppError('No valid cells found in JSON data. Check the file format.', 400)
  }
  if (!effectiveTableType) {
    throw new AppError('table_type is required (WAT, TODA, or ASDA)', 400)
  }
  if (!effectiveFlapSetting) {
    throw new AppError('flap_setting is required', 400)
  }

  return batchUpsertCells(aircraftId, {
    table_type:   effectiveTableType.toUpperCase(),
    flap_setting: String(effectiveFlapSetting),
    weight_kg:    effectiveWeightKg,
    cells,
    source_note:  effectiveSourceNote,
  })
}

// Helper: convert nested { elevation: { temp: value } } to flat cells array
function nestedToCells(obj) {
  const cells = []
  for (const elevKey of Object.keys(obj)) {
    const elevFt = parseFloat(elevKey)
    if (isNaN(elevFt)) continue
    const tempRow = obj[elevKey]
    if (typeof tempRow !== 'object') continue
    for (const tempKey of Object.keys(tempRow)) {
      const tempC = parseFloat(tempKey)
      const val   = parseFloat(tempRow[tempKey])
      if (!isNaN(tempC) && !isNaN(val)) {
        cells.push({ elevation_ft: elevFt, temp_c: tempC, value_kg: val })
      }
    }
  }
  return cells
}

// ─── Get performance summary counts (used by aircraft card) ──────
export async function getPerformanceSummary(aircraftId) {
  const { rows } = await query(
    `SELECT table_type, flap_setting, weight_kg, COUNT(*) as cell_count
     FROM performance_cells
     WHERE aircraft_id = $1
     GROUP BY table_type, flap_setting, weight_kg
     ORDER BY table_type, flap_setting`,
    [aircraftId]
  )
  return rows
}