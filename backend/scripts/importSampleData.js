import 'dotenv/config'
import pg from 'pg'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { parse } from 'csv-parse/sync'

const { Pool } = pg
const __dirname = path.dirname(fileURLToPath(import.meta.url))

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
})

const LB_TO_KG = 0.453592

// Real aircraft from Python seed.py
const AIRCRAFT = [
  {
    reg: '5Y-DWN', fleet: 'DASH 8-300', icao: 'DH8C', speed_kt: 220, burn_lbhr: 1250,
    mtow_lb: 43000, mlw_lb: 42000, mzfw_lb: 39500, oew_lb: 27050, max_fuel_lb: 5400,
    flaps: ['0', '5', '10', '15']
  },
  {
    reg: '5Y-JOY', fleet: 'DASH 8-200', icao: 'DH8B', speed_kt: 220, burn_lbhr: 1250,
    mtow_lb: 36300, mlw_lb: 34500, mzfw_lb: 32400, oew_lb: 24300, max_fuel_lb: 5400,
    flaps: ['0', '5', '15']
  },
  {
    reg: '5Y-JMM', fleet: 'CRJ 200', icao: 'CRJ2', speed_kt: 420, burn_lbhr: 2950,
    mtow_lb: 53000, mlw_lb: 47000, mzfw_lb: 44000, oew_lb: 30900, max_fuel_lb: 14600,
    flaps: []
  }
]

// Real airports from Python seed.py
const STARTER_AIRPORTS = [
  {
    name: 'JUBA', icao: 'HJJJ', region: 'South Sudan', elev_ft: 1513, rwy_m: 3100,
    rwy_desc: '13/31, 3100m by 45m', surface: 'ASPHALT', fuel: 'JET A1',
    lat: 4.87194, lon: 31.60111, remarks: '', source: 'AIP'
  },
  {
    name: 'WILSON', icao: 'HKNW', region: 'Kenya', elev_ft: 5541, rwy_m: 1458,
    rwy_desc: '07/25, 1458m by 22m; 14/32, 1548m by 24m', surface: 'ASPHALT',
    fuel: 'JET A1 & AVGAS', lat: -1.32167, lon: 36.81333,
    remarks: 'Busy GA/training traffic; report to Customs.', source: 'AIP'
  },
  {
    name: 'MARSABIT', icao: 'HKMB', region: 'Kenya', elev_ft: 4370, rwy_m: 1100,
    rwy_desc: '10/28, 1100m by 15m', surface: 'BITUMEN', fuel: 'N/A',
    lat: 2.347, lon: 37.98417, remarks: 'High terrain surrounds field.', source: 'AIP'
  }
]

