/**
 * migrateTokenIssuedAfter.js
 * ──────────────────────────
 * One-time migration: adds `token_issued_after` column to efbusers.
 * Run once:  node scripts/migrateTokenIssuedAfter.js
 */
import 'dotenv/config'
import pg from 'pg'

const { Pool } = pg
const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl:      process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
})

const client = await pool.connect()
try {
  await client.query(`
    ALTER TABLE efbusers
    ADD COLUMN IF NOT EXISTS token_issued_after TIMESTAMPTZ DEFAULT NOW()
  `)
  console.log('✅ token_issued_after column added to efbusers')
} finally {
  client.release()
  await pool.end()
}
