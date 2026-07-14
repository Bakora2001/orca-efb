/**
 * payload.service.js
 * ──────────────────
 * Full payload + fuel calculation.
 *
 * Computes:
 *   • RTOW at departure (via rtow.service)
 *   • Trip / alternate / contingency / reserve / extra fuel
 *   • Payload capacity under ZFW, MZFW, and MLW constraints
 *   • Fuel capacity check from TOW constraint
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
  pax = null,         // optional: actual pax count
  cargo_kg = null,    // optional: actual cargo kg
  fuel_kg = null,     // optional: actual fuel on board kg
}) {
  // ── Load aircraft ─────────────────────────────────────────────
  const acRes = await query(
    `SELECT id, registration, type, mtow_kg, mlw_kg, mzfw_kg, bew_kg,
            max_pax, cruise_tas_kt, fuel_burn_kg_hr, flaps, max_fuel_kg
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
  const altFuelKg   = altFuelLb   * LB_TO_KG
  const contFuelKg  = contFuelLb  * LB_TO_KG
  const resvFuelKg  = resvFuelLb  * LB_TO_KG
  const extraFuelKg = extraFuelLb * LB_TO_KG

  // ── RTOW ──────────────────────────────────────────────────────
  const rtowResult = await computeRTOW(aircraft_id, dep_id, parseFloat(oat), flap)
  const rtowKg     = rtowResult.rtow_kg

  // ── Weight limits ─────────────────────────────────────────────
  const mtowKg = parseFloat(ac.mtow_kg)
  const mlwKg  = parseFloat(ac.mlw_kg)
  const mzfwKg = parseFloat(ac.mzfw_kg)
  const bewKg  = parseFloat(ac.bew_kg) || 0

  const towKg = Math.min(rtowKg, mtowKg)
  const lwKg  = towKg - tripFuelKg
  const zfwKg = towKg - totalFuelKg

  // ── Payload constraints ────────────────────────────────────────
  const payloadFromTow  = towKg - totalFuelKg - bewKg
  const payloadFromZfw  = zfwKg - bewKg
  const payloadFromMzfw = mzfwKg - bewKg

  const towFromMlw = mlwKg + tripFuelKg
  const payloadFromMlw = Math.min(rtowKg, towFromMlw) - totalFuelKg - bewKg

  const maxPayloadKg = Math.max(0, Math.min(payloadFromTow, payloadFromZfw, payloadFromMzfw, payloadFromMlw))

  // ── If user provided actual load, compute actual TOW and check vs limits ──
  const paxWeightKgActual = paxWeightKg
  const actualPax     = pax      != null ? pax     : Math.floor(maxPayloadKg / paxWeightKg)
  const actualCargo   = cargo_kg != null ? cargo_kg : 0
  const actualPayload = pax != null || cargo_kg != null
    ? (actualPax * paxWeightKgActual) + actualCargo
    : maxPayloadKg

  // If the user gave us actual fuel on board, use that for actual TOW calc
  const actualFobKg = fuel_kg != null ? fuel_kg : totalFuelKg
  const actualTowKg = bewKg + actualPayload + actualFobKg
  const actualLwKg  = actualTowKg - tripFuelKg
  const actualZfwKg = actualTowKg - actualFobKg

  // payloadKg in the response = actual if user-provided, else max calculated
  let payloadKg = actualPayload

  // ── Governing limit ────────────────────────────────────────────
  const limits = [
    { label: 'ZFW',   value: payloadFromZfw },
    { label: 'MZFW',  value: payloadFromMzfw },
    { label: 'MLW',   value: payloadFromMlw },
    { label: 'RTOW',  value: payloadFromTow },
  ]
  const governing = limits.reduce((min, cur) => cur.value < min.value ? cur : min)
  const payloadGoverning = governing.label

  // ── PAX count for display ────────────────────────────────────────
  const paxDisplay = actualPax

  // ── LW check against MLW ────────────────────────────────────────
  const lwLimitOk = actualLwKg <= mlwKg

  // ── Fuel capacity check (against actual fuel on board) ─────────────────
  const maxFuelKg = Number(ac.max_fuel_kg) || 0
  const fuelExceeded = maxFuelKg > 0 && actualFobKg > maxFuelKg
  const fuelOverByKg = fuelExceeded ? actualFobKg - maxFuelKg : 0

  return {
    payload_kg:     Math.max(0, Math.round(payloadKg)),
    max_payload_kg: Math.max(0, Math.round(maxPayloadKg)),
    pax:            Math.max(0, paxDisplay),
    pax_weight_kg:  paxWeightKg,

    // Use ACTUAL weights (based on user-provided FOB/pax/cargo)
    tow_kg:  Math.round(actualTowKg),
    ldw_kg:  Math.round(actualLwKg),
    zfw_kg:  Math.round(actualZfwKg),
    bew_kg:  Math.round(bewKg),
    rtow_kg: rtowKg,
    mlw_kg:  mlwKg,
    mzfw_kg: mzfwKg,
    mtow_kg: mtowKg,

    fob_kg: Math.round(actualFobKg),  // actual fuel on board used

    trip_nm:    Math.round(tripNm * 10) / 10,
    gc_trip_nm: Math.round(gcTripNm * 10) / 10,
    alt_nm:     Math.round(altNm * 10) / 10,

    fuel: {
      trip_lb:    Math.round(tripFuelLb),
      trip_kg:    Math.round(tripFuelKg),
      alt_lb:     Math.round(altFuelLb),
      alt_kg:     Math.round(altFuelKg),
      cont_lb:    Math.round(contFuelLb),
      cont_kg:    Math.round(contFuelKg),
      reserve_lb: Math.round(resvFuelLb),
      reserve_kg: Math.round(resvFuelKg),
      extra_lb:   Math.round(extraFuelLb),
      extra_kg:   Math.round(extraFuelKg),
      total_lb:   Math.round(totalFuelLb),
      total_kg:   Math.round(totalFuelKg),
    },

    max_fuel_kg:      maxFuelKg,
    fuel_exceeded:    fuelExceeded,
    fuel_over_by_kg:  Math.round(fuelOverByKg),

    payload_governing: payloadGoverning,
    lw_limit_ok:       lwLimitOk,
    field_limit_note:  rtowResult.field_limit_note,
    wat_flap:          rtowResult.wat_flap,
    rtow_factor:       rtowResult.factor,
  }
}