async function importRealData() {
  console.log('📦 Importing REAL production data from Python folder...\n')

  try {
    // 1. Import REAL aircraft
    console.log('1️⃣ Creating real aircraft fleet...')
    for (const a of AIRCRAFT) {
      await pool.query(
        `INSERT INTO aircraft (
          registration, type, manufacturer, 
          mtow_kg, mlw_kg, mzfw_kg, bew_kg, max_pax,
          cruise_tas_kt, fuel_burn_kg_hr, flaps, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (registration) DO UPDATE SET
          type = EXCLUDED.type,
          mtow_kg = EXCLUDED.mtow_kg,
          mlw_kg = EXCLUDED.mlw_kg,
          mzfw_kg = EXCLUDED.mzfw_kg,
          bew_kg = EXCLUDED.bew_kg,
          cruise_tas_kt = EXCLUDED.cruise_tas_kt,
          fuel_burn_kg_hr = EXCLUDED.fuel_burn_kg_hr,
          flaps = EXCLUDED.flaps`,
        [
          a.reg,
          a.fleet,
          a.fleet.includes('DASH') ? 'Bombardier' : 'Bombardier',
          Math.round(a.mtow_lb * LB_TO_KG),
          Math.round(a.mlw_lb * LB_TO_KG),
          Math.round(a.mzfw_lb * LB_TO_KG),
          Math.round(a.oew_lb * LB_TO_KG),
          a.fleet.includes('DASH 8-300') ? 50 : (a.fleet.includes('DASH 8-200') ? 37 : 50),
          a.speed_kt,
          Math.round(a.burn_lbhr * LB_TO_KG),
          a.flaps,
          `Real ${a.fleet} operated by Orca Aviation`
        ]
      )
    }
    console.log(`✅ Created ${AIRCRAFT.length} real aircraft`)

    // 2. Import starter airports
    console.log('\n2️⃣ Importing starter airports...')
    for (const ap of STARTER_AIRPORTS) {
      await pool.query(
        `INSERT INTO airports (
          icao_code, name, region, lat, lon, elevation_ft,
          rwy_m, rwy_desc, surface, fuel, remarks, source
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (icao_code) DO NOTHING`,
        [
          ap.icao, ap.name, ap.region, ap.lat, ap.lon, ap.elev_ft,
          ap.rwy_m, ap.rwy_desc, ap.surface, ap.fuel, ap.remarks, ap.source
        ]
      )
    }

    // 3. Import FULL airports database
    console.log('\n3️⃣ Importing complete airports database...')
    const airportsPath = path.join(__dirname, '../../orca-efb-v14-main/orca-efb-v14-main/data/airports_v14.csv')
    let airportsImported = 0
    if (fs.existsSync(airportsPath)) {
      const csvContent = fs.readFileSync(airportsPath, 'utf-8')
      const airports = parse(csvContent, { columns: true, skip_empty_lines: true, trim: true })
      
      for (const row of airports) {
        try {
          const icao = (row.icao || '').trim().toUpperCase()
          if (!icao) continue

          await pool.query(
            `INSERT INTO airports (
              icao_code, name, region, lat, lon, elevation_ft,
              rwy_m, rwy_desc, surface, fuel, remarks, source
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            ON CONFLICT (icao_code) DO NOTHING`,
            [
              icao,
              row.name || icao,
              row.region || null,
              row.lat ? parseFloat(row.lat) : null,
              row.lon ? parseFloat(row.lon) : null,
              row.elev_ft ? parseInt(row.elev_ft) : null,
              row.rwy_m ? parseFloat(row.rwy_m) : null,
              row.rwy_desc || null,
              row.surface || null,
              row.fuel || null,
              row.remarks || null,
              row.source || 'AIP'
            ]
          )
          airportsImported++
        } catch (err) {
          // Skip errors
        }
      }
      console.log(`✅ Imported ${airportsImported} airports`)
    }

    // 4. Import navigation waypoints from multiple sources
    console.log('\n4️⃣ Importing navigation waypoints...')
    const waypointSources = [
      { file: 'kcaa_enr44_2026-03-19.csv', provider: 'KCAA', region: 'KENYA / NAIROBI FIR' },
      { file: 'asecna_enr44_2026-06-11.csv', provider: 'ASECNA', region: 'ASECNA' },
      { file: 'sacaa_enr44_2026-04-15.csv', provider: 'SACAA', region: 'SOUTH AFRICA' },
      { file: 'ncaa_namibia_enr44_2025-08-07.csv', provider: 'NCAA NAMIBIA', region: 'NAMIBIA' },
      { file: 'scaa_somalia_enr44_2025-11-27.csv', provider: 'SCAA SOMALIA', region: 'SOMALIA' }
    ]

    let totalWaypoints = 0
    for (const source of waypointSources) {
      const waypointPath = path.join(__dirname, '../../orca-efb-v14-main/orca-efb-v14-main/data', source.file)
      if (fs.existsSync(waypointPath)) {
        const csvContent = fs.readFileSync(waypointPath, 'utf-8')
        const waypoints = parse(csvContent, { columns: true, skip_empty_lines: true, trim: true })
        
        let imported = 0
        for (const row of waypoints) {
          try {
            const ident = (row.ident || '').trim().toUpperCase()
            if (!ident || !row.lat || !row.lon) continue

            await pool.query(
              `INSERT INTO navpoints (
                ident, name, lat, lon, point_type, region, provider, source, 
                validation_status, effective_date
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
              ON CONFLICT DO NOTHING`,
              [
                ident,
                row.name || ident,
                parseFloat(row.lat),
                parseFloat(row.lon),
                row.point_type || 'SIGNIFICANT_POINT',
                row.region || source.region,
                source.provider,
                'AIP',
                'AIP_EXTRACTED',
                row.effective_date || null
              ]
            )
            imported++
          } catch (err) {
            // Skip errors
          }
        }
        console.log(`   ${source.provider}: ${imported} waypoints`)
        totalWaypoints += imported
      }
    }
    console.log(`✅ Total waypoints imported: ${totalWaypoints}`)

    // 5. Import airway segments
    console.log('\n5️⃣ Importing airway segments...')
    const airwaysPath = path.join(__dirname, '../../orca-efb-v14-main/orca-efb-v14-main/data/airway_segments.csv')
    let airwaysImported = 0
    if (fs.existsSync(airwaysPath)) {
      const csvContent = fs.readFileSync(airwaysPath, 'utf-8')
      const airways = parse(csvContent, { columns: true, skip_empty_lines: true, trim: true })
      
      for (const row of airways) {
        try {
          const routeName = (row.route_name || row.airway || '').trim().toUpperCase()
          const fromIdent = (row.from_ident || '').trim().toUpperCase()
          const toIdent = (row.to_ident || '').trim().toUpperCase()
          
          if (!routeName || !fromIdent || !toIdent) continue
          if (!row.from_lat || !row.from_lon || !row.to_lat || !row.to_lon) continue

          await pool.query(
            `INSERT INTO airways (
              route_name, seq, from_ident, to_ident,
              from_lat, from_lon, to_lat, to_lon,
              lower_limit, upper_limit, direction, region, provider, validation_status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            ON CONFLICT DO NOTHING`,
            [
              routeName,
              parseInt(row.seq || row.sequence || 0),
              fromIdent,
              toIdent,
              parseFloat(row.from_lat),
              parseFloat(row.from_lon),
              parseFloat(row.to_lat),
              parseFloat(row.to_lon),
              row.lower_limit || null,
              row.upper_limit || null,
              row.direction || null,
              row.region || null,
              row.provider || null,
              row.validation_status || 'AIP_EXTRACTED'
            ]
          )
          airwaysImported++
        } catch (err) {
          // Skip errors
        }
      }
      console.log(`✅ Imported ${airwaysImported} airway segments`)
    }

    // Summary
    console.log('\n✅ REAL production data import complete!')
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
