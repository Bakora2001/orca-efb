import 'dotenv/config'
import pg from 'pg'

const pool = new pg.Pool({
  connectionString: 'postgres://kscrn_user:42084-vic1-Maxypike-219221@172.81.133.161:5432/orca_efb1',
  connectionTimeoutMillis: 120000,
  idleTimeoutMillis: 120000,
  query_timeout: 120000,
})

const DH8C_WAT = {
 0:{0:{20:19505,25:19505,30:19450,35:19200,40:18900,45:18500,50:18050},1000:{20:19505,25:19450,30:19300,35:19000,40:18700,45:18300,50:17850},2000:{20:19505,25:19350,30:19100,35:18750,40:18400,45:18000,50:17550},3000:{20:19400,25:19150,30:18850,35:18500,40:18100,45:17700,50:17250},4000:{20:19300,25:18950,30:18600,35:18200,40:17800,45:17400,50:16950},5000:{20:19050,25:18700,30:18300,35:17900,40:17500,45:17100,50:16650},6000:{20:18750,25:18400,30:18000,35:17600,40:17200,45:16800,50:16350},7000:{20:18400,25:18050,30:17650,35:17250,40:16850,45:16450,50:16000},8000:{20:18000,25:17650,30:17250,35:16850,40:16450,45:16050,50:15600}},
 5:{0:{20:19505,25:19505,30:19505,35:19250,40:18950,45:18550,50:18100},1000:{20:19505,25:19505,30:19350,35:19050,40:18750,45:18350,50:17900},2000:{20:19505,25:19400,30:19150,35:18800,40:18450,45:18050,50:17600},3000:{20:19505,25:19200,30:18900,35:18550,40:18150,45:17750,50:17300},4000:{20:19350,25:19000,30:18650,35:18250,40:17850,45:17450,50:17000},5000:{20:19100,25:18750,30:18350,35:17950,40:17550,45:17150,50:16700},6000:{20:18800,25:18450,30:18050,35:17650,40:17250,45:16850,50:16400},7000:{20:18450,25:18100,30:17700,35:17300,40:16900,45:16500,50:16050},8000:{20:18050,25:17700,30:17300,35:16900,40:16500,45:16100,50:15650}},
 10:{0:{20:19505,25:19505,30:19350,35:19000,40:18550,45:18100,50:17650},1000:{20:19505,25:19400,30:19100,35:18700,40:18150,45:17700,50:17250},2000:{20:19450,25:19150,30:18800,35:18350,40:17850,45:17400,50:16950},3000:{20:19250,25:18900,30:18500,35:18050,40:17550,45:17100,50:16650},4000:{20:19000,25:18600,30:18150,35:17700,40:17200,45:16750,50:16300},5000:{20:18650,25:18250,30:17750,35:17300,40:16800,45:16350,50:15900},6000:{20:18250,25:17850,30:17350,35:16850,40:16350,45:15900,50:15450},7000:{20:17800,25:17400,30:16900,35:16400,40:15900,45:15450,50:15000},8000:{20:17350,25:16950,30:16400,35:15900,40:15400,45:14950,50:14500}},
 15:{0:{20:19505,25:19350,30:19000,35:18550,40:18050,45:17550,50:17050},1000:{20:19450,25:19150,30:18750,35:18300,40:17250,45:16800,50:16350},2000:{20:19250,25:18900,30:18500,35:18000,40:16950,45:16500,50:16050},3000:{20:19000,25:18650,30:18200,35:17650,40:16650,45:16200,50:15750},4000:{20:18700,25:18300,30:17850,35:17250,40:16350,45:15900,50:15450},5000:{20:18350,25:17950,30:17450,35:16850,40:16000,45:15550,50:15100},6000:{20:17950,25:17550,30:17050,35:16450,40:15650,45:15200,50:14750},7000:{20:17500,25:17100,30:16600,35:16050,40:15300,45:14850,50:14400},8000:{20:17050,25:16650,30:16150,35:15600,40:14950,45:14500,50:14050}},
}

