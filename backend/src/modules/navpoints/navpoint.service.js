import { query } from '../../config/database.js'
import AppError from '../../utils/AppError.js'

// ─── Get all navpoints (for map layer) ───────────────────────────
// Returns only the fields the map needs — not the full row — to
// keep the payload small (this can be tens of thousands of fixes).
export async function getAllNavpoints() {
  const { rows } = await query(
    `SELECT id, ident, name, point_type, lat, lon, region,
            provider, source, effective_date, validation_status
     FROM navpoints
     WHERE validation_status != 'DEPRECATED'
     ORDER BY ident ASC`
  )
  return rows
}

// ─── Typeahead search ─────────────────────────────────────────────
export async function searchNavpoints(q, limit = 30) {
  if (!q || q.trim().length < 2) {
    const { rows } = await query(
      `SELECT id, ident, name, point_type, lat, lon, region,
              provider, source, effective_date, validation_status
       FROM navpoints
       WHERE validation_status != 'DEPRECATED'
       ORDER BY ident ASC LIMIT $1`,
      [limit]
    )
    return rows
  }

  const term = `%${q.trim().toUpperCase()}%`
  const exact = q.trim().toUpperCase()

  const { rows } = await query(
    `SELECT id, ident, name, point_type, lat, lon, region,
            provider, source, effective_date, validation_status
     FROM navpoints
     WHERE validation_status != 'DEPRECATED'
       AND (UPPER(ident) LIKE $1 OR UPPER(name) LIKE $1 OR UPPER(region) LIKE $1)
     ORDER BY
       CASE WHEN UPPER(ident) = $2 THEN 0
            WHEN UPPER(ident) LIKE $1 THEN 1
            ELSE 2 END,
       ident ASC
     LIMIT $3`,
    [term, exact, limit]
  )
  return rows
}

// ─── Single navpoint by ID ────────────────────────────────────────
export async function getNavpointById(id) {
  const { rows } = await query(
    'SELECT * FROM navpoints WHERE id = $1',
    [id]
  )
  if (rows.length === 0) throw new AppError('Navpoint not found', 404)
  return rows[0]
}

