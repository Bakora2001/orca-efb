/**
 * payload.service.js
 * ──────────────────
 * Full payload + fuel calculation.
 *
 * Computes:
 *   • RTOW at departure (via rtow.service)
 *   • Trip / alternate / contingency / reserve / extra fuel
 *   • Payload capacity under ZFW, MZFW, and MLW constraints
 *   • Fuel tank capacity checks
 */

import { query } from '../../config/database.js'
import { computeRTOW } from '../../services/rtow.service.js'
import AppError from '../../utils/AppError.js'

const KG_TO_LB = 2.20462
const LB_TO_KG = 0.453592
const EARTH_RADIUS_NM = 3440.065

// ═══════════════════════════════════════════════════════════════════════════
// GREAT-CIRCLE DISTANCE
// ═══════════════════════════════════════════════════════════════════════════

function gcNm(lat1, lon1, lat2, lon2) {
  const toRad = d => d * Math.PI / 180
  const p1 = toRad(lat1), p2 = toRad(lat2)
  const dp = toRad(lat2 - lat1), dl = toRad(lon2 - lon1)
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2
  return 2 * EARTH_RADIUS_NM * Math.asin(Math.sqrt(h))
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════

export async function calculatePayload({
  aircraft_id,
  dep_id,
  dest_id,
  alt_id,
  oat,
  flap = 'auto',
  alt_dist_nm = 0,
  trip_dist_nm = null,
  extra_fuel_lb = 0,
  reserve_min = null,
}) {
  // ── Load aircraft ─────────────────────────────────────────────
  const acRes = await query(
    `SELECT id, registration, type, mtow_kg, mlw_kg, mzfw_kg, bew_kg,
            max_pax, cruise_tas_kt, fuel_burn_kg_hr, flaps, max_fuel_lb
     FROM aircraft WHERE id = $1 AND is_active = true`,
    [aircraft_id]
  )
  if (acRes.rows.length === 0) throw new AppError('Aircraft not found', 404)
  const ac = acRes.rows[0]

  // ── Load airports (single query) ──────────────────────────────
  const airportIds = [dep_id, dest_id, alt_id].filter(Boolean)
  const apRes = await query(
    `SELECT id, icao_code, name, lat, lon, elevation_ft, rwy_m
     FROM airports WHERE id = ANY($1::uuid[]) AND is_active = true`,
    [airportIds]
  )
  const apMap = {}
  for (const ap of apRes.rows) apMap[ap.id] = ap

  const dep  = apMap[dep_id]
  const dest = apMap[dest_id]
  const alt  = alt_id ? apMap[alt_id] : null

  if (!dep)  throw new AppError('Departure airport not found', 404)
  if (!dest) throw new AppError('Destination airport not found', 404)

  // ── Load app_config ───────────────────────────────────────────
  const cfgRes = await query('SELECT key, value FROM app_config')
  const cfg = Object.fromEntries(cfgRes.rows.map(r => [r.key, r.value]))

  const paxWeightKg    = parseFloat(cfg.pax_weight_kg   ?? '77')
  const contingencyPct = parseFloat(cfg.contingency_pct ?? '5') / 100
  const reserveMinutes = reserve_min != null
    ? parseFloat(reserve_min)
    : parseFloat(cfg.reserve_minutes ?? '45')
  const routeFactorPct = parseFloat(cfg.route_factor_pct ?? '0') / 100
  const routeFactor     = 1 + routeFactorPct

  const burnRateKgHr = parseFloat(ac.fuel_burn_kg_hr)
  const cruiseTasKt  = parseFloat(ac.cruise_tas_kt)
  const burnRateLbHr = burnRateKgHr * KG_TO_LB

  // ── Distances ─────────────────────────────────────────────────
  // Trip distance: use override if provided, otherwise great-circle
  let gcTripNm, tripNm
  if (trip_dist_nm != null) {
    tripNm   = parseFloat(trip_dist_nm) * routeFactor
    gcTripNm = parseFloat(trip_dist_nm)
  } else {
    gcTripNm = gcNm(
      parseFloat(dep.lat), parseFloat(dep.lon),
      parseFloat(dest.lat), parseFloat(dest.lon)
    )
    tripNm = gcTripNm * routeFactor
  }

  // Alternate distance: override or great-circle from dest to alt
  const altNm = alt_dist_nm > 0
    ? parseFloat(alt_dist_nm) * routeFactor
    : alt
      ? gcNm(
          parseFloat(dest.lat), parseFloat(dest.lon),
          parseFloat(alt.lat), parseFloat(alt.lon)
        ) * routeFactor
      : 0

  // ── Fuel breakdown (lb) ───────────────────────────────────────
  const tripFuelLb  = (tripNm / cruiseTasKt) * burnRateLbHr
  const altFuelLb   = (altNm  / cruiseTasKt) * burnRateLbHr
  const contFuelLb  = tripFuelLb * contingencyPct
  const resvFuelLb  = (reserveMinutes / 60) * burnRateLbHr
  const extraFuelLb = parseFloat(extra_fuel_lb) || 0
  const totalFuelLb = tripFuelLb + altFuelLb + contFuelLb + resvFuelLb + extraFuelLb
  const totalFuelKg = totalFuelLb * LB_TO_KG
  const tripFuelKg  = tripFuelLb  * LB_TO_KG

  // ── RTOW ──────────────────────────────────────────────────────
  const rtowResult = await computeRTOW(aircraft_id, dep_id, parseFloat(oat), flap)
  const rtowKg     = rtowResult.rtow_kg

  // ── Weight limits ─────────────────────────────────────────────
  const mtowKg = parseFloat(ac.mtow_kg)
  const mlwKg  = parseFloat(ac.mlw_kg)
  const mzfwKg = parseFloat(ac.mzfw_kg)
  const bewKg  = parseFloat(ac.bew_kg) || parseFloat(ac.oew_kg) || 0
  const maxFuelLb = parseFloat(ac.max_fuel_lb) || 0

  const towKg = Math.min(rtowKg, mtowKg) // RTOW already ≤ MTOW, but belt-and-suspenders
  const lwKg  = towKg - tripFuelKg
  const zfwKg = towKg - totalFuelKg

  // ── Payload constraints ────────────────────────────────────────
  const payloadFromTow  = towKg - totalFuelKg - bewKg
  const payloadFromZfw  = zfwKg - bewKg
  const payloadFromMzfw = mzfwKg - bewKg

  // MLW constraint: TOW must allow landing at or below MLW after trip burn
  const towFromMlw = mlwKg + tripFuelKg
  const payloadFromMlw = Math.min(rtowKg, towFromMlw) - totalFuelKg - bewKg

  let payloadKg = Math.max(0, Math.min(payloadFromTow, payloadFromZfw, payloadFromMzfw, payloadFromMlw))

  // ── Governing limit ────────────────────────────────────────────
  let payloadGoverning = 'ZFW'
  const limits = [
    { label: 'ZFW',   value: payloadFromZfw },
    { label: 'MZFW',  value: payloadFromMzfw },
    { label: 'MLW',   value: payloadFromMlw },
    { label: 'RTOW',  value: payloadFromTow },
  ]
  const governing = limits.reduce((min, cur) => cur.value < min.value ? cur : min)
  payloadGoverning = governing.label

  // ── PAX ────────────────────────────────────────────────────────
  const pax = payloadKg > 0 ? Math.floor(payloadKg / paxWeightKg) : 0

  // ── LW check ───────────────────────────────────────────────────
  const lwLimitOk = lwKg <= mlwKg

  // ── Fuel tank check ────────────────────────────────────────────
  const fuelExceeded = maxFuelLb > 0 && totalFuelLb > maxFuelLb
  const fuelOverByLb = fuelExceeded ? totalFuelLb - maxFuelLb : 0
  const maxFuelFromTow = (towKg - bewKg) * KG_TO_LB

  return {
    // Core outputs
    payload_kg:    Math.max(0, Math.round(payloadKg)),
    pax:           Math.max(0, pax),
    pax_weight_kg: paxWeightKg,

    // Weights
    tow_kg:  Math.round(towKg),
    lw_kg:   Math.round(lwKg),
    zfw_kg:  Math.round(zfwKg),
    bew_kg:  Math.round(bewKg),
    rtow_kg: rtowKg,
    mlw_kg:  mlwKg,
    mzfw_kg: mzfwKg,
    mtow_kg: mtowKg,

    // Distances
    trip_nm:    Math.round(tripNm * 10) / 10,
    gc_trip_nm: Math.round(gcTripNm * 10) / 10,
    alt_nm:     Math.round(altNm * 10) / 10,

    // Fuel breakdown
    fuel: {
      trip_lb:    Math.round(tripFuelLb),
      alt_lb:     Math.round(altFuelLb),
      cont_lb:    Math.round(contFuelLb),
      reserve_lb: Math.round(resvFuelLb),
      extra_lb:   Math.round(extraFuelLb),
      total_lb:   Math.round(totalFuelLb),
      total_kg:   Math.round(totalFuelKg),
    },

    // Fuel tank limits
    max_fuel_lb:      maxFuelLb,
    max_fuel_from_tow_lb: Math.round(maxFuelFromTow),
    fuel_exceeded:    fuelExceeded,
    fuel_over_by_lb:  Math.round(fuelOverByLb),

    // Flags and notes
    payload_governing: payloadGoverning,
    lw_limit_ok:       lwLimitOk,
    field_limit_note:  rtowResult.field_limit_note,
    wat_flap:          rtowResult.wat_flap,
    rtow_factor:       rtowResult.factor,
  }
}


// /**
//  * Payload Calculator Service
//  * 
//  * Computes complete fuel breakdown and payload capacity considering:
//  * - RTOW limit at departure
//  * - MZFW (Maximum Zero Fuel Weight) limit
//  * - MLW (Maximum Landing Weight) limit
//  * - Fuel requirements (trip, alternate, contingency, reserve, extra)
//  */

// import { query } from '../../config/database.js'
// import { computeRTOW } from '../../services/rtow.service.js'
// import AppError from '../../utils/AppError.js'

// const LB_TO_KG = 0.453592
// const EARTH_RADIUS_NM = 3440.065 // Nautical miles

// /**
//  * Great circle distance calculation (Haversine formula)
//  */
// function greatCircleNm(lat1, lon1, lat2, lon2) {
//   const toRad = deg => deg * Math.PI / 180
//   const p1 = toRad(lat1)
//   const p2 = toRad(lat2)
//   const dp = toRad(lat2 - lat1)
//   const dl = toRad(lon2 - lon1)
  
//   const a = Math.sin(dp / 2) ** 2 + 
//             Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2
  
//   return 2 * EARTH_RADIUS_NM * Math.asin(Math.sqrt(a))
// }

// /**
//  * Compute complete payload calculation
//  */
// export async function computePayload({
//   aircraft_id,
//   dep_id,
//   dest_id = null,
//   alt_id = null,
//   oat = 15,
//   flap = 'auto',
//   alt_dist_nm = 0,
//   extra_fuel_lb = 0,
//   reserve_min = null,
//   trip_dist_nm = null
// }) {
//   // Get config values
//   const { rows: configRows } = await query('SELECT key, value FROM app_config')
//   const config = Object.fromEntries(configRows.map(r => [r.key, r.value]))
  
//   const paxWeight = parseFloat(config.pax_weight_kg || '77')
//   const contPct = parseFloat(config.contingency_pct || '5') / 100
//   const reserveMin = reserve_min != null ? parseFloat(reserve_min) : parseFloat(config.reserve_minutes || '45')
//   const routeFactor = 1 + (parseFloat(config.route_factor_pct || '5') / 100)

//   // Fetch aircraft
//   const { rows: aircraftRows } = await query('SELECT * FROM aircraft WHERE id = $1', [aircraft_id])
//   if (aircraftRows.length === 0) throw new AppError('Aircraft not found', 404)
//   const aircraft = aircraftRows[0]

//   // Fetch departure airport
//   const { rows: depRows } = await query('SELECT * FROM airports WHERE id = $1', [dep_id])
//   if (depRows.length === 0) throw new AppError('Departure airport not found', 404)
//   const dep = depRows[0]

//   // Fetch destination (optional)
//   let dest = null
//   if (dest_id) {
//     const { rows: destRows } = await query('SELECT * FROM airports WHERE id = $1', [dest_id])
//     if (destRows.length > 0) dest = destRows[0]
//   }

//   // Fetch alternate (optional)
//   let alt = null
//   if (alt_id) {
//     const { rows: altRows } = await query('SELECT * FROM airports WHERE id = $1', [alt_id])
//     if (altRows.length > 0) alt = altRows[0]
//   }

//   const speed = parseFloat(aircraft.cruise_tas_kt) || 1
//   const burnKgHr = parseFloat(aircraft.fuel_burn_kg_hr) || 0
//   const burnLbHr = burnKgHr / LB_TO_KG

//   // Calculate trip distance
//   let tripNm = trip_dist_nm != null ? parseFloat(trip_dist_nm) : 0
//   if (trip_dist_nm == null && dep.lat != null && dep.lon != null && dest?.lat != null && dest?.lon != null) {
//     tripNm = greatCircleNm(
//       parseFloat(dep.lat), parseFloat(dep.lon),
//       parseFloat(dest.lat), parseFloat(dest.lon)
//     ) * routeFactor
//   }

//   // Calculate alternate distance (use alternate coordinates if available)
//   let altNm = parseFloat(alt_dist_nm) || 0
//   if (alt && dest && alt.lat != null && alt.lon != null && dest.lat != null && dest.lon != null) {
//     altNm = greatCircleNm(
//       parseFloat(dest.lat), parseFloat(dest.lon),
//       parseFloat(alt.lat), parseFloat(alt.lon)
//     ) * routeFactor
//   }

//   // Fuel breakdown
//   const tripH = tripNm / speed
//   const tripF = Math.round(tripH * burnLbHr)
  
//   const altH = altNm / speed
//   const altF = Math.round(altH * burnLbHr)
  
//   const contF = Math.round(tripF * contPct)
//   const resF = Math.round((reserveMin / 60) * burnLbHr)
//   const extraF = Math.round(parseFloat(extra_fuel_lb) || 0)
  
//   const totalFLb = tripF + altF + contF + resF + extraF
//   const totalFKg = Math.round(totalFLb * LB_TO_KG)

//   // RTOW at departure
//   const rtow = await computeRTOW(aircraft, dep, parseFloat(oat), flap)
//   const rtowKg = rtow.rtow_kg

//   // Weight limits
//   const oewKg = Math.round(parseFloat(aircraft.bew_kg || aircraft.oew_kg || 0))
//   const mzfwKg = Math.round(parseFloat(aircraft.mzfw_kg || 0))
//   const mlwKg = Math.round(parseFloat(aircraft.mlw_kg || 0))

//   // Payload constraints
//   const tripFKg = Math.round(tripF * LB_TO_KG)
  
//   const plFromTow = rtowKg - totalFKg - oewKg
//   const plFromZfw = mzfwKg - oewKg
  
//   // Landing weight = TOW - trip fuel, must be <= MLW
//   const towFromMlw = mlwKg + tripFKg
//   const plFromMlw = Math.min(rtowKg, towFromMlw) - totalFKg - oewKg

//   let plKg = Math.max(0, Math.min(plFromTow, plFromZfw, plFromMlw))

//   // Determine governing limit
//   let gov = 'RTOW/TOW'
//   if (plKg === plFromZfw && plFromZfw <= plFromTow && plFromZfw <= plFromMlw) {
//     gov = 'MZFW'
//   } else if (plKg === plFromMlw && plFromMlw <= plFromTow && plFromMlw <= plFromZfw) {
//     gov = 'MLW'
//   }

//   const pax = paxWeight > 0 ? Math.floor(plKg / paxWeight) : 0
//   const zfwKg = oewKg + Math.round(plKg)
//   const towKg = zfwKg + totalFKg
//   const lwKg = towKg - tripFKg

//   // Check max fuel capacity
//   const maxFuelLb = parseFloat(aircraft.max_fuel_lb || 0)
//   const fuelExceeded = maxFuelLb > 0 && totalFLb > maxFuelLb

//   return {
//     rtow_kg: rtowKg,
//     rtow_lb: Math.round(rtowKg / LB_TO_KG),
//     limiting_factor: rtow.factor,
//     wat_flap: rtow.wat_flap,
    
//     fuel: {
//       trip: tripF,
//       alt: altF,
//       cont: contF,
//       reserve: resF,
//       extra: extraF,
//       total_lb: totalFLb,
//       total_kg: totalFKg
//     },
    
//     trip_nm: Math.round(tripNm),
//     alt_nm: Math.round(altNm),
    
//     max_fuel_lb: maxFuelLb,
//     fuel_exceeded: fuelExceeded,
//     fuel_over_by_lb: fuelExceeded ? (totalFLb - maxFuelLb) : 0,
    
//     payload_kg: Math.round(plKg),
//     pax,
//     pax_weight_kg: paxWeight,
//     payload_governing: gov,
    
//     oew_kg: oewKg,
//     zfw_kg: zfwKg,
//     mzfw_kg: mzfwKg,
//     tow_kg: towKg,
//     lw_kg: lwKg,
//     mlw_kg: mlwKg,
    
//     field_limit_note: rtow.field_limit_note,
//     field_tables_ready: rtow.field_tables_ready
//   }
// }