const S2 = 16465
const DH8B_WAT = {
 0:{0:{20:S2,25:S2,30:S2,35:S2,40:15850,45:15550,50:15200},1000:{20:S2,25:S2,30:S2,35:15950,40:15700,45:15400,50:15050},2000:{20:S2,25:S2,30:S2,35:15800,40:15500,45:15200,50:14850},3000:{20:S2,25:S2,30:15950,35:15650,40:15300,45:15000,50:14650},4000:{20:S2,25:S2,30:15800,35:15450,40:15100,45:14800,50:14450},5000:{20:S2,25:S2,30:15650,35:15250,40:14900,45:14550,50:14200},6000:{20:S2,25:15850,30:15450,35:15000,40:14650,45:14300,50:13950},7000:{20:15950,25:15650,30:15200,35:14750,40:14400,45:14050,50:13700},8000:{20:15700,25:15400,30:14950,35:14450,40:14100,45:13750,50:13400}},
 5:{0:{20:S2,25:S2,30:S2,35:S2,40:16000,45:15700,50:15350},1000:{20:S2,25:S2,30:S2,35:16100,40:15850,45:15550,50:15200},2000:{20:S2,25:S2,30:S2,35:15950,40:15650,45:15350,50:15000},3000:{20:S2,25:S2,30:16100,35:15800,40:15450,45:15150,50:14800},4000:{20:S2,25:S2,30:15950,35:15600,40:15250,45:14950,50:14600},5000:{20:S2,25:S2,30:15800,35:15400,40:15050,45:14700,50:14350},6000:{20:S2,25:16000,30:15600,35:15150,40:14800,45:14450,50:14100},7000:{20:16100,25:15800,30:15350,35:14900,40:14550,45:14200,50:13850},8000:{20:15900,25:15550,30:15100,35:14600,40:14250,45:13900,50:13550}},
 15:{0:{20:S2,25:S2,30:S2,35:15950,40:15650,45:15350,50:15000},1000:{20:S2,25:S2,30:S2,35:15800,40:15500,45:15200,50:14850},2000:{20:S2,25:S2,30:16050,35:15650,40:15300,45:15000,50:14650},3000:{20:S2,25:S2,30:15850,35:15450,40:15100,45:14800,50:14450},4000:{20:S2,25:16100,30:15650,35:15200,40:14850,45:14500,50:14150},5000:{20:S2,25:15900,30:15450,35:14950,40:14600,45:14250,50:13900},6000:{20:16050,25:15650,30:15200,35:14650,40:14300,45:13950,50:13600},7000:{20:15800,25:15400,30:14900,35:14350,40:14000,45:13650,50:13300},8000:{20:15500,25:15100,30:14600,35:14000,40:13650,45:13300,50:12950}},
}

const DH8C_TODA={0:{20:1180,25:1250,30:1330,35:1420},1000:{20:1260,25:1340,30:1430,35:1530},2000:{20:1350,25:1440,30:1540,35:1650},3000:{20:1460,25:1560,30:1670,35:1790},4000:{20:1580,25:1690,30:1810,35:1950},5000:{20:1710,25:1830,30:1970,35:2130},6000:{20:1860,25:2000,30:2150,35:2330},7000:{20:2030,25:2180,30:2350,35:2550},8000:{20:2220,25:2390,30:2580,35:2800}}
const DH8C_ASDA={0:{20:1260,25:1340,30:1430,35:1530},1000:{20:1350,25:1440,30:1540,35:1650},2000:{20:1450,25:1550,30:1660,35:1790},3000:{20:1570,25:1680,30:1800,35:1940},4000:{20:1700,25:1820,30:1960,35:2120},5000:{20:1850,25:1980,30:2140,35:2320},6000:{20:2010,25:2160,30:2340,35:2540},7000:{20:2190,25:2360,30:2560,35:2790},8000:{20:2390,25:2580,30:2800,35:3060}}

function scaleFieldGrid(base, scale) {
  const result = {}
  for (const elev in base) {
    result[elev] = {}
    for (const oat in base[elev]) {
      result[elev][oat] = Math.round((base[elev][oat] * scale) / 10.0) * 10
    }
  }
  return result
}

function weightScaledFieldGrid(base, refWeight, targetWeight) {
  const scale = Math.pow(targetWeight / refWeight, 2)
  return scaleFieldGrid(base, scale)
}

const DH8B_TODA = scaleFieldGrid(DH8C_TODA, 1265 / 1770)
const DH8B_ASDA = scaleFieldGrid(DH8C_ASDA, 1160 / 1350)

const DH8C_FIELD_REF_WEIGHT = 17200
const DH8B_FIELD_REF_WEIGHT = 14700
const DH8C_FIELD_WEIGHTS = [15000, 16000, 17200, 18000, 19000, 19500]
const DH8B_FIELD_WEIGHTS = [12000, 13000, 14000, 14700, 15500, 16465]

// Build flat row arrays from nested objects
function buildWatRows(aircraftId, data) {
  const rows = []
  for (const flap in data) {
    for (const elev in data[flap]) {
      for (const oat in data[flap][elev]) {
        rows.push([aircraftId, 'WAT', Number(flap), Number(elev), Number(oat), data[flap][elev][oat], null])
      }
    }
  }
  return rows
}

function buildFieldRows(aircraftId, ttype, refGrid, refWeight, weights, flaps) {
  const rows = []
  for (const weight of weights) {
    const grid = weightScaledFieldGrid(refGrid, refWeight, weight)
    for (const flap of flaps) {
      for (const elev in grid) {
        for (const oat in grid[elev]) {
          rows.push([aircraftId, ttype, Number(flap), Number(elev), Number(oat), grid[elev][oat], weight])
        }
      }
    }
  }
  return rows
}

