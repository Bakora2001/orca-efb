import pg from 'pg'
const pool = new pg.Pool({connectionString: 'postgres://kscrn_user:42084-vic1-Maxypike-219221@172.81.133.161:5432/orca_efb1'})

async function run() {
  try {
    await pool.query('ALTER TABLE aircraft ADD COLUMN IF NOT EXISTS max_fuel_kg numeric')
    await pool.query('ALTER TABLE performance_cells ADD COLUMN IF NOT EXISTS weight_kg numeric')
    
    // Convert old lbs values to kg (5400 lb ~ 2449 kg, 14600 lb ~ 6622 kg)
    await pool.query(`UPDATE aircraft SET max_fuel_kg = 2449 WHERE type = 'DASH 8-300' OR type = 'DASH 8-200'`)
    await pool.query(`UPDATE aircraft SET max_fuel_kg = 6622 WHERE type = 'CRJ 200'`)
    
    console.log('Migration done successfully.')
  } catch (err) {
    console.error('Migration failed', err)
  } finally {
    await pool.end()
  }
}
run()
