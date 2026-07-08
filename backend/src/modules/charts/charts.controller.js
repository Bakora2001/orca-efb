/**
 * Charts Controller - HTTP handlers for chart management
 * 
 * Handles CRUD operations for performance charts
 * Returns snake_case field names to match Python Flask API format
 */

import * as chartsService from './charts.service.js'
import asyncHandler from '../../utils/asyncHandler.js'
import AppError from '../../utils/AppError.js'

/**
 * GET /api/charts
 * List all charts with aircraft information
 */
export const listCharts = asyncHandler(async (req, res) => {
  const charts = await chartsService.getAllCharts()
  res.json({ success: true, data: charts })
})

/**
 * GET /api/charts/:id
 * Get a single chart by ID
 */
export const getChart = asyncHandler(async (req, res) => {
  const chart = await chartsService.getChartById(req.params.id)
  res.json({ success: true, data: chart })
})

/**
 * GET /api/charts/aircraft/:aircraftId
 * Get all charts for a specific aircraft
 */
export const getAircraftCharts = asyncHandler(async (req, res) => {
  const charts = await chartsService.getChartsForAircraft(req.params.aircraftId)
  res.json({ success: true, data: charts })
})

/**
 * POST /api/charts/upload
 * Upload a new chart with multipart/form-data
 * 
 * Expected form fields:
 * - file: the uploaded file (required)
 * - aircraft_id: aircraft ID (required)
 * - title: chart title (required)
 * - chart_type: type of chart (required)
 * - notes: optional notes
 */
export const uploadChart = asyncHandler(async (req, res) => {
  // Check if file was uploaded
  if (!req.file) {
    throw new AppError('No file uploaded', 400)
  }

  // Extract form fields
  const {
    aircraft_id,
    title,
    chart_type,
    notes
  } = req.body

  // Validate required fields
  if (!aircraft_id || !title || !chart_type) {
    throw new AppError('Missing required fields: aircraft_id, title, chart_type', 400)
  }

  // Prepare chart data for service
  const chartData = {
    aircraft_id: parseInt(aircraft_id),
    title,
    chart_type,
    file_path: `/uploads/${req.file.filename}`,
    file_type: req.file.mimetype,
    file_size_bytes: req.file.size,
    uploaded_by: req.user?.id || null, // Get user from auth middleware if available
    notes: notes || null
  }

  const chart = await chartsService.uploadChart(chartData)
  res.status(201).json({ success: true, data: chart })
})

/**
 * DELETE /api/charts/:id
 * Delete a chart and its associated file
 */
export const deleteChart = asyncHandler(async (req, res) => {
  const result = await chartsService.deleteChart(req.params.id)
  res.json({ success: true, message: result.message })
})

/**
 * GET /api/charts/:id/image
 * Serve chart image file
 */
export const serveChartImage = asyncHandler(async (req, res) => {
  const chart = await chartsService.getChartById(req.params.id)
  
  // Get the absolute path to the image file
  const imagePath = await chartsService.getChartImagePath(chart.file_path)
  
  // Serve the file
  res.sendFile(imagePath)
})

/**
 * POST /api/charts/interpret
 * Interpret a chart value using calibration data
 * 
 * Request body:
 * - model: aircraft model (e.g., "Q400")
 * - metric: performance metric (e.g., "TODA", "ASDA")
 * - flap: flap setting (e.g., "5", "10", "15")
 * - panel: panel name from calibration
 * - value: the value to interpret
 * - axis: "x" or "y" (default: "x")
 */
export const interpretChart = asyncHandler(async (req, res) => {
  const { model, metric, flap, panel, value, axis = 'x' } = req.body

  // Validate required fields
  if (!model || !metric || !flap || !panel || value === undefined) {
    throw new AppError('Missing required fields: model, metric, flap, panel, value', 400)
  }

  // Get calibration data
  const calibration = await chartsService.getChartCalibration(model, metric, flap)

  // Interpret the value
  const result = chartsService.interpretChartValue(calibration, panel, parseFloat(value), axis)

  if (result === null) {
    throw new AppError('Could not interpret value', 400)
  }

  res.json({
    success: true,
    data: {
      model,
      metric,
      flap,
      panel,
      input_value: parseFloat(value),
      axis,
      result
    }
  })
})
