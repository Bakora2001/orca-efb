import { Router } from 'express'
import * as controller from './performance.controller.js'
import { authenticate, authorize } from '../../middleware/auth.js'

const router = Router()

router.use(authenticate)

// GET /api/performance/:aircraft_id
// Returns all cells grouped by table_type → flap_setting
router.get('/:aircraft_id', controller.getCells)

// GET /api/performance/:aircraft_id/summary
// Returns cell counts per table_type/flap (for aircraft card in fleet page)
router.get('/:aircraft_id/summary', controller.getSummary)

// POST /api/performance/save/:aircraft_id    — admin grid entry (batch upsert)
router.post('/save/:aircraft_id', authorize('admin'), controller.saveCells)

// POST /api/performance/import-json/:aircraft_id  — import JSON calibration file
// Accepts the raw calibration JSON (Shape A, B, or C — auto-detected)
// This is the Node.js equivalent of import_reviewed_field_performance.py
router.post('/import-json/:aircraft_id', authorize('admin'), controller.importJson)

// DELETE /api/performance/:aircraft_id/flap  — clear one table/flap combination
router.delete('/:aircraft_id/flap', authorize('admin'), controller.deleteFlap)

// DELETE /api/performance/:aircraft_id/all   — clear all cells for aircraft
router.delete('/:aircraft_id/all', authorize('admin'), controller.deleteAll)

export default router