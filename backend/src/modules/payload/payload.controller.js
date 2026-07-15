// payload.controller.js
import { calculatePayload } from './payload.service.js'
import asyncHandler from '../../utils/asyncHandler.js'
import { logActivity } from '../config/activity.service.js'

export const payload = asyncHandler(async (req, res) => {
  const {
    aircraft_id, dep_id, dest_id, alt_id,
    oat, flap, alt_dist_nm, extra_fuel_lb, extra_fuel_kg, reserve_min,
    pax, cargo_kg, fuel_kg,
  } = req.body

  if (!aircraft_id || !dep_id || !dest_id || oat == null) {
    return res.status(400).json({
      success: false,
      message: 'aircraft_id, dep_id, dest_id and oat are required',
    })
  }

  // Accept extra fuel in either lb or kg (frontend may send either)
  const KG_TO_LB = 2.20462
  const resolvedExtraFuelLb = extra_fuel_lb != null
    ? parseFloat(extra_fuel_lb)
    : extra_fuel_kg != null
      ? parseFloat(extra_fuel_kg) * KG_TO_LB
      : 0

  const result = await calculatePayload({
    aircraft_id, dep_id, dest_id, alt_id,
    oat: parseFloat(oat),
    flap: flap ?? 'auto',
    alt_dist_nm:   parseFloat(alt_dist_nm  ?? 0),
    extra_fuel_lb: resolvedExtraFuelLb,
    reserve_min:   reserve_min != null ? parseFloat(reserve_min) : null,
    pax:      pax      != null ? parseInt(pax,      10) : null,
    cargo_kg: cargo_kg != null ? parseFloat(cargo_kg) : null,
    fuel_kg:  fuel_kg  != null ? parseFloat(fuel_kg)  : null,
  })


  // Fire-and-forget audit log
  logActivity({
    userId: req.user?.id,
    action: 'PAYLOAD_CALCULATED',
    tableName: 'payload',
    newData: { aircraft_id, dep_id, dest_id, oat, rtow_kg: result.rtow_kg, tow_kg: result.tow_kg },
    ipAddress: req.ip,
  }).catch(() => {})

  res.json({ success: true, data: result })
})