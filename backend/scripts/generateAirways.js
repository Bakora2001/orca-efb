/**
 * generateAirways.js
 * ------------------
 * Reads every navpoint already in the database, builds a realistic
 * set of named airway segments (Upper/Lower airways, typical 50–250 NM
 * hops), and bulk-inserts them directly into the `airways` table.
 *
 * This is the permanent data generation approach — no external download
 * required, no ARINC-424 license needed. The output is structurally
 * identical to what a real navdata provider would supply.
 *
 * Run once: node scripts/generateAirways.js
 */

import 'dotenv/config'
import pkg from 'pg'
const { Pool } = pkg

const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     parseInt(process.env.DB_PORT || '5432'),
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl:      { rejectUnauthorized: false },
})

// ─── Haversine distance in nautical miles ─────────────────────────────────────
function nmBetween(lat1, lon1, lat2, lon2) {
  const R = 3440.065
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180)
    * Math.cos(lat2 * Math.PI / 180)
    * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, a))))
}

// ─── Bearing A→B in degrees (0–360) ──────────────────────────────────────────
function bearing(lat1, lon1, lat2, lon2) {
  const dLon = (lon2 - lon1) * Math.PI / 180
  const la1 = lat1 * Math.PI / 180
  const la2 = lat2 * Math.PI / 180
  const y = Math.sin(dLon) * Math.cos(la2)
  const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLon)
  return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360
}

// ─── Regional airway naming ────────────────────────────────────────────────────
// Airways are named by region + a number bucket (same bearing range → same
// candidate name). This is how real published airways work (UG651, G45, etc.)
function regionPrefix(lat, lon) {
  // Africa
  if (lat >= -35 && lat <= 38 && lon >= -20 && lon <= 55) return { upper: 'UG', lower: 'G' }
  // Europe
  if (lat >= 35 && lat <= 72 && lon >= -15 && lon <= 40) return { upper: 'UN', lower: 'N' }
  // North America
  if (lat >= 15 && lat <= 75 && lon >= -170 && lon <= -50) return { upper: 'J', lower: 'V' }
  // Asia-Pacific
  if (lat >= -50 && lat <= 60 && lon >= 60 && lon <= 180) return { upper: 'M', lower: 'B' }
  // Middle East / Central Asia
  if (lat >= 10 && lat <= 45 && lon >= 40 && lon <= 75) return { upper: 'UM', lower: 'M' }
  // South America
  if (lat >= -60 && lat <= 15 && lon >= -85 && lon <= -30) return { upper: 'UZ', lower: 'Z' }
  // Atlantic / oceanic
  return { upper: 'UA', lower: 'A' }
}

function airwayName(lat, lon, brg, isUpper) {
  const { upper, lower } = regionPrefix(lat, lon)
  const prefix = isUpper ? upper : lower
  // Map bearing into a number bucket (1–999). This makes parallel routes
  // in the same corridor share the same name, just like real structure.
  const bucket = 100 + (Math.round(brg / 10) * 7 + Math.round(Math.abs(lat)) * 3) % 899
  return `${prefix}${bucket}`
}

// ─── 2° spatial grid for fast neighbor look-up ───────────────────────────────
function buildGrid(points) {
  const grid = new Map()
  for (const p of points) {
    const key = `${Math.floor(p.lat / 2)},${Math.floor(p.lon / 2)}`
    if (!grid.has(key)) grid.set(key, [])
    grid.get(key).push(p)
  }
  return grid
}

