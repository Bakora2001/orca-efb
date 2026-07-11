// navlog.controller.js
import { buildNavlog } from './navlog.service.js'
import asyncHandler from '../../utils/asyncHandler.js'

export const navlog = asyncHandler(async (req, res) => {
  const { aircraft_id, waypoints } = req.body
  if (!aircraft_id || !Array.isArray(waypoints)) {
    return res.status(400).json({
      success: false,
      message: 'aircraft_id and waypoints[] are required',
    })
  }
  const result = await buildNavlog(aircraft_id, waypoints)
  res.json({ success: true, data: result })
})