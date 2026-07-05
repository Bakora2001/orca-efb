import * as perfService from './performance.service.js'
import asyncHandler from '../../utils/asyncHandler.js'

// GET /api/performance/:aircraft_id
export const getCells = asyncHandler(async (req, res) => {
  const data = await perfService.getCellsForAircraft(req.params.aircraft_id)
  res.json({ success: true, data })
})

// GET /api/performance/:aircraft_id/summary
export const getSummary = asyncHandler(async (req, res) => {
  const data = await perfService.getPerformanceSummary(req.params.aircraft_id)
  res.json({ success: true, data })
})

// POST /api/performance/save/:aircraft_id
// Body: { table_type, flap_setting, weight_kg?, cells[], source_note? }
export const saveCells = asyncHandler(async (req, res) => {
  const result = await perfService.batchUpsertCells(
    req.params.aircraft_id,
    req.body
  )
  res.json({ success: true, data: result })
})

// POST /api/performance/import-json/:aircraft_id
// Body: { table_type?, flap_setting?, weight_kg?, source_note?, data: <json> }
// or upload the raw JSON calibration file directly as req.body (with Content-Type: application/json)
export const importJson = asyncHandler(async (req, res) => {
  const { table_type, flap_setting, weight_kg, source_note, data } = req.body

  // Accept either { data: <calibration json> } or the raw calibration json itself
  const jsonPayload = data ?? req.body

  const result = await perfService.importFromCalibrationJson(
    req.params.aircraft_id,
    jsonPayload,
    { table_type, flap_setting, weight_kg, source_note }
  )
  res.json({ success: true, data: result })
})

// DELETE /api/performance/:aircraft_id/flap
// Body: { table_type, flap_setting, weight_kg? }
export const deleteFlap = asyncHandler(async (req, res) => {
  const { table_type, flap_setting, weight_kg } = req.body
  const result = await perfService.deleteCellsForFlap(
    req.params.aircraft_id,
    table_type,
    flap_setting,
    weight_kg ?? null
  )
  res.json({ success: true, data: result })
})

// DELETE /api/performance/:aircraft_id/all
export const deleteAll = asyncHandler(async (req, res) => {
  const { confirm } = req.body
  if (confirm !== 'DELETE ALL') {
    return res.status(400).json({ success: false, message: 'Send { confirm: "DELETE ALL" } to proceed' })
  }
  const result = await perfService.deleteAllCellsForAircraft(req.params.aircraft_id)
  res.json({ success: true, data: result })
})