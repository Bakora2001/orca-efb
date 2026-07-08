import { query } from '../../config/database.js'
import { computeRTOW } from '../../services/rtow.service.js'
import AppError from '../../utils/AppError.js'

/**
 * Compute RTOW for a given aircraft, airport, and conditions
 */
export async function compute({ aircraft_id, airport_id, oat, flap = 'auto' }) {
  // Fetch aircraft
  const { rows: aircraftRows } = await query(
    'SELECT * FROM aircraft WHERE id = $1',
    [aircraft_id]
  )
  
  if (aircraftRows.length === 0) {
    throw new AppError('Aircraft not found', 404)
  }

  // Fetch airport
  const { rows: airportRows } = await query(
    'SELECT * FROM airports WHERE id = $1',
    [airport_id]
  )

  if (airportRows.length === 0) {
    throw new AppError('Airport not found', 404)
  }

  const aircraft = aircraftRows[0]
  const airport = airportRows[0]
  const oatC = parseFloat(oat)

  // Compute RTOW
  const result = await computeRTOW(aircraft, airport, oatC, flap)

  // Add lb conversion
  const LB_TO_KG = 0.453592
  result.rtow_lb = Math.round(result.rtow_kg / LB_TO_KG)

  return result
}
