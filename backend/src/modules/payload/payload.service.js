/**
 * Payload Calculator Service
 * 
 * Computes complete fuel breakdown and payload capacity considering:
 * - RTOW limit at departure
 * - MZFW (Maximum Zero Fuel Weight) limit
 * - MLW (Maximum Landing Weight) limit
 * - Fuel requirements (trip, alternate, contingency, reserve, extra)
 */

import { query } from '../../config/database.js'
import { computeRTOW } from '../../services/rtow.service.js'
import AppError from '../../utils/AppError.js'

const LB_TO_KG = 0.453592
const EARTH_RADIUS_NM = 3440.065 // Nautical miles

/**
 * Great circle distance calculation (Haversine formula)
 */
function greatCircleNm(lat1, lon1, lat2, lon2) {
  const toRad = deg => deg * Math.PI / 180
  const p1 = toRad(lat1)
  const p2 = toRad(lat2)
  const dp = toRad(lat2 - lat1)
  const dl = toRad(lon2 - lon1)
  
  const a = Math.sin(dp / 2) ** 2 + 
            Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2
  
  return 2 * EARTH_RADIUS_NM * Math.asin(Math.sqrt(a))
}

/**
 * Compute complete payload calculation
 */
export async function computePayload({
  aircraft_id,
  dep_id,
  dest_id = null,
  alt_id = null,
  oat = 15,
  flap = 'auto',
  alt_dist_nm = 0,
  extra_fuel_lb = 0,
  reserve_min = null,
  trip_dist_nm = null
}) {
  // Get config values
  const { rows: configRows } = await query('SELECT key, value FROM app_config')
  const config = Object.fromEntries(configRows.map(r => [r.key, r.value]))
  
  const paxWeight = parseFloat(config.pax_weight_kg || '77')
  const contPct = parseFloat(config.contingency_pct || '5') / 100
  const reserveMin = reserve_min != null ? parseFloat(reserve_min) : parseFloat(config.reserve_minutes || '45')
  const routeFactor = 1 + (parseFloat(config.route_factor_pct || '5') / 100)

  // Fetch aircraft
  const { rows: aircraftRows } = await query('SELECT * FROM aircraft WHERE id = $1', [aircraft_id])
  if (aircraftRows.length === 0) throw new AppError('Aircraft not found', 404)
  const aircraft = aircraftRows[0]

  // Fetch departure airport
  const { rows: depRows } = await query('SELECT * FROM airports WHERE id = $1', [dep_id])
  if (depRows.length === 0) throw new AppError('Departure airport not found', 404)
  const dep = depRows[0]

  // Fetch destination (optional)
  let dest = null
  if (dest_id) {
    const { rows: destRows } = await query('SELECT * FROM airports WHERE id = $1', [dest_id])
    if (destRows.length > 0) dest = destRows[0]
  }

  // Fetch alternate (optional)
  let alt = null
  if (alt_id) {
    const { rows: altRows } = await query('SELECT * FROM airports WHERE id = $1', [alt_id])
    if (altRows.length > 0) alt = altRows[0]
  }

  const speed = parseFloat(aircraft.cruise_tas_kt) || 1
  const burnKgHr = parseFloat(aircraft.fuel_burn_kg_hr) || 0
  const burnLbHr = burnKgHr / LB_TO_KG

  // Calculate trip distance
  let tripNm = trip_dist_nm != null ? parseFloat(trip_dist_nm) : 0
  if (trip_dist_nm == null && dep.lat != null && dep.lon != null && dest?.lat != null && dest?.lon != null) {
    tripNm = greatCircleNm(
      parseFloat(dep.lat), parseFloat(dep.lon),
      parseFloat(dest.lat), parseFloat(dest.lon)
    ) * routeFactor
  }

  // Calculate alternate distance (use alternate coordinates if available)
  let altNm = parseFloat(alt_dist_nm) || 0
  if (alt && dest && alt.lat != null && alt.lon != null && dest.lat != null && dest.lon != null) {
    altNm = greatCircleNm(
      parseFloat(dest.lat), parseFloat(dest.lon),
      parseFloat(alt.lat), parseFloat(alt.lon)
    ) * routeFactor
  }

  // Fuel breakdown
  const tripH = tripNm / speed
  const tripF = Math.round(tripH * burnLbHr)
  
  const altH = altNm / speed
  const altF = Math.round(altH * burnLbHr)
  
  const contF = Math.round(tripF * contPct)
  const resF = Math.round((reserveMin / 60) * burnLbHr)
  const extraF = Math.round(parseFloat(extra_fuel_lb) || 0)
  
  const totalFLb = tripF + altF + contF + resF + extraF
  const totalFKg = Math.round(totalFLb * LB_TO_KG)

  // RTOW at departure
  const rtow = await computeRTOW(aircraft, dep, parseFloat(oat), flap)
  const rtowKg = rtow.rtow_kg

  // Weight limits
  const oewKg = Math.round(parseFloat(aircraft.bew_kg || aircraft.oew_kg || 0))
  const mzfwKg = Math.round(parseFloat(aircraft.mzfw_kg || 0))
  const mlwKg = Math.round(parseFloat(aircraft.mlw_kg || 0))

  // Payload constraints
  const tripFKg = Math.round(tripF * LB_TO_KG)
  
  const plFromTow = rtowKg - totalFKg - oewKg
  const plFromZfw = mzfwKg - oewKg
  
  // Landing weight = TOW - trip fuel, must be <= MLW
  const towFromMlw = mlwKg + tripFKg
  const plFromMlw = Math.min(rtowKg, towFromMlw) - totalFKg - oewKg

  let plKg = Math.max(0, Math.min(plFromTow, plFromZfw, plFromMlw))

  // Determine governing limit
  let gov = 'RTOW/TOW'
  if (plKg === plFromZfw && plFromZfw <= plFromTow && plFromZfw <= plFromMlw) {
    gov = 'MZFW'
  } else if (plKg === plFromMlw && plFromMlw <= plFromTow && plFromMlw <= plFromZfw) {
    gov = 'MLW'
  }

  const pax = paxWeight > 0 ? Math.floor(plKg / paxWeight) : 0
  const zfwKg = oewKg + Math.round(plKg)
  const towKg = zfwKg + totalFKg
  const lwKg = towKg - tripFKg

  // Check max fuel capacity
  const maxFuelLb = parseFloat(aircraft.max_fuel_lb || 0)
  const fuelExceeded = maxFuelLb > 0 && totalFLb > maxFuelLb

  return {
    rtow_kg: rtowKg,
    rtow_lb: Math.round(rtowKg / LB_TO_KG),
    limiting_factor: rtow.factor,
    wat_flap: rtow.wat_flap,
    
    fuel: {
      trip: tripF,
      alt: altF,
      cont: contF,
      reserve: resF,
      extra: extraF,
      total_lb: totalFLb,
      total_kg: totalFKg
    },
    
    trip_nm: Math.round(tripNm),
    alt_nm: Math.round(altNm),
    
    max_fuel_lb: maxFuelLb,
    fuel_exceeded: fuelExceeded,
    fuel_over_by_lb: fuelExceeded ? (totalFLb - maxFuelLb) : 0,
    
    payload_kg: Math.round(plKg),
    pax,
    pax_weight_kg: paxWeight,
    payload_governing: gov,
    
    oew_kg: oewKg,
    zfw_kg: zfwKg,
    mzfw_kg: mzfwKg,
    tow_kg: towKg,
    lw_kg: lwKg,
    mlw_kg: mlwKg,
    
    field_limit_note: rtow.field_limit_note,
    field_tables_ready: rtow.field_tables_ready
  }
}
