import 'dotenv/config'
import pg from 'pg'
import path from 'path'
import { fileURLToPath } from 'url'

const { Pool } = pg
const __dirname = path.dirname(fileURLToPath(import.meta.url))


const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
  keepAlive: true,
  idleTimeoutMillis: 60000,
  connectionTimeoutMillis: 10000,
})
async function setupDatabase() {
  const client = await pool.connect()
  console.log('✅ Connected to PostgreSQL')

  const keepalivePing = setInterval(async () => {
    try { await client.query('SELECT 1') } catch (_) { /* ignore */ }
  }, 20000)

  try {
    console.log('Setting up Orca EFB database...\n')

    // UUID extension
    console.log('Creating UUID extension...')
    await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')
    console.log('✅ UUID extension enabled')

    // Users
    console.log('Creating efb-users table...')
    await client.query(`
      CREATE TABLE IF NOT EXISTS efbusers (
        id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        username        VARCHAR(50) UNIQUE NOT NULL,
        email           VARCHAR(255),
        password_hash   VARCHAR(255) NOT NULL,
        role            VARCHAR(20) NOT NULL DEFAULT 'dispatcher'
                        CHECK (role IN ('admin', 'dispatcher')),
        full_name       VARCHAR(100),
        is_active       BOOLEAN DEFAULT true,
        last_login      TIMESTAMPTZ,
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    console.log('✅ efbusers table created')

    // Roles
    console.log('Creating roles table...')
    await client.query(`
      CREATE TABLE IF NOT EXISTS roles (
        id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name        VARCHAR(50) UNIQUE NOT NULL,
        description TEXT,
        permissions JSONB DEFAULT '[]',
        created_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    console.log('✅ roles table created')

    // Aircraft
    console.log('Creating aircraft table...')
    await client.query(`
      CREATE TABLE IF NOT EXISTS aircraft (
        id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        registration    VARCHAR(20) UNIQUE NOT NULL,
        type            VARCHAR(50) NOT NULL,
        manufacturer    VARCHAR(50),
        mtow_kg         NUMERIC(10,2),
        mlw_kg          NUMERIC(10,2),
        mzfw_kg         NUMERIC(10,2),
        bew_kg          NUMERIC(10,2),
        max_pax         INTEGER,
        cruise_tas_kt   NUMERIC(6,1),
        fuel_burn_kg_hr NUMERIC(8,2),
        flaps           TEXT[],
        notes           TEXT,
        is_active       BOOLEAN DEFAULT true,
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    console.log('✅ aircraft table created')

    // Airports
    console.log('Creating airports table...')
    await client.query(`
      CREATE TABLE IF NOT EXISTS airports (
        id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        icao_code       VARCHAR(4) UNIQUE NOT NULL,
        iata_code       VARCHAR(3),
        name            VARCHAR(200) NOT NULL,
        city            VARCHAR(100),
        country         VARCHAR(100),
        country_iso     VARCHAR(2),
        lat             NUMERIC(10,6),
        lon             NUMERIC(10,6),
        elevation_ft    INTEGER,
        timezone        VARCHAR(50),
        source          VARCHAR(20) DEFAULT 'OPERATOR'
                        CHECK (source IN ('AIP', 'OPERATOR')),
        runways         JSONB,
        remarks         TEXT,
        notam_notes     TEXT,
        is_active       BOOLEAN DEFAULT true,
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    console.log('✅ airports table created')

    // Performance cells — drop if broken from previous run, then create fresh
    console.log('Creating performance_cells table...')
    await client.query('DROP TABLE IF EXISTS performance_cells CASCADE')
    await client.query(`
      CREATE TABLE performance_cells (
        id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        aircraft_id     UUID NOT NULL REFERENCES aircraft(id) ON DELETE CASCADE,
        table_type      VARCHAR(10) NOT NULL CHECK (table_type IN ('WAT', 'TODA', 'ASDA')),
        flap_setting    NUMERIC(4,1) NOT NULL,
        elevation_ft    INTEGER NOT NULL,
        temp_c          INTEGER NOT NULL,
        value_kg        NUMERIC(10,2),
        verified_by     UUID REFERENCES efbusers(id),
        verified_at     TIMESTAMPTZ,
        notes           TEXT,
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (aircraft_id, table_type, flap_setting, elevation_ft, temp_c)
      )
    `)
    console.log('✅ performance_cells table created')

    await client.query('CREATE INDEX IF NOT EXISTS idx_perf_aircraft ON performance_cells(aircraft_id)')
    await client.query('CREATE INDEX IF NOT EXISTS idx_perf_lookup ON performance_cells(aircraft_id, table_type, flap_setting)')
    console.log('✅ performance_cells indexes created')

    // Charts
    console.log('Creating charts table...')
    await client.query(`
      CREATE TABLE IF NOT EXISTS charts (
        id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        aircraft_id     UUID REFERENCES aircraft(id) ON DELETE SET NULL,
        title           VARCHAR(200) NOT NULL,
        chart_type      VARCHAR(50),
        file_path       VARCHAR(500) NOT NULL,
        file_type       VARCHAR(20),
        file_size_bytes BIGINT,
        uploaded_by     UUID REFERENCES efbusers(id),
        notes           TEXT,
        created_at      TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    console.log('✅ charts table created')

    // App config
    console.log('Creating app_config table...')
    await client.query(`
      CREATE TABLE IF NOT EXISTS app_config (
        id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        key             VARCHAR(100) UNIQUE NOT NULL,
        value           TEXT NOT NULL,
        description     TEXT,
        updated_by      UUID REFERENCES efbusers(id),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    console.log('✅ app_config table created')

    await client.query(`
      INSERT INTO app_config (key, value, description) VALUES
        ('company_name', 'Orca Aviation', 'Company name displayed on reports'),
        ('pax_weight_kg', '77', 'Standard passenger weight in kg'),
        ('contingency_pct', '5', 'Fuel contingency percentage'),
        ('reserve_minutes', '45', 'Final reserve fuel in minutes'),
        ('surface_factor', '1.0', 'Surface condition factor'),
        ('route_factor_pct', '5', 'Route distance factor percentage')
      ON CONFLICT (key) DO NOTHING
    `)
    console.log('✅ Default app_config values inserted')

    // Audit logs
    console.log('Creating audit_logs table...')
    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id     UUID REFERENCES efbusers(id) ON DELETE SET NULL,
        action      VARCHAR(100) NOT NULL,
        table_name  VARCHAR(50),
        record_id   UUID,
        old_data    JSONB,
        new_data    JSONB,
        ip_address  VARCHAR(45),
        created_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    console.log('✅ audit_logs table created')

    // Verification
    const tables = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `)
    console.log('\nTables in database:', tables.rows.map(r => r.table_name).join(', '))

    console.log('\nOrca EFB database setup complete!')

  } catch (error) {
    console.error('Setup failed:', error.message)
    console.error('Stack:', error.stack)
    throw error
  } finally {
    clearInterval(keepalivePing)
    client.release()
    await pool.end()
    console.log('Database connection closed')
  }
}

setupDatabase()
  .then(() => {
    console.log('✅ Script finished successfully')
    process.exit(0)
  })
  .catch((err) => {
    console.error('Script failed:', err.message)
    process.exit(1)
  })