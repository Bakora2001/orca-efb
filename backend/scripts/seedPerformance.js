/**
 * seedPerformance.js
 * ==================
 * Node.js equivalent of import_reviewed_field_performance.py
 *
 * Reads all JSON calibration files from data/performance_calibrations/
 * and imports them into the performance_cells table.
 *
 * Usage:
 *   node scripts/seedPerformance.js
 *
 * Prerequisites:
 *   1. Database must be running (migration_v2.sql already applied)
 *   2. Aircraft must already exist in the aircraft table (run seedAircraft.js first)
 *   3. .env file must be set up with correct DB credentials
 *
 * The script maps aircraft type names (Q200, Q300) to their database UUIDs
 * by looking them up in the aircraft table by registration or type.
 *
 * NOTE: Until you share the actual JSON file format, this script includes
 * a format-detection layer that handles all three known shapes (A, B, C).
 * If your files use a different structure, paste one file's contents so
 * we can confirm the mapping is correct before running this on production.
 */

import 'dotenv/config'
import { readFileSync, readdirSync } from 'fs'
import { join, dirname, basename } from 'path'
import { fileURLToPath } from 'url'
import pg from 'pg'

const __dirname = dirname(fileURLToPath(import.meta.url))

const pool = new pg.Pool({
  host:     process.env.DB_HOST,
  port:     parseInt(process.env.DB_PORT || '5432'),
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
})

// ── Configuration ──────────────────────────────────────────────────
// Map the aircraft type prefix in calibration filenames to the
// aircraft TYPE or REGISTRATION stored in the aircraft table.
// ADJUST THESE to match your actual aircraft registrations.
const AIRCRAFT_TYPE_MAP = {
  'Q200': 'Q200',  // matches aircraft.type = 'Q200' (or DHC-8-200 etc.)
  'Q300': 'Q300',  // matches aircraft.type = 'Q300'
}

// Path to the calibration JSON files
const CALIBRATION_DIR = join(__dirname, '..', 'data', 'performance_calibrations')

// ── Helpers ────────────────────────────────────────────────────────
async function getAircraftId(client, typePrefix) {
  const typeValue = AIRCRAFT_TYPE_MAP[typePrefix]
  if (!typeValue) throw new Error(`No mapping found for aircraft prefix: ${typePrefix}`)

  const res = await client.query(
    `SELECT id, registration, type FROM aircraft
     WHERE UPPER(type) LIKE $1 OR UPPER(registration) LIKE $1
     LIMIT 1`,
    [`%${typeValue.toUpperCase()}%`]
  )
  if (res.rows.length === 0) {
    throw new Error(
      `Aircraft with type "${typeValue}" not found in database. ` +
      `Please create the aircraft record first (POST /api/aircraft).`
    )
  }
  return res.rows[0].id
}

function parseFilename(filename) {
  // Expected format: Q300_TODA_flap_10.json → { aircraftPrefix, tableType, flapSetting }
  const base = basename(filename, '.json')  // e.g. Q300_TODA_flap_10
  const parts = base.split('_')

  // Find the table type (WAT, TODA, or ASDA)
  const tableTypeIdx = parts.findIndex(p => ['WAT', 'TODA', 'ASDA'].includes(p.toUpperCase()))
  if (tableTypeIdx === -1) return null

  const aircraftPrefix = parts.slice(0, tableTypeIdx).join('_')   // e.g. Q300
  const tableType      = parts[tableTypeIdx].toUpperCase()         // e.g. TODA
  // Everything after the table type is the flap descriptor
  // e.g. ['flap', '10'] → '10'   or ['flap', '0'] → '0'
  const flapParts      = parts.slice(tableTypeIdx + 1)             // e.g. ['flap', '10']
  const flapSetting    = flapParts.join('_').replace(/^flap_?/i, '') || '0' // e.g. '10'

  return { aircraftPrefix, tableType, flapSetting }
}

function normaliseCells(jsonData) {
  // Shape C — metadata wrapper with .data field
  if (jsonData && !Array.isArray(jsonData) && jsonData.data) {
    const raw = Array.isArray(jsonData.data) ? jsonData.data : nestedToFlat(jsonData.data)
    return {
      cells: raw.map(r => ({
        elevation_ft: parseFloat(r.elevation_ft ?? r.elevation ?? r.pressure_alt_ft ?? 0),
        temp_c:       parseFloat(r.temp_c ?? r.oat_c ?? r.temperature ?? 0),
        value_kg:     parseFloat(r.value_kg ?? r.value_m ?? r.distance_m ?? r.rtow_kg ?? r.value ?? 0),
      })),
      meta: {
        weight_kg:    jsonData.weight_kg ?? null,
        source_note:  jsonData.source_note ?? jsonData.source ?? null,
        table_type:   jsonData.table_type ?? null,
        flap_setting: jsonData.flap ? String(jsonData.flap).replace(/^flap_?/i,'') : null,
      }
    }
  }
  // Shape A — flat array
  if (Array.isArray(jsonData)) {
    return {
      cells: jsonData.map(r => ({
        elevation_ft: parseFloat(r.elevation_ft ?? r.elevation ?? r.pressure_alt_ft ?? 0),
        temp_c:       parseFloat(r.temp_c ?? r.oat_c ?? r.temperature ?? 0),
        value_kg:     parseFloat(r.value_kg ?? r.value_m ?? r.distance_m ?? r.rtow_kg ?? r.value ?? 0),
      })),
      meta: {}
    }
  }
  // Shape B — nested { elevation: { temp: value } }
  return { cells: nestedToFlat(jsonData), meta: {} }
}

