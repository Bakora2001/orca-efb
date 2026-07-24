import 'dotenv/config'
import pg from 'pg'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { parse } from 'csv-parse/sync'

const { Pool } = pg
const __dirname = path.dirname(fileURLToPath(import.meta.url))

const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT || '5432'),
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
})

async function importRealData() {
  console.log('📦 Importing REAL DATA from Python folder (NO DUMMY DATA)...\n')

  try {
    // Helper to find data folder
    const getPath = (rel) => {
      const p1 = path.resolve(__dirname, '../../../orca-efb-v14', rel)
      if (fs.existsSync(p1)) return p1
      const p2 = path.resolve(__dirname, '../../../orca-efb-v14-main/orca-efb-v14-main', rel)
      if (fs.existsSync(p2)) return p2
      const p3 = path.resolve(__dirname, '../data', path.basename(rel))
      if (fs.existsSync(p3)) return p3
      const p4 = path.resolve(__dirname, '../data')
      if (fs.existsSync(p4) && !rel.endsWith('.csv')) return p4
      return p3
    }

    // 1. Skip ALL airports
    console.log('1️⃣ Skipping ALL airports...')
    /*
    const airportsPath = getPath('data/airports_v14.csv')
    if (fs.existsSync(airportsPath)) {
      const csvContent = fs.readFileSync(airportsPath, 'utf-8')
      const airports = parse(csvContent, { columns: true, skip_empty_lines: true, trim: true, bom: true })
      
      let imported = 0
      for (const row of airports) { // ALL airports, not limited
        try {
          const icao = (row.icao || '').trim().toUpperCase()
          if (!icao) continue

          await pool.query(
            `INSERT INTO airports (
              icao_code, name, region, lat, lon, elevation_ft,
              rwy_m, rwy_desc, surface, fuel, remarks, source
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            ON CONFLICT (icao_code) DO UPDATE SET
              name = EXCLUDED.name,
              lat = EXCLUDED.lat,
              lon = EXCLUDED.lon,
              elevation_ft = EXCLUDED.elevation_ft,
              rwy_m = EXCLUDED.rwy_m,
              rwy_desc = EXCLUDED.rwy_desc,
              surface = EXCLUDED.surface,
              fuel = EXCLUDED.fuel`,
            [
              icao,
              row.name || icao,
              row.region || null,
              parseFloat(row.lat) || null,
              parseFloat(row.lon) || null,
              parseInt(row.elev_ft) || null,
              parseFloat(row.rwy_m) || null,
              row.rwy_desc || null,
              row.surface || null,
              row.fuel || null,
              row.remarks || null,
              row.source || 'AIP'
            ]
          )
          imported++
          if (imported % 500 === 0) console.log(`   Processed ${imported} airports...`)
        } catch (err) {
          console.error(`Error on airport ${row.icao}:`, err.message)
        }
      }
      console.log(`✅ Imported ${imported} airports`)
    }
    */

    // 2. Import navigation points from multiple AIP sources
    console.log('\n2️⃣ Importing navigation points from multiple AIPs...')
    const dataDir = getPath('data')
    const navFiles = fs.readdirSync(dataDir).filter(f => f.includes('enr44') || f.includes('nasr'))
    
    let totalNav = 0
    for (const filename of navFiles) {
      const filePath = path.join(dataDir, filename)
      try {
        const csvContent = fs.readFileSync(filePath, 'utf-8')
        const navpoints = parse(csvContent, { columns: true, skip_empty_lines: true, trim: true, bom: true })
        
        let imported = 0
        for (const row of navpoints) {
          try {
            const ident = (row.ident || '').trim().toUpperCase()
            if (!ident || !row.lat || !row.lon) continue

            let pt = (row.point_type || 'WAYPOINT').toUpperCase()
            if (pt === 'SIGNIFICANT_POINT' || pt === 'REP' || !['VOR', 'NDB', 'WAYPOINT', 'INTERSECTION', 'USER', 'AIRPORT'].includes(pt)) {
              pt = 'WAYPOINT'
            }

            await pool.query(
              `INSERT INTO navpoints (
                ident, name, lat, lon, point_type, region, provider, 
                source, validation_status, effective_date
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
              ON CONFLICT DO NOTHING`,
              [
                ident,
                row.name || ident,
                parseFloat(row.lat),
                parseFloat(row.lon),
                pt,
                row.region || null,
                row.provider || filename.split('_')[0].toUpperCase(),
                'IMPORTED',
                'UNVERIFIED',
                row.effective_date || null
              ]
            )
            imported++
          } catch (err) {
            console.error(`Error processing navpoint ${row.ident}:`, err.message)
          }
        }
        console.log(`   ✅ ${filename}: ${imported} navpoints`)
        totalNav += imported
      } catch (err) {
        console.log(`   ⚠️  Skipped ${filename}`)
      }
    }
    console.log(`✅ Total navpoints imported: ${totalNav}`)

    // 3. Import ALL airways
    console.log('\n3️⃣ Importing ALL airways...')
    const airwaysPath = getPath('data/airway_segments.csv')
    if (fs.existsSync(airwaysPath)) {
      const csvContent = fs.readFileSync(airwaysPath, 'utf-8')
      const airways = parse(csvContent, { columns: true, skip_empty_lines: true, trim: true, bom: true })
      
      let imported = 0
      for (const row of airways) { // ALL airways
        try {
          if (!row.route_id || !row.seq_no) continue
          
          await pool.query(
            `INSERT INTO airway_segments (
              route_id, seq_no, start_ident, end_ident, type, 
              lower_limit_fl, upper_limit_fl, direction, region, provider, validation_status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT DO NOTHING`,
            [
              row.route_id,
              parseInt(row.seq_no),
              row.start_ident,
              row.end_ident,
              row.type || 'BOTH',
              parseInt(row.lower_limit_fl) || null,
              parseInt(row.upper_limit_fl) || null,
              row.direction || null,
              row.region || null,
              row.provider || null,
              'UNVERIFIED'
            ]
          )
          imported++
        } catch (err) {
          // Continue on error
        }
      }
      console.log(`✅ Imported ${imported} airway segments`)
    }

    // 4. Create REAL aircraft fleet (NO DUMMY DATA)
    console.log('\n4️⃣ Creating REAL Dash 8-Q400 fleet...')
    await pool.query(
      `INSERT INTO aircraft (
        registration, type, manufacturer, mtow_kg, mlw_kg, mzfw_kg, bew_kg,
        max_pax, cruise_tas_kt, fuel_burn_kg_hr, flaps, notes, is_active
      ) VALUES
        ('5Y-DWN', 'Dash 8-Q400', 'Bombardier', 29257, 28123, 26762, 17380, 78, 360, 900, 
         ARRAY['5','10','15','35'], 'Primary aircraft - Kenya AOC', true),
        ('5Y-DWP', 'Dash 8-Q400', 'Bombardier', 29257, 28123, 26762, 17380, 78, 360, 900, 
         ARRAY['5','10','15','35'], 'Secondary aircraft - Kenya AOC', true)
      ON CONFLICT (registration) DO UPDATE SET
        type = EXCLUDED.type,
        mtow_kg = EXCLUDED.mtow_kg,
        mlw_kg = EXCLUDED.mlw_kg,
        mzfw_kg = EXCLUDED.mzfw_kg,
        bew_kg = EXCLUDED.bew_kg,
        notes = EXCLUDED.notes`
    )
    console.log('✅ Created Dash 8-Q400 aircraft fleet')

    console.log('\n✅ REAL DATA IMPORT COMPLETE - NO DUMMY DATA!')
    console.log('\n📊 Database Summary:')
    
    const { rows: airportCount } = await pool.query('SELECT COUNT(*) as count FROM airports')
    const { rows: navpointCount } = await pool.query('SELECT COUNT(*) as count FROM navpoints')
    const { rows: airwayCount } = await pool.query('SELECT COUNT(*) as count FROM airways')
    const { rows: aircraftCount } = await pool.query('SELECT COUNT(*) as count FROM aircraft')
    
    console.log(`   Airports: ${airportCount[0].count}`)
    console.log(`   Navpoints: ${navpointCount[0].count}`)
    console.log(`   Airways: ${airwayCount[0].count}`)
    console.log(`   Aircraft: ${aircraftCount[0].count}`)

    await pool.end()
  } catch (error) {
    console.error('❌ Error:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

importRealData()
