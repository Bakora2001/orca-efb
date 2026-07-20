import * as aircraftService from './aircraft.service.js'
import asyncHandler from '../../utils/asyncHandler.js'

export const getAll = asyncHandler(async (req, res) => {
  const includeInactive = req.query.includeInactive === 'true'
  const aircraft = await aircraftService.getAllAircraft({ includeInactive })
  res.json({ success: true, data: aircraft })
})

export const getOne = asyncHandler(async (req, res) => {
  const aircraft = await aircraftService.getAircraftById(req.params.id)
  res.json({ success: true, data: aircraft })
})

export const create = asyncHandler(async (req, res) => {
  const aircraft = await aircraftService.createAircraft(req.body)
  res.status(201).json({ success: true, data: aircraft })
})

export const bulkCreate = asyncHandler(async (req, res) => {
  const result = await aircraftService.bulkCreateAircraft(req.body.aircrafts)
  res.status(201).json({ success: true, data: result })
})

export const update = asyncHandler(async (req, res) => {
  const aircraft = await aircraftService.updateAircraft(req.params.id, req.body)
  res.json({ success: true, data: aircraft })
})

export const deactivate = asyncHandler(async (req, res) => {
  const aircraft = await aircraftService.deactivateAircraft(req.params.id)
  res.json({ success: true, data: aircraft })
})

export const remove = asyncHandler(async (req, res) => {
  const result = await aircraftService.deleteAircraft(req.params.id)
  res.json({ success: true, data: result })
})

export const performanceSummary = asyncHandler(async (req, res) => {
  const summary = await aircraftService.getAircraftPerformanceSummary(req.params.id)
  res.json({ success: true, data: summary })
})