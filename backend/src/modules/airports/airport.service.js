import { query } from '../../config/database.js'
import AppError from '../../utils/AppError.js'
import { parse } from 'csv-parse/sync'

// ─── Basic CRUD ────────────────────────────────────────────────────────────────

export async function getAllAirports() {
  const { rows } = await query(
    `SELECT id, icao_code, iata_code, name, city, country, country_iso,
            lat, lon, elevation_ft, timezone, source,
            rwy_m, rwy_desc, surface, fuel, region,
            runways, remarks, notam_notes, is_active
     FROM airports
     WHERE is_active = true
     ORDER BY name ASC`
  )
  return rows
}

export async function searchAirports(q, limit = 30) {
  if (!q || q.trim().length < 2) {
    // Return first `limit` airports when no query (preload pickers)
    const { rows } = await query(
      `SELECT id, icao_code, iata_code, name, city, country,
              lat, lon, elevation_ft, rwy_m, rwy_desc, surface, fuel, source, remarks
       FROM airports WHERE is_active = true
       ORDER BY name ASC LIMIT $1`,
      [limit]
    )
    return rows
  }

  const term = `%${q.trim().toUpperCase()}%`
  const { rows } = await query(
    `SELECT id, icao_code, iata_code, name, city, country,
            lat, lon, elevation_ft, rwy_m, rwy_desc, surface, fuel, source, remarks
     FROM airports
     WHERE is_active = true
       AND (UPPER(icao_code) LIKE $1
         OR UPPER(iata_code) LIKE $1
         OR UPPER(name)      LIKE $1
         OR UPPER(city)      LIKE $1)
     ORDER BY
       CASE WHEN UPPER(icao_code) = $2 THEN 0
            WHEN UPPER(iata_code) = $2 THEN 1
            WHEN UPPER(icao_code) LIKE $1 THEN 2
            ELSE 3 END,
       name ASC
     LIMIT $3`,
    [term, q.trim().toUpperCase(), limit]
  )
  return rows
}

export async function getAirportById(id) {
  const { rows } = await query('SELECT * FROM airports WHERE id = $1', [id])
  if (rows.length === 0) throw new AppError('Airport not found', 404)
  return rows[0]
}

export async function createAirport(data) {
  const existing = await query(
    'SELECT id FROM airports WHERE UPPER(icao_code) = UPPER($1)',
    [data.icao_code]
  )
  if (existing.rows.length > 0) {
    throw new AppError(`Airport with ICAO ${data.icao_code.toUpperCase()} already exists`, 409)
  }

  const { rows } = await query(
    `INSERT INTO airports (
        icao_code, iata_code, name, city, country, country_iso,
        lat, lon, elevation_ft, timezone, source,
        rwy_m, rwy_desc, surface, fuel, region,
        runways, remarks, notam_notes
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
      RETURNING *`,
    [
      data.icao_code?.toUpperCase() || null,
      data.iata_code?.toUpperCase() || null,
      data.name,
      data.city || null,
      data.country || null,
      data.country_iso?.toUpperCase() || null,
      data.lat || null,
      data.lon || null,
      data.elevation_ft || null,
      data.timezone || null,
      data.source || 'OPERATOR',
      data.rwy_m || null,
      data.rwy_desc || null,
      data.surface || null,
      data.fuel || null,
      data.region || null,
      data.runways ? JSON.stringify(data.runways) : null,
      data.remarks || null,
      data.notam_notes || null,
    ]
  )
  return rows[0]
}

export async function updateAirport(id, updates) {
  await getAirportById(id)

  if (updates.icao_code) {
    const conflict = await query(
      'SELECT id FROM airports WHERE UPPER(icao_code) = UPPER($1) AND id != $2',
      [updates.icao_code, id]
    )
    if (conflict.rows.length > 0) {
      throw new AppError(`ICAO code ${updates.icao_code.toUpperCase()} already in use`, 409)
    }
    updates.icao_code = updates.icao_code.toUpperCase()
  }

  const fields = Object.keys(updates)
  if (fields.length === 0) throw new AppError('No fields provided to update', 400)

  const setClauses = fields.map((f, i) => `${f} = $${i + 1}`)
  const values = fields.map((f) => updates[f])

  const { rows } = await query(
    `UPDATE airports SET ${setClauses.join(', ')}, updated_at = NOW()
     WHERE id = $${fields.length + 1} RETURNING *`,
    [...values, id]
  )
  return rows[0]
}

export async function deleteAirport(id) {
  await getAirportById(id)
  await query('UPDATE airports SET is_active = false, updated_at = NOW() WHERE id = $1', [id])
  return { message: 'Airport deactivated' }
}

export async function clearAirportsBySource(scope) {
  if (scope === 'aip') {
    const { rowCount } = await query(
      "DELETE FROM airports WHERE source = 'AIP'"
    )
    return { deleted: rowCount }
  }
  if (scope === 'all') {
    const { rowCount } = await query('DELETE FROM airports')
    return { deleted: rowCount }
  }
  throw new AppError('Invalid scope — use "aip" or "all"', 400)
}

