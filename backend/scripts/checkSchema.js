import 'dotenv/config'
import pg from 'pg'

const { Pool } = pg

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
})

async function checkSchema() {
  try {
    const { rows } = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'airports'
      ORDER BY ordinal_position
    `)
    
    console.log('Airports table columns:')
    rows.forEach(r => {
      console.log(`  ${r.column_name}: ${r.data_type} (nullable: ${r.is_nullable})`)
    })

    await pool.end()
  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  }
}

checkSchema()