function nestedToFlat(obj) {
  const cells = []
  for (const elevKey of Object.keys(obj)) {
    const elevFt = parseFloat(elevKey)
    if (isNaN(elevFt)) continue
    const row = obj[elevKey]
    if (typeof row !== 'object') continue
    for (const tempKey of Object.keys(row)) {
      const tempC = parseFloat(tempKey)
      const val   = parseFloat(row[tempKey])
      if (!isNaN(tempC) && !isNaN(val)) cells.push({ elevation_ft: elevFt, temp_c: tempC, value_kg: val })
    }
  }
  return cells
}

async function upsertCells(client, aircraftId, tableType, flapSetting, weightKg, cells, sourceNote) {
  let inserted = 0, updated = 0
  for (const cell of cells) {
    const { elevation_ft, temp_c, value_kg } = cell
    if (elevation_ft == null || temp_c == null || value_kg == null || isNaN(value_kg)) continue

    const existing = await client.query(
      `SELECT id FROM performance_cells
       WHERE aircraft_id=$1 AND table_type=$2 AND flap_setting=$3
         AND elevation_ft=$4 AND temp_c=$5
         AND (weight_kg IS NOT DISTINCT FROM $6)`,
      [aircraftId, tableType, flapSetting, elevation_ft, temp_c, weightKg]
    )

    if (existing.rows.length > 0) {
      await client.query(
        `UPDATE performance_cells SET value_kg=$1, source_note=$2, updated_at=NOW() WHERE id=$3`,
        [value_kg, sourceNote, existing.rows[0].id]
      )
      updated++
    } else {
      await client.query(
        `INSERT INTO performance_cells
           (aircraft_id,table_type,flap_setting,elevation_ft,temp_c,value_kg,weight_kg,source_note)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [aircraftId, tableType, flapSetting, elevation_ft, temp_c, value_kg, weightKg, sourceNote]
      )
      inserted++
    }
  }
  return { inserted, updated }
}

// ── Main ───────────────────────────────────────────────────────────
async function main() {
  const client = await pool.connect()

  try {
    console.log('\nOrca EFB — Performance Calibration Seeder')
    console.log('────────────────────────────────────────────')

    let files
    try {
      files = readdirSync(CALIBRATION_DIR).filter(f => f.endsWith('.json'))
    } catch {
      console.error(`\n❌ Cannot read calibration directory: ${CALIBRATION_DIR}`)
      console.error('   Make sure you have the data/performance_calibrations/ folder')
      process.exit(1)
    }

    if (files.length === 0) {
      console.log('No JSON files found in', CALIBRATION_DIR)
      process.exit(0)
    }

    console.log(`Found ${files.length} calibration files\n`)

    let totalInserted = 0, totalUpdated = 0, totalErrors = 0

    for (const file of files.sort()) {
      const parsed = parseFilename(file)
      if (!parsed) {
        console.log(`Skipping ${file} — cannot parse filename`)
        continue
      }

      const { aircraftPrefix, tableType, flapSetting } = parsed

      try {
        // Resolve aircraft UUID
        const aircraftId = await getAircraftId(client, aircraftPrefix)

        // Read and parse JSON
        const raw = readFileSync(join(CALIBRATION_DIR, file), 'utf8')
        const json = JSON.parse(raw)
        const { cells, meta } = normaliseCells(json)

        // Meta from filename takes precedence over meta from JSON (filename is authoritative)
        const effectiveTableType   = tableType
        const effectiveFlapSetting = flapSetting
        const effectiveWeightKg    = meta.weight_kg ?? null
        const effectiveSourceNote  = meta.source_note ?? `Seeded from ${file}`

        const { inserted, updated } = await upsertCells(
          client,
          aircraftId,
          effectiveTableType,
          effectiveFlapSetting,
          effectiveWeightKg,
          cells,
          effectiveSourceNote
        )

        console.log(`✅ ${file.padEnd(40)} ${cells.length} cells → ${inserted} inserted, ${updated} updated`)
        totalInserted += inserted
        totalUpdated  += updated

      } catch (err) {
        console.error(`❌ ${file}: ${err.message}`)
        totalErrors++
      }
    }

    console.log('\n────────────────────────────────────────────')
    console.log(`✅ Complete: ${totalInserted} inserted, ${totalUpdated} updated, ${totalErrors} errors`)

    if (totalErrors > 0) {
      console.log('\n⚠  Some files failed. Common reasons:')
      console.log('   • Aircraft type not in database — create aircraft records first')
      console.log('   • AIRCRAFT_TYPE_MAP at top of script needs updating')
      console.log('   • JSON file format is a different shape — paste one file\'s contents so we can update the parser')
    }

  } finally {
    client.release()
    await pool.end()
  }
}

main().catch(err => {
  console.error('Fatal:', err.message)
  process.exit(1)
})