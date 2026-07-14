// payload.controller.js
import { calculatePayload } from './payload.service.js'
import asyncHandler from '../../utils/asyncHandler.js'

export const payload = asyncHandler(async (req, res) => {
  const {
    aircraft_id, dep_id, dest_id, alt_id,
    oat, flap, alt_dist_nm, extra_fuel_lb, reserve_min,
    pax, cargo_kg, fuel_kg,
  } = req.body

  if (!aircraft_id || !dep_id || !dest_id || oat == null) {
    return res.status(400).json({
      success: false,
      message: 'aircraft_id, dep_id, dest_id and oat are required',
    })
  }

  const result = await calculatePayload({
    aircraft_id, dep_id, dest_id, alt_id,
    oat: parseFloat(oat),
    flap: flap ?? 'auto',
    alt_dist_nm:   parseFloat(alt_dist_nm  ?? 0),
    extra_fuel_lb: parseFloat(extra_fuel_lb ?? 0),
    reserve_min:   reserve_min != null ? parseFloat(reserve_min) : null,
    pax:      pax      != null ? parseInt(pax,      10) : null,
    cargo_kg: cargo_kg != null ? parseFloat(cargo_kg) : null,
    fuel_kg:  fuel_kg  != null ? parseFloat(fuel_kg)  : null,
  })

  res.json({ success: true, data: result })
})