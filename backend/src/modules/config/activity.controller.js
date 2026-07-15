// activity.controller.js
import { getRecentActivity } from './activity.service.js'
import asyncHandler from '../../utils/asyncHandler.js'

export const getActivity = asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 50)
  const rows = await getRecentActivity(limit)
  res.json({ success: true, data: rows })
})
