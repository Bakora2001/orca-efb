import { Router } from 'express'
import multer from 'multer'
import * as controller from './performance.controller.js'
import * as reportController from './report.controller.js'
import { authenticate, authorize } from '../../middleware/auth.js'

const router = Router()
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
})

router.use(authenticate)

// ═══════════════════════════════════════════════════════════════════════════
// READ
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/performance/:aircraft_id
// Returns all cells grouped by table_type → flap_setting
router.get('/:aircraft_id', controller.getCells)

// GET /api/performance/:aircraft_id/summary
// Returns cell counts per table_type/flap (for aircraft card in fleet page)
router.get('/:aircraft_id/summary', controller.getSummary)

// ═══════════════════════════════════════════════════════════════════════════
// REPORT GENERATION
// ═══════════════════════════════════════════════════════════════════════════

router.post('/report', reportController.generateReport)
router.post('/report/pdf', reportController.generatePdfReport)

// ═══════════════════════════════════════════════════════════════════════════
// WRITE
// ═══════════════════════════════════════════════════════════════════════════

// POST /api/performance/save/:aircraft_id — admin grid entry (batch upsert)
router.post('/save/:aircraft_id', authorize('admin'), controller.saveCells)

// ═══════════════════════════════════════════════════════════════════════════
// IMPORT
// ═══════════════════════════════════════════════════════════════════════════

// POST /api/performance/import-json/:aircraft_id — import JSON calibration file
// Accepts the raw calibration JSON (Shape A, B, or C — auto-detected)
router.post('/import-json/:aircraft_id', authorize('admin'), controller.importJson)

// POST /api/performance/import-reviewed-csv
// Upload human-reviewed Dash 8 field-performance CSV
// Body (multipart/form-data): file (CSV), modelAircraftMap (JSON string)
router.post(
  '/import-reviewed-csv',
  authorize('admin'),
  upload.single('file'),
  controller.importReviewedCsv
)

// ═══════════════════════════════════════════════════════════════════════════
// DELETE
// ═══════════════════════════════════════════════════════════════════════════

// DELETE /api/performance/:aircraft_id/flap — clear one table/flap combination
router.delete('/:aircraft_id/flap', authorize('admin'), controller.deleteFlap)

// DELETE /api/performance/:aircraft_id/all — clear all cells for aircraft
router.delete('/:aircraft_id/all', authorize('admin'), controller.deleteAll)

export default router