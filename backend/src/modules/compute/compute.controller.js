/**
 * compute.controller.js
 * ─────────────────────
 * Thin controller — validates input, coerces types, delegates to service.
 */

import { computeRTOW } from '../../services/rtow.service.js'
import asyncHandler from '../../utils/asyncHandler.js'

/**
 * POST /api/compute
 * Body: { aircraft_id, airport_id, oat, flap? }
 */
export const compute = asyncHandler(async (req, res) => {
  const { aircraft_id, airport_id, oat, flap } = req.body

  // ── Validation ──────────────────────────────────────────────────
  if (!aircraft_id || !airport_id || oat == null) {
    return res.status(400).json({
      success: false,
      message: 'aircraft_id, airport_id, and oat are required',
    })
  }

  // ── Delegate to service ─────────────────────────────────────────
  const result = await computeRTOW(
    aircraft_id,
    airport_id,
    parseFloat(oat),
    flap ?? 'auto'
  )

  res.json({ success: true, data: result })
})