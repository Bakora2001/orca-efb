import * as payloadService from './payload.service.js'
import asyncHandler from '../../utils/asyncHandler.js'

export const compute = asyncHandler(async (req, res) => {
  const result = await payloadService.computePayload(req.body)
  res.json(result)
})