// ─── Create user waypoint ─────────────────────────────────────────
export async function createNavpoint({ ident, name, lat, lon, point_type, region, userId }) {
  // For user-created waypoints, check for duplicate ident in USER scope
  if (point_type === 'USER') {
    const existing = await query(
      `SELECT id FROM navpoints WHERE UPPER(ident) = UPPER($1) AND point_type = 'USER'`,
      [ident]
    )
    if (existing.rows.length > 0) {
      throw new AppError(`User waypoint with identifier ${ident.toUpperCase()} already exists`, 409)
    }
  }

  const { rows } = await query(
    `INSERT INTO navpoints (ident, name, lat, lon, point_type, region, source, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      ident.toUpperCase().trim(),
      name || ident,
      lat,
      lon,
      point_type || 'USER',
      region || null,
      point_type === 'USER' ? 'USER' : 'IMPORTED',
      userId || null,
    ]
  )
  return rows[0]
}

// ─── Update navpoint ──────────────────────────────────────────────
export async function updateNavpoint(id, updates) {
  await getNavpointById(id)

  const fields = Object.keys(updates)
  if (fields.length === 0) throw new AppError('No fields provided to update', 400)

  const setClauses = fields.map((f, i) => `${f} = $${i + 1}`)
  const values = fields.map((f) => updates[f])

  const { rows } = await query(
    `UPDATE navpoints SET ${setClauses.join(', ')}, updated_at = NOW()
     WHERE id = $${fields.length + 1} RETURNING *`,
    [...values, id]
  )
  return rows[0]
}

// ─── Delete navpoint (user waypoints only) ────────────────────────
export async function deleteNavpoint(id) {
  const point = await getNavpointById(id)
  if (point.point_type !== 'USER') {
    throw new AppError('Only user-created waypoints can be deleted', 403)
  }
  await query('DELETE FROM navpoints WHERE id = $1', [id])
  return { message: 'Waypoint deleted' }
}

// ─── Leg suggestions — geometric bucketing route builder ──────────
// Strategy:
//   1. Calculate the great circle track from DEP to DEST.
//   2. Divide the total distance into `limit` equal segments (buckets).
//   3. Fetch all valid navpoints in the bounding box between DEP and DEST.
//   4. Assign each navpoint to a bucket based on its along-track distance.
//   5. Sort points in each bucket by cross-track distance (closest to center).
//   6. For a given `attempt` number, pick the N-th best point in each bucket
//      (falling back to the 1st if the bucket doesn't have N points).
// This guarantees a perfectly distributed, flyable route that changes on each click.
export async function getLegSuggestions(depId, destId, limit = 8, attempt = 1) {
  // ── Fetch departure and destination ───────────────────────────
  const [depRes, destRes] = await Promise.all([
    query('SELECT lat, lon, icao_code FROM airports WHERE id = $1', [depId]),
    query('SELECT lat, lon, icao_code FROM airports WHERE id = $1', [destId]),
  ])
  if (depRes.rows.length === 0) throw new AppError('Departure airport not found', 404)
  if (destRes.rows.length === 0) throw new AppError('Destination airport not found', 404)

  const dep  = depRes.rows[0]
  const dest = destRes.rows[0]

  const depLat  = parseFloat(dep.lat),  depLon  = parseFloat(dep.lon)
  const destLat = parseFloat(dest.lat), destLon = parseFloat(dest.lon)
  const totalNm = gcNm(depLat, depLon, destLat, destLon)

  // ── Fetch fixes in bounding box ───────────────────────────────
  // Expand box by 15% to catch nearby fixes
  const padDeg = (totalNm * 0.15) / 60
  const minLat = Math.min(depLat, destLat) - padDeg
  const maxLat = Math.max(depLat, destLat) + padDeg
  const minLon = Math.min(depLon, destLon) - padDeg
  const maxLon = Math.max(depLon, destLon) + padDeg

  const { rows } = await query(
    `SELECT id, ident, name, point_type, lat, lon
     FROM navpoints
     WHERE lat BETWEEN $1 AND $2 AND lon BETWEEN $3 AND $4
       AND validation_status != 'DEPRECATED'
       AND point_type IN ('VOR', 'NDB', 'WAYPOINT')`,
    [minLat, maxLat, minLon, maxLon]
  )

  // ── Bucket the fixes ──────────────────────────────────────────
  const numBuckets = limit
  const bucketSize = totalNm / numBuckets
  const MAX_XTK_NM = totalNm * 0.15  // allow up to 15% off-track deviation

  // Array of arrays to hold fixes for each bucket
  const buckets = Array.from({ length: numBuckets }, () => [])

  for (const fix of rows) {
    const fixLat = parseFloat(fix.lat)
    const fixLon = parseFloat(fix.lon)
    const atk = alongTrackNm(depLat, depLon, destLat, destLon, fixLat, fixLon, totalNm)
    const xtk = Math.abs(crossTrackNm(depLat, depLon, destLat, destLon, fixLat, fixLon))

    // Skip points outside the start/end or too far off track
    if (atk <= 0 || atk >= totalNm || xtk > MAX_XTK_NM) continue

    const bucketIndex = Math.floor(atk / bucketSize)
    if (bucketIndex >= 0 && bucketIndex < numBuckets) {
      buckets[bucketIndex].push({
        ...fix,
        along_track_nm: atk,
        cross_track_nm: xtk
      })
    }
  }

  // ── Select fixes for this attempt ─────────────────────────────
  const route = []
  
  // To avoid getting the exact same route if the attempt # increases but buckets
  // don't have enough elements, we'll modulo the attempt by the bucket size.
  for (let i = 0; i < numBuckets; i++) {
    const bucket = buckets[i]
    if (bucket.length === 0) continue

    // Sort by cross-track distance (closest to direct line first)
    bucket.sort((a, b) => a.cross_track_nm - b.cross_track_nm)

    // Use attempt to pick the N-th best option
    // (1-indexed attempt, so attempt=1 gets index 0)
    const indexToPick = (attempt - 1) % bucket.length
    route.push(bucket[indexToPick])
  }

  // Ensure they are ordered correctly by distance from departure
  route.sort((a, b) => a.along_track_nm - b.along_track_nm)

  return route
}

// ─── Bulk import navpoints (admin) ────────────────────────────────
// Used for importing VOR/NDB/waypoint databases (e.g. from OurAirports
// or ARINC 424 data). Expects an array of navpoint objects.
export async function bulkImportNavpoints(points, { overwrite = false } = {}) {
  let imported = 0
  let skipped  = 0
  let errors   = 0

  for (const p of points) {
    try {
      const ident = (p.ident || '').toUpperCase().trim()
      if (!ident || p.lat == null || p.lon == null) { skipped++; continue }

      const existing = await query(
        `SELECT id, source FROM navpoints WHERE UPPER(ident) = $1 AND point_type = $2`,
        [ident, p.point_type || 'WAYPOINT']
      )

      if (existing.rows.length > 0) {
        if (!overwrite || existing.rows[0].source === 'USER') { skipped++; continue }
        await query(
          `UPDATE navpoints SET name=$1, lat=$2, lon=$3, elevation_ft=$4,
                  region=$5, country_iso=$6, provider=$7, effective_date=$8,
                  updated_at=NOW()
           WHERE id=$9`,
          [p.name || ident, p.lat, p.lon, p.elevation_ft || null,
           p.region || null, p.country_iso || null, p.provider || null,
           p.effective_date || null, existing.rows[0].id]
        )
      } else {
        await query(
          `INSERT INTO navpoints
             (ident, name, lat, lon, point_type, elevation_ft, region, country_iso,
              provider, source, effective_date, validation_status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'UNVERIFIED')`,
          [ident, p.name || ident, p.lat, p.lon,
           p.point_type || 'WAYPOINT', p.elevation_ft || null,
           p.region || null, p.country_iso || null,
           p.provider || null, p.source || 'IMPORTED',
           p.effective_date || null]
        )
      }
      imported++
    } catch (err) {
      errors++
    }
  }

  return { imported, skipped, errors }
}

// ─── Import ENR CSV (admin) ───────────────────────────────────────
// Parses a KCAA/ASECNA ENR 4.4-style CSV with columns:
// ident, name, point_type, lat, lon, elevation_ft, region, country_iso, provider, effective_date
export async function importEnrCsv(csvText) {
  const lines = csvText.split(/\r?\n/).filter(l => l.trim().length > 0)
  if (lines.length < 2) throw new AppError('CSV is empty or has no data rows', 400)

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
  const required = ['ident', 'lat', 'lon']
  for (const col of required) {
    if (!headers.includes(col)) throw new AppError(`CSV missing required column: ${col}`, 400)
  }

  const points = []
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',')
    const row = {}
    headers.forEach((h, idx) => { row[h] = (cells[idx] ?? '').trim() })

    const ident = (row.ident || '').toUpperCase().trim()
    const lat   = parseFloat(row.lat)
    const lon   = parseFloat(row.lon)
    if (!ident || isNaN(lat) || isNaN(lon)) continue

    points.push({
      ident,
      name:           row.name || ident,
      point_type:     (row.point_type || 'WAYPOINT').toUpperCase(),
      lat,
      lon,
      elevation_ft:   row.elevation_ft ? parseFloat(row.elevation_ft) : null,
      region:         row.region || null,
      country_iso:    row.country_iso || null,
      provider:       row.provider || null,
      effective_date: row.effective_date || null,
      source:         'ENR_CSV',
    })
  }

  if (points.length === 0) throw new AppError('No valid rows found in CSV', 400)

  return bulkImportNavpoints(points, { overwrite: false })
}

// ─── Great-circle math helpers ────────────────────────────────────
const R_NM = 3440.065  // Earth radius in nautical miles

function toRad(deg) { return deg * Math.PI / 180 }

function gcNm(lat1, lon1, lat2, lon2) {
  const p1 = toRad(lat1), p2 = toRad(lat2)
  const dp = toRad(lat2 - lat1), dl = toRad(lon2 - lon1)
  const h  = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2
  return 2 * R_NM * Math.asin(Math.sqrt(h))
}

// Distance from start to the point on the GC track closest to the fix
function alongTrackNm(lat1, lon1, lat2, lon2, fixLat, fixLon, totalNm) {
  const d13 = gcNm(lat1, lon1, fixLat, fixLon)
  const xtk  = crossTrackNm(lat1, lon1, lat2, lon2, fixLat, fixLon)
  // Along-track distance = acos(cos(d13/R) / cos(xtk/R)) * R
  const cosAlong = Math.cos(d13 / R_NM) / Math.cos(xtk / R_NM)
  if (cosAlong < -1 || cosAlong > 1) return 0
  return Math.acos(cosAlong) * R_NM
}

// Signed cross-track distance from the GC track (DEP → DEST) to the fix
function crossTrackNm(lat1, lon1, lat2, lon2, fixLat, fixLon) {
  const d13  = gcNm(lat1, lon1, fixLat, fixLon)
  const brg12 = gcBrg(lat1, lon1, lat2, lon2)
  const brg13 = gcBrg(lat1, lon1, fixLat, fixLon)
  return Math.asin(Math.sin(d13 / R_NM) * Math.sin(toRad(brg13 - brg12))) * R_NM
}

function gcBrg(lat1, lon1, lat2, lon2) {
  const p1 = toRad(lat1), p2 = toRad(lat2), dl = toRad(lon2 - lon1)
  const y = Math.sin(dl) * Math.cos(p2)
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
}