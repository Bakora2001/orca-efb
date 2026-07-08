import 'dotenv/config'
import pg from 'pg'
import bcrypt from 'bcryptjs'

const { Pool } = pg

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
})

async function createTestUser() {
  try {
    // Create admin user
    const passwordHash = await bcrypt.hash('admin123', 10)
    await pool.query(
      `INSERT INTO efbusers (username, email, password_hash, role, full_name)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (username) DO NOTHING`,
      ['admin', 'admin@orca.com', passwordHash, 'admin', 'Admin User']
    )
    console.log('✅ Admin user created (username: admin, password: admin123)')

    // Create dispatcher user
    const dispatcherHash = await bcrypt.hash('dispatcher123', 10)
    await pool.query(
      `INSERT INTO efbusers (username, email, password_hash, role, full_name)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (username) DO NOTHING`,
      ['dispatcher', 'dispatcher@orca.com', dispatcherHash, 'dispatcher', 'Dispatcher User']
    )
    console.log('✅ Dispatcher user created (username: dispatcher, password: dispatcher123)')

    await pool.end()
    console.log('\n✅ Test users ready!')
  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  }
}

createTestUser()