// ─── OurAirports CSV Import ────────────────────────────────────────────────────
//
// Expects the two CSV files from ourairports.com/data:
//   airports.csv  — one row per airport
//   runways.csv   — zero or more rows per airport (optional)
//
// Options:
//   overwrite       — replace existing AIP rows (OPERATOR rows always protected)
//   requireRunway   — skip airports with no runway data
//   skipSmall       — skip heliports, seaplane bases, small airfields
//   countryFilter   — comma-separated ISO codes, e.g. "KE,SS"

export async function importOurAirports(
  airportsCsvBuffer,
  runwaysCsvBuffer,
  { overwrite = false, requireRunway = true, skipSmall = true, countryFilter = '' } = {}
) {
  // Parse airports.csv
  const airports = parse(airportsCsvBuffer, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  })

  // Parse runways.csv if provided — index by airport_ref (ident)
  const runwaysByIdent = {}
  if (runwaysCsvBuffer) {
    const runways = parse(runwaysCsvBuffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    })
    for (const rwy of runways) {
      const key = rwy.airport_ident || rwy.airport_ref
      if (!key) continue
      if (!runwaysByIdent[key]) runwaysByIdent[key] = []
      runwaysByIdent[key].push(rwy)
    }
  }

  const allowedCountries = countryFilter
    ? countryFilter.split(',').map((c) => c.trim().toUpperCase()).filter(Boolean)
    : []

  const SMALL_TYPES = ['heliport', 'seaplane_base', 'closed', 'balloonport']
  const SKIP_TYPES = skipSmall ? [...SMALL_TYPES, 'small_airport'] : SMALL_TYPES

  let imported = 0
  let skipped = 0
  let errors = 0
  const errorDetails = []

  for (const row of airports) {
    try {
      const icao = (row.ident || row.gps_code || '').toUpperCase().trim()
      if (!icao) { skipped++; continue }

      // Country filter
      const iso = (row.iso_country || '').toUpperCase().trim()
      if (allowedCountries.length > 0 && !allowedCountries.includes(iso)) {
        skipped++
        continue
      }

      // Skip small/heliport types
      const atype = (row.type || '').toLowerCase().trim()
      if (SKIP_TYPES.includes(atype)) { skipped++; continue }

      // Runway check
      const rwys = runwaysByIdent[icao] || []
      if (requireRunway && rwys.length === 0) { skipped++; continue }

      // Best runway — longest
      let rwy_m = null
      let rwy_desc = null
      let surface = null
      if (rwys.length > 0) {
        const best = rwys
          .filter((r) => r.length_ft && !isNaN(Number(r.length_ft)))
          .sort((a, b) => Number(b.length_ft) - Number(a.length_ft))[0]
        if (best) {
          rwy_m = Math.round(Number(best.length_ft) * 0.3048)
          const le = best.le_ident || ''
          const he = best.he_ident || ''
          rwy_desc = [le, he].filter(Boolean).join('/')
          surface = (best.surface || '').toUpperCase().trim() || null
        }
      }

      const lat = parseFloat(row.latitude_deg)
      const lon = parseFloat(row.longitude_deg)
      const elev = row.elevation_ft ? parseInt(row.elevation_ft) : null
      const name = (row.name || icao).trim()
      const iata = (row.iata_code || '').toUpperCase().trim() || null
      const city = (row.municipality || '').trim() || null
      const country = (row.iso_country || '').trim() || null
      const region = (row.iso_region || '').trim() || null
      const timezone = (row.time_zone || row.timezone || '').trim() || null

      // Check if exists
      const existing = await query(
        'SELECT id, source FROM airports WHERE UPPER(icao_code) = $1',
        [icao]
      )

      if (existing.rows.length > 0) {
        const existingSource = existing.rows[0].source
        // Never overwrite OPERATOR entries
        if (existingSource === 'OPERATOR') { skipped++; continue }
        // Only overwrite AIP if flag is set
        if (!overwrite) { skipped++; continue }

        await query(
          `UPDATE airports SET
              iata_code=$1, name=$2, city=$3, country=$4, country_iso=$5,
              lat=$6, lon=$7, elevation_ft=$8, timezone=$9,
              rwy_m=$10, rwy_desc=$11, surface=$12, region=$13,
              source='AIP', updated_at=NOW()
           WHERE id=$14`,
          [iata, name, city, country, iso, lat, lon, elev, timezone,
           rwy_m, rwy_desc, surface, region, existing.rows[0].id]
        )
      } else {
        await query(
          `INSERT INTO airports (
              icao_code, iata_code, name, city, country, country_iso,
              lat, lon, elevation_ft, timezone, source,
              rwy_m, rwy_desc, surface, region
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'AIP',$11,$12,$13,$14)`,
          [icao, iata, name, city, country, iso,
           lat, lon, elev, timezone,
           rwy_m, rwy_desc, surface, region]
        )
      }

      imported++
    } catch (err) {
      errors++
      errorDetails.push(err.message)
    }
  }

  return { imported, skipped, errors, errorDetails: errorDetails.slice(0, 10) }
}