/**
 * Charts Service - Performance Chart Management
 * 
 * Handles chart upload, storage, and serving
 * Integrates with calibration JSON for accurate value interpretation
 */

import { query } from '../../config/database.js'
import AppError from '../../utils/AppError.js'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Get all charts
 */
export async function getAllCharts() {
  const { rows } = await query(
    `SELECT c.*, a.registration, a.type as aircraft_type
     FROM charts c
     LEFT JOIN aircraft a ON c.aircraft_id = a.id
     ORDER BY c.created_at DESC`
  )
  return rows
}

/**
 * Get chart by ID
 */
export async function getChartById(id) {
  const { rows } = await query(
    `SELECT c.*, a.registration, a.type as aircraft_type
     FROM charts c
     LEFT JOIN aircraft a ON c.aircraft_id = a.id
     WHERE c.id = $1`,
    [id]
  )
  
  if (rows.length === 0) {
    throw new AppError('Chart not found', 404)
  }
  
  return rows[0]
}

/**
 * Get charts for aircraft
 */
export async function getChartsForAircraft(aircraftId) {
  const { rows } = await query(
    `SELECT * FROM charts
     WHERE aircraft_id = $1
     ORDER BY chart_type, title`,
    [aircraftId]
  )
  return rows
}

/**
 * Upload chart
 */
export async function uploadChart({
  aircraft_id,
  title,
  chart_type,
  file_path,
  file_type,
  file_size_bytes,
  uploaded_by,
  notes
}) {
  const { rows } = await query(
    `INSERT INTO charts (
      aircraft_id, title, chart_type, file_path, file_type,
      file_size_bytes, uploaded_by, notes
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *`,
    [
      aircraft_id,
      title,
      chart_type,
      file_path,
      file_type,
      file_size_bytes,
      uploaded_by,
      notes
    ]
  )
  
  return rows[0]
}

/**
 * Delete chart
 */
export async function deleteChart(id) {
  const chart = await getChartById(id)
  
  // Delete file from filesystem
  const fullPath = path.join(__dirname, '../../../public', chart.file_path)
  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath)
  }
  
  await query('DELETE FROM charts WHERE id = $1', [id])
  
  return { message: 'Chart deleted successfully' }
}

/**
 * Get chart calibration data
 * Reads calibration JSON for performance charts
 */
export async function getChartCalibration(model, metric, flap) {
  const calibrationPath = path.join(
    __dirname,
    '../../../orca-efb-v14-main/orca-efb-v14-main/data/performance_calibrations',
    `${model}_${metric}_flap_${flap}.json`
  )
  
  if (!fs.existsSync(calibrationPath)) {
    throw new AppError(`Calibration file not found for ${model} ${metric} flap ${flap}`, 404)
  }
  
  const calibration = JSON.parse(fs.readFileSync(calibrationPath, 'utf-8'))
  return calibration
}

/**
 * Interpret chart value using calibration
 * Converts physical chart coordinates to performance values
 */
export function interpretChartValue(calibration, panel, value, axis = 'x') {
  const panelData = calibration.panels[panel]
  
  if (!panelData || panelData.kind !== 'linear_grid_axis') {
    throw new AppError(`Invalid panel: ${panel}`, 400)
  }
  
  const controlPoints = panelData.control_points || panelData.kg_control_points
  
  if (!controlPoints || controlPoints.length === 0) {
    throw new AppError(`No control points for panel: ${panel}`, 400)
  }
  
  // Sort control points by value
  const sorted = controlPoints.sort((a, b) => parseFloat(a.value) - parseFloat(b.value))
  
  // Linear interpolation
  const coord = axis === 'x' ? 'x_px' : 'y_px'
  
  // Find bracketing points
  for (let i = 0; i < sorted.length - 1; i++) {
    const p1 = sorted[i]
    const p2 = sorted[i + 1]
    
    const v1 = parseFloat(p1.value)
    const v2 = parseFloat(p2.value)
    const c1 = parseFloat(p1[coord])
    const c2 = parseFloat(p2[coord])
    
    if (value >= v1 && value <= v2) {
      const frac = (value - v1) / (v2 - v1)
      return c1 + frac * (c2 - c1)
    }
  }
  
  // Clamp to bounds
  if (value < parseFloat(sorted[0].value)) {
    return parseFloat(sorted[0][coord])
  }
  if (value > parseFloat(sorted[sorted.length - 1].value)) {
    return parseFloat(sorted[sorted.length - 1][coord])
  }
  
  return null
}

/**
 * Get absolute path to chart image file
 */
export async function getChartImagePath(relativePath) {
  // relativePath is stored in database like "/uploads/filename.jpg" or "/performance_previews/filename.jpg"
  const fullPath = path.join(__dirname, '../../../public', relativePath)
  
  // Check if file exists
  if (!fs.existsSync(fullPath)) {
    throw new AppError('Chart image file not found', 404)
  }
  
  return fullPath
}

/**
 * Copy performance preview images to public folder
 */
export async function copyPerformancePreviewImages() {
  const sourcePath = path.join(
    __dirname,
    '../../../orca-efb-v14-main/orca-efb-v14-main/static/performance_previews'
  )
  
  const destPath = path.join(__dirname, '../../../public/performance_previews')
  
  // Create destination directory
  if (!fs.existsSync(destPath)) {
    fs.mkdirSync(destPath, { recursive: true })
  }
  
  // Copy all images
  const files = fs.readdirSync(sourcePath)
  let copied = 0
  
  for (const file of files) {
    if (file.endsWith('.jpg') || file.endsWith('.png')) {
      const src = path.join(sourcePath, file)
      const dest = path.join(destPath, file)
      fs.copyFileSync(src, dest)
      
      // Register in database
      const match = file.match(/^(Q\d+)_(TODA|ASDA)_flap_(\d+)/)
      if (match) {
        const [, model, metric, flap] = match
        
        // Find matching aircraft
        const { rows } = await query(
          `SELECT id FROM aircraft WHERE type LIKE $1 LIMIT 1`,
          [`%${model}%`]
        )
        
        if (rows.length > 0) {
          await query(
            `INSERT INTO charts (
              aircraft_id, title, chart_type, file_path, file_type
            ) VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT DO NOTHING`,
            [
              rows[0].id,
              `${model} ${metric} Flap ${flap}`,
              `PERFORMANCE_${metric}`,
              `/performance_previews/${file}`,
              'image/jpeg'
            ]
          )
        }
      }
      
      copied++
    }
  }
  
  return { copied, message: `Copied ${copied} performance preview images` }
}
