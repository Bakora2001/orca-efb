/**
 * Remove Dummy Data Script
 * Removes any dummy/sample data from the database
 */

import pg from 'pg'
import 'dotenv/config'

const pool = new pg.Pool({
  host: process.env.DB_HOST || '172.81.133.161',
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'orca_efb1',
  user: process.env.DB_USER || 'kscrn_user',
  password: process.env.DB_PASSWORD,
  ssl: false
})

async function checkAndRemoveDummyData() {
  const client = await pool.connect()

  try {
    console.log('\n=== Checking for dummy data ===\n')

    // Check aircraft
    const aircraft = await client.query('SELECT id, registration, type FROM aircraft ORDER BY registration')
    console.log('AIRCRAFT FOUND:')
    aircraft.rows.forEach(a => {
      console.log(`  - ${a.registration} (${a.type})`)
    })

    // Check airports count
    const airportCount = await client.query('SELECT COUNT(*) as count FROM airports')
    console.log(`\nAIRPORTS: ${airportCount.rows[0].count} total`)

    // Check for dummy/sample aircraft (not 5Y-DWN or 5Y-DWP which are real)
    const dummyAircraft = aircraft.rows.filter(a => 
      !a.registration.startsWith('5Y-DW') && 
      a.registration !== '5Y-DWN' && 
      a.registration !== '5Y-DWP'
    )

    if (dummyAircraft.length > 0) {
      console.log('\n=== REMOVING DUMMY AIRCRAFT ===')
      for (const dummy of dummyAircraft) {
        console.log(`Removing: ${dummy.registration} (${dummy.type})`)
        await client.query('DELETE FROM aircraft WHERE id = $1', [dummy.id])
      }
      console.log(`✓ Removed ${dummyAircraft.length} dummy aircraft`)
    } else {
      console.log('\n✓ No dummy aircraft found')
    }

    // Check if there are airports with source 'SAMPLE' or 'DUMMY'
    const dummyAirports = await client.query(
      `SELECT COUNT(*) as count FROM airports WHERE source IN ('SAMPLE', 'DUMMY', 'TEST')`
    )
    
    if (parseInt(dummyAirports.rows[0].count) > 0) {
      console.log(`\n=== REMOVING ${dummyAirports.rows[0].count} DUMMY AIRPORTS ===`)
      await client.query(`DELETE FROM airports WHERE source IN ('SAMPLE', 'DUMMY', 'TEST')`)
      console.log('✓ Dummy airports removed')
    }

    // Check if there are dummy navpoints (skip if table doesn't exist)
    try {
      const dummyNavpoints = await client.query(
        `SELECT COUNT(*) as count FROM nav_points WHERE provider IN ('SAMPLE', 'DUMMY', 'TEST')`
      )
      
      if (parseInt(dummyNavpoints.rows[0].count) > 0) {
        console.log(`\n=== REMOVING ${dummyNavpoints.rows[0].count} DUMMY NAVPOINTS ===`)
        await client.query(`DELETE FROM nav_points WHERE provider IN ('SAMPLE', 'DUMMY', 'TEST')`)
        console.log('✓ Dummy navpoints removed')
      }
    } catch (err) {
      if (err.code === '42P01') {
        console.log('\n✓ nav_points table does not exist (will be created later)')
      } else {
        throw err
      }
    }

    // Final count
    console.log('\n=== FINAL DATA SUMMARY ===')
    const finalAircraft = await client.query('SELECT COUNT(*) as count FROM aircraft')
    const finalAirports = await client.query('SELECT COUNT(*) as count FROM airports')
    
    let finalNavpoints = { rows: [{ count: '0' }] }
    let finalAirways = { rows: [{ count: '0' }] }
    
    try {
      finalNavpoints = await client.query('SELECT COUNT(*) as count FROM nav_points')
      finalAirways = await client.query('SELECT COUNT(*) as count FROM airways')
    } catch (err) {
      // Tables don't exist yet
    }

    console.log(`Aircraft: ${finalAircraft.rows[0].count}`)
    console.log(`Airports: ${finalAirports.rows[0].count}`)
    console.log(`Navpoints: ${finalNavpoints.rows[0].count}`)
    console.log(`Airways: ${finalAirways.rows[0].count}`)

    console.log('\n✓ Dummy data cleanup completed!\n')

  } catch (error) {
    console.error('Error:', error.message)
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

checkAndRemoveDummyData()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Failed:', err)
    process.exit(1)
  })
