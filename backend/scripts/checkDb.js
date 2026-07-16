const { Pool } = require('pg')
require('dotenv').config({ path: 'backend/.env' })

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

async function run() {
  const airports  = await pool.query('SELECT COUNT(*) FROM airports WHERE is_active=true')
  const navpoints = await pool.query('SELECT COUNT(*) FROM navpoints')
  const airways   = await pool.query('SELECT COUNT(*) FROM airways')
  const countries = await pool.query("SELECT DISTINCT country FROM airports WHERE country IS NOT NULL ORDER BY country LIMIT 15")
  const regions   = await pool.query("SELECT DISTINCT region FROM airports WHERE region IS NOT NULL ORDER BY region LIMIT 10")

  console.log('Airports :', airports.rows[0].count)
  console.log('Navpoints:', navpoints.rows[0].count)
  console.log('Airways  :', airways.rows[0].count)
  console.log('Countries:', countries.rows.map(r => r.country).join(', '))
  console.log('Regions  :', regions.rows.map(r => r.region).join(', '))
  await pool.end()
}

run().catch(e => { console.error(e.message); pool.end() })