// Insert rows in chunks using multi-row INSERT
async function bulkUpsert(client, rows, hasWeight) {
  const CHUNK = 500
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    const values = []
    const placeholders = chunk.map((row, idx) => {
      const base = idx * 7
      values.push(...row)
      if (hasWeight) {
        return `($${base+1},$${base+2},$${base+3},$${base+4},$${base+5},$${base+6},$${base+7})`
      } else {
        return `($${base+1},$${base+2},$${base+3},$${base+4},$${base+5},$${base+6},NULL)`
      }
    }).join(',')

    if (hasWeight) {
      await client.query(`
        INSERT INTO performance_cells (aircraft_id, table_type, flap_setting, elevation_ft, temp_c, value_kg, weight_kg)
        VALUES ${placeholders}
        ON CONFLICT DO NOTHING
      `, values)
    } else {
      // WAT: weight_kg is NULL, strip the 7th element from values
      const watValues = []
      const watPlaceholders = chunk.map((row, idx) => {
        const base = idx * 6
        watValues.push(row[0], row[1], row[2], row[3], row[4], row[5])
        return `($${base+1},$${base+2},$${base+3},$${base+4},$${base+5},$${base+6},NULL)`
      }).join(',')
      await client.query(`
        INSERT INTO performance_cells (aircraft_id, table_type, flap_setting, elevation_ft, temp_c, value_kg, weight_kg)
        VALUES ${watPlaceholders}
        ON CONFLICT DO NOTHING
      `, watValues)
    }
    console.log(`  Inserted rows ${i+1}-${Math.min(i+CHUNK, rows.length)} of ${rows.length}`)
  }
}

async function run() {
  const client = await pool.connect()
  try {
    const acsRes = await client.query('SELECT id, registration, type, flaps FROM aircraft')
    const getAc = (reg) => acsRes.rows.find(a => a.registration === reg)

    const dw = getAc('5Y-DWN')
    const joy = getAc('5Y-JOY')

    if (!dw || !joy) {
      console.error('Aircraft not found. Found:', acsRes.rows.map(r => r.registration))
      return
    }

    console.log(`Found: ${dw.registration} (id=${dw.id}), ${joy.registration} (id=${joy.id})`)

    // Drop old unique constraint so ON CONFLICT DO NOTHING works without weight_kg
    await client.query(`
      ALTER TABLE performance_cells
      DROP CONSTRAINT IF EXISTS performance_cells_aircraft_id_table_type_flap_setting_eleva_key
    `)

    // Add new composite unique index that includes weight_kg (nullable handled via COALESCE)
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS perf_cells_unique_idx
      ON performance_cells (aircraft_id, table_type, flap_setting, elevation_ft, temp_c, COALESCE(weight_kg, -1))
    `)
    console.log('Constraint/index ready.')

    // Delete existing data for these aircraft to do clean re-seed
    await client.query(`DELETE FROM performance_cells WHERE aircraft_id IN ($1, $2)`, [dw.id, joy.id])
    console.log('Cleared old data.')

    console.log('Loading WAT tables...')
    const dwWatRows = buildWatRows(dw.id, DH8C_WAT)
    const joyWatRows = buildWatRows(joy.id, DH8B_WAT)
    console.log(`  DWN WAT: ${dwWatRows.length} rows, JOY WAT: ${joyWatRows.length} rows`)
    await bulkUpsert(client, dwWatRows, false)
    await bulkUpsert(client, joyWatRows, false)

    console.log('Loading TODA tables...')
    const dwTodaRows = buildFieldRows(dw.id, 'TODA', DH8C_TODA, DH8C_FIELD_REF_WEIGHT, DH8C_FIELD_WEIGHTS, dw.flaps)
    const joyTodaRows = buildFieldRows(joy.id, 'TODA', DH8B_TODA, DH8B_FIELD_REF_WEIGHT, DH8B_FIELD_WEIGHTS, joy.flaps)
    console.log(`  DWN TODA: ${dwTodaRows.length} rows, JOY TODA: ${joyTodaRows.length} rows`)
    await bulkUpsert(client, dwTodaRows, true)
    await bulkUpsert(client, joyTodaRows, true)

    console.log('Loading ASDA tables...')
    const dwAsdaRows = buildFieldRows(dw.id, 'ASDA', DH8C_ASDA, DH8C_FIELD_REF_WEIGHT, DH8C_FIELD_WEIGHTS, dw.flaps)
    const joyAsdaRows = buildFieldRows(joy.id, 'ASDA', DH8B_ASDA, DH8B_FIELD_REF_WEIGHT, DH8B_FIELD_WEIGHTS, joy.flaps)
    console.log(`  DWN ASDA: ${dwAsdaRows.length} rows, JOY ASDA: ${joyAsdaRows.length} rows`)
    await bulkUpsert(client, dwAsdaRows, true)
    await bulkUpsert(client, joyAsdaRows, true)

    console.log('\n✅ Done! All performance data seeded successfully.')
  } catch(e) {
    console.error('Seed failed:', e.message)
    throw e
  } finally {
    client.release()
    await pool.end()
  }
}
run()
