import { query } from '../config/database.js'
import AppError from '../utils/AppError.js'

const R_NM = 3440.065

function toRad(d) { return d * Math.PI / 180 }

function gcNm(lat1, lon1, lat2, lon2) {
  const p1 = toRad(lat1), p2 = toRad(lat2)
  const dp = toRad(lat2 - lat1), dl = toRad(lon2 - lon1)
  const h = Math.sin(dp/2)**2 + Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2
  return 2 * R_NM * Math.asin(Math.sqrt(h))
}

function gcBearing(lat1, lon1, lat2, lon2) {
  const p1 = toRad(lat1), p2 = toRad(lat2), dl = toRad(lon2 - lon1)
  const y = Math.sin(dl) * Math.cos(p2)
  const x = Math.cos(p1)*Math.sin(p2) - Math.sin(p1)*Math.cos(p2)*Math.cos(dl)
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
}

export async function buildNavlog(aircraftId, waypoints) {
  if (!Array.isArray(waypoints) || waypoints.length < 2) {
    throw new AppError('At least 2 waypoints are required', 400)
  }

  const acRes = await query(
    'SELECT id, registration, cruise_tas_kt, fuel_burn_kg_hr FROM aircraft WHERE id = $1',
    [aircraftId]
  )
  if (acRes.rows.length === 0) throw new AppError('Aircraft not found', 404)
  const ac = acRes.rows[0]

  const cruiseTasKt  = parseFloat(ac.cruise_tas_kt)
  const burnRateKgHr = parseFloat(ac.fuel_burn_kg_hr)
  const KG_TO_LB     = 2.20462

  const resolved = []
  for (const wp of waypoints) {
    if (!wp.kind || !wp.id) {
      throw new AppError('Each waypoint must have { kind: "airport"|"fix", id: "<uuid>" }', 400)
    }
    if (wp.kind === 'airport') {
      const r = await query(
        'SELECT icao_code AS ident, lat, lon FROM airports WHERE id = $1',
        [wp.id]
      )
      if (r.rows.length === 0) throw new AppError(`Airport ${wp.id} not found`, 404)
      resolved.push({ ...r.rows[0], kind: 'airport', id: wp.id })
    } else if (wp.kind === 'fix') {
      const r = await query(
        'SELECT ident, lat, lon FROM navpoints WHERE id = $1',
        [wp.id]
      )
      if (r.rows.length === 0) throw new AppError(`Fix ${wp.id} not found`, 404)
      resolved.push({ ...r.rows[0], kind: 'fix', id: wp.id })
    } else {
      throw new AppError(`Unknown waypoint kind: ${wp.kind}. Use "airport" or "fix"`, 400)
    }
  }

  const legs = []
  let totalDistNm = 0
  let totalEteMin = 0
  let totalFuelLb = 0

  for (let i = 0; i < resolved.length - 1; i++) {
    const from = resolved[i]
    const to   = resolved[i + 1]

    const lat1 = parseFloat(from.lat), lon1 = parseFloat(from.lon)
    const lat2 = parseFloat(to.lat),   lon2 = parseFloat(to.lon)

    const distNm    = gcNm(lat1, lon1, lat2, lon2)
    const trackDeg  = gcBearing(lat1, lon1, lat2, lon2)
    const eteHr     = distNm / cruiseTasKt
    const eteMin    = eteHr * 60
    const fuelKgLeg = eteHr * burnRateKgHr
    const fuelLbLeg = fuelKgLeg * KG_TO_LB

    legs.push({
      from_ident: from.ident,
      to_ident:   to.ident,
      from_kind:  from.kind,
      to_kind:    to.kind,
      track_deg:  Math.round(trackDeg),
      dist_nm:    Math.round(distNm * 10) / 10,
      ete_min:    Math.round(eteMin),
      ete_hhmm:   minsToHHMM(eteMin),
      fuel_kg:    Math.round(fuelKgLeg),
      fuel_lb:    Math.round(fuelLbLeg),
    })

    totalDistNm += distNm
    totalEteMin += eteMin
    totalFuelLb += fuelLbLeg
  }

  return {
    aircraft: { id: ac.id, registration: ac.registration },
    legs,
    totals: {
      dist_nm:  Math.round(totalDistNm * 10) / 10,
      ete_min:  Math.round(totalEteMin),
      ete_hhmm: minsToHHMM(totalEteMin),
      fuel_lb:  Math.round(totalFuelLb),
      fuel_kg:  Math.round(totalFuelLb / KG_TO_LB),
    },
    note: `${legs.length} leg${legs.length > 1 ? 's' : ''} — ${Math.round(totalDistNm)} NM — ${minsToHHMM(totalEteMin)} ETE`,
  }
}

function minsToHHMM(mins) {
  const h = Math.floor(mins / 60)
  const m = Math.round(mins % 60)
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`
}