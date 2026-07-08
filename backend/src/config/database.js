import pg from 'pg'
import 'dotenv/config'

const { Pool } = pg

let pool

export function connect() {
  if (!pool) {
    // Parse DATABASE_URL if provided, otherwise use individual env vars
    if (process.env.DATABASE_URL) {
      pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      })
    } else {
      pool = new Pool({
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT) || 5432,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      })
    }
    console.log('✅ Connected to PostgreSQL')
  }
}

export async function disconnect() {
  if (pool) {
    await pool.end()
    console.log('Disconnected from PostgreSQL')
    pool = null
  }
}

export async function query(text, params) {
  if (!pool) {
    throw new Error('Database not connected. Call connect() first.')
  }
  return pool.query(text, params)
}