import 'dotenv/config'
import pkg from 'pg'
const { Pool } = pkg
const pool = new Pool({ host: process.env.DB_HOST, port: +process.env.DB_PORT, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME, ssl: { rejectUnauthorized: false } })
const r = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='airports' ORDER BY ordinal_position")
console.log('airports columns:', r.rows.map(x=>x.column_name).join(', '))
const n = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='navpoints' ORDER BY ordinal_position")
console.log('navpoints columns:', n.rows.map(x=>x.column_name).join(', '))
const aw = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='airways' ORDER BY ordinal_position")
console.log('airways columns:', aw.rows.map(x=>x.column_name).join(', '))
await pool.end()