function neighbors(grid, p, minNm, maxNm) {
  const spread = Math.ceil(maxNm / 111) + 1  // grid cells to search
  const result = []
  for (let dy = -spread; dy <= spread; dy++) {
    for (let dx = -spread; dx <= spread; dx++) {
      const key = `${Math.floor(p.lat / 2) + dy},${Math.floor(p.lon / 2) + dx}`
      const cell = grid.get(key)
      if (!cell) continue
      for (const q of cell) {
        if (q.id === p.id) continue
        const nm = nmBetween(p.lat, p.lon, q.lat, q.lon)
        if (nm >= minNm && nm <= maxNm) result.push({ point: q, nm })
      }
    }
  }
  return result.sort((a, b) => a.nm - b.nm)
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const client = await pool.connect()
  try {
    console.log('📡 Fetching navpoints from database...')
    const { rows: navpoints } = await client.query(
      `SELECT id, ident, lat::float AS lat, lon::float AS lon, point_type
       FROM navpoints
       WHERE lat IS NOT NULL AND lon IS NOT NULL
       ORDER BY id`
    )
    const { rows: airports } = await client.query(
      `SELECT id, icao_code AS ident,
              lat::float AS lat, lon::float AS lon, 'AIRPORT' AS point_type
       FROM airports
       WHERE lat IS NOT NULL AND lon IS NOT NULL
       ORDER BY id`
    )

    const all = [...airports, ...navpoints]
    console.log(`   ${airports.length} airports + ${navpoints.length} navpoints = ${all.length} total points`)

    const grid = buildGrid(all)

    // Clear existing generated airways (keep any manually imported ones)
    const { rowCount: deleted } = await client.query(
      `DELETE FROM airways WHERE provider = 'GENERATED'`
    )
    if (deleted > 0) console.log(`🗑  Cleared ${deleted} previously generated segments`)

    const seen = new Set()   // "from_ident→to_ident" dedup
    let imported = 0, batch = []

    const BATCH_SIZE = 500
    const UPPER_MIN = 60,  UPPER_MAX = 250  // Upper airways (high altitude)
    const LOWER_MIN = 30,  LOWER_MAX = 120  // Lower airways (low altitude)
    const MAX_LINKS = 3                      // max outgoing segments per point

    console.log('✈  Building airway segments...')

    for (const p of all) {
      // Upper airways (FL195+) — longer hops, fewer connections
      const upperNeighbors = neighbors(grid, p, UPPER_MIN, UPPER_MAX)
      let upperCount = 0
      for (const { point: q } of upperNeighbors) {
        if (upperCount >= MAX_LINKS) break
        const key = `${p.ident}→${q.ident}`
        const reverseKey = `${q.ident}→${p.ident}`
        if (seen.has(key) || seen.has(reverseKey)) continue
        seen.add(key)

        const brg = bearing(p.lat, p.lon, q.lat, q.lon)
        const name = airwayName(p.lat, p.lon, brg, true)

        batch.push([
          name, p.ident, p.lat, p.lon, q.ident, q.lat, q.lon,
          'FL195', 'FL600', 'BOTH', 'GENERATED', regionPrefix(p.lat, p.lon).upper
        ])
        upperCount++
      }

      // Lower airways (below FL195) — shorter hops, more local
      const lowerNeighbors = neighbors(grid, p, LOWER_MIN, LOWER_MAX)
      let lowerCount = 0
      for (const { point: q } of lowerNeighbors) {
        if (lowerCount >= MAX_LINKS) break
        const key = `L:${p.ident}→${q.ident}`
        const reverseKey = `L:${q.ident}→${p.ident}`
        if (seen.has(key) || seen.has(reverseKey)) continue
        seen.add(key)

        const brg = bearing(p.lat, p.lon, q.lat, q.lon)
        const name = airwayName(p.lat, p.lon, brg, false)

        batch.push([
          name, p.ident, p.lat, p.lon, q.ident, q.lat, q.lon,
          'MSA', 'FL195', 'BOTH', 'GENERATED', regionPrefix(p.lat, p.lon).lower
        ])
        lowerCount++
      }

      // Flush batch
      if (batch.length >= BATCH_SIZE) {
        await flushBatch(client, batch)
        imported += batch.length
        process.stdout.write(`\r   Inserted ${imported.toLocaleString()} segments...`)
        batch = []
      }
    }

    // Final flush
    if (batch.length > 0) {
      await flushBatch(client, batch)
      imported += batch.length
    }

    console.log(`\n✅ Done — ${imported.toLocaleString()} airway segments inserted into 'airways' table.`)

    // Quick sanity check
    const { rows: [{ count }] } = await client.query('SELECT COUNT(*) FROM airways')
    console.log(`   Total airways in DB: ${count}`)

  } finally {
    client.release()
    await pool.end()
  }
}

async function flushBatch(client, rows) {
  // Each row = [route_name, from_ident, from_lat, from_lon, to_ident, to_lat, to_lon,
  //             lower_limit, upper_limit, direction, provider, region]
  // 12 values → 12 columns (seq defaults to nextval, validation_status has a default)
  const values = []
  const params = []
  let p = 1
  for (const r of rows) {
    values.push(
      `($${p},$${p+1},$${p+2},$${p+3},$${p+4},$${p+5},$${p+6},$${p+7},$${p+8},$${p+9},$${p+10},$${p+11})`
    )
    params.push(...r)
    p += 12
  }
  await client.query(
    `INSERT INTO airways
       (route_name, from_ident, from_lat, from_lon, to_ident, to_lat, to_lon,
        lower_limit, upper_limit, direction, provider, region)
     VALUES ${values.join(',')}
     ON CONFLICT DO NOTHING`,
    params
  )
}

main().catch(err => { console.error('❌', err.message); process.exit(1) })
