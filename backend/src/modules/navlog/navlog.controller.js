// navlog.controller.js
import { buildNavlog } from './navlog.service.js'
import asyncHandler from '../../utils/asyncHandler.js'
import { logActivity } from '../config/activity.service.js'

export const navlog = asyncHandler(async (req, res) => {
  const { aircraft_id, waypoints } = req.body
  if (!aircraft_id || !Array.isArray(waypoints)) {
    return res.status(400).json({
      success: false,
      message: 'aircraft_id and waypoints[] are required',
    })
  }
  const result = await buildNavlog(aircraft_id, waypoints)
  // Fire-and-forget audit log
  const dep = waypoints.find(w => w.kind === 'airport')?.id || null
  logActivity({
    userId: req.user?.id,
    action: 'NAVLOG_GENERATED',
    tableName: 'navlog',
    newData: { aircraft_id, waypoint_count: waypoints.length, dep_id: dep },
    ipAddress: req.ip,
  }).catch(() => {})
  res.json({ success: true, data: result })
})