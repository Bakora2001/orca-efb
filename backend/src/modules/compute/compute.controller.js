import * as computeService from './compute.service.js'
import asyncHandler from '../../utils/asyncHandler.js'

export const compute = asyncHandler(async (req, res) => {
  const result = await computeService.compute(req.body)
  res.json(result)
})
