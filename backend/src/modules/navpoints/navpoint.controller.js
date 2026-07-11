import * as navpointService from './navpoint.service.js'
import asyncHandler from '../../utils/asyncHandler.js'
import AppError from '../../utils/AppError.js'

export const getAll = asyncHandler(async (req, res) => {
  const navpoints = await navpointService.getAllNavpoints()
  // Plain array — matches mockup JS fetch() usage for map layer
  res.json(navpoints)
})

export const search = asyncHandler(async (req, res) => {
  const results = await navpointService.searchNavpoints(req.query.q, 30)
  // Plain array — matches mockup typeahead usage
  res.json(results)
})

export const getOne = asyncHandler(async (req, res) => {
  const navpoint = await navpointService.getNavpointById(req.params.id)
  res.json({ success: true, data: navpoint })
})

export const create = asyncHandler(async (req, res) => {
  const navpoint = await navpointService.createNavpoint({
    ...req.body,
    userId: req.user.id,
  })
  res.status(201).json({ success: true, data: navpoint })
})

export const update = asyncHandler(async (req, res) => {
  const navpoint = await navpointService.updateNavpoint(req.params.id, req.body)
  res.json({ success: true, data: navpoint })
})

export const remove = asyncHandler(async (req, res) => {
  const result = await navpointService.deleteNavpoint(req.params.id)
  res.json({ success: true, data: result })
})

export const legSuggestions = asyncHandler(async (req, res) => {
  const { dep_id, dest_id, limit } = req.query
  if (!dep_id || !dest_id) {
    return res.status(400).json({ success: false, message: 'dep_id and dest_id are required' })
  }
  const fixes = await navpointService.getLegSuggestions(
    dep_id,
    dest_id,
    limit ? parseInt(limit) : 14
  )
  // Plain array — mockup maps directly over this
  res.json(fixes)
})

export const bulkImport = asyncHandler(async (req, res) => {
  const { points, overwrite } = req.body
  if (!Array.isArray(points) || points.length === 0) {
    return res.status(400).json({ success: false, message: 'points must be a non-empty array' })
  }
  const result = await navpointService.bulkImportNavpoints(points, { overwrite: overwrite === true })
  res.json({ success: true, data: result })
})

export const importEnrCsv = asyncHandler(async (req, res) => {
  if (!req.file) throw new AppError('CSV file is required', 400)
  const csvText = req.file.buffer.toString('utf-8')
  const result = await navpointService.importEnrCsv(csvText)
  res.json({ success: true, data: result })
})