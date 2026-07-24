import { Router } from 'express'
import * as controller from './aircraft.controller.js'
import { validate } from '../../middleware/validate.js'
import { authenticate, authorize } from '../../middleware/auth.js'
import { createAircraftSchema, updateAircraftSchema, bulkCreateAircraftSchema } from './aircraft.validation.js'

const router = Router()

// All aircraft routes require authentication
router.use(authenticate)

// GET /api/aircraft              — all active aircraft (dispatchers + admins)
// GET /api/aircraft?includeInactive=true — all including inactive (admins only)
router.get('/', controller.getAll)

// GET /api/aircraft/:id          — single aircraft
router.get('/:id', controller.getOne)

// GET /api/aircraft/:id/performance — WAT/TODA/ASDA summary for this aircraft
router.get('/:id/performance', controller.performanceSummary)

// POST /api/aircraft/bulk        — bulk create (admin only)
router.post('/bulk', authorize('admin'), validate(bulkCreateAircraftSchema), controller.bulkCreate)

// POST /api/aircraft             — create (admin only)
router.post('/', authorize('admin'), validate(createAircraftSchema), controller.create)

// PATCH /api/aircraft/:id        — partial update (admin only)
router.patch('/:id', authorize('admin'), validate(updateAircraftSchema), controller.update)

// PATCH /api/aircraft/:id/deactivate — soft delete (admin only)
router.patch('/:id/deactivate', authorize('admin'), controller.deactivate)

// DELETE /api/aircraft/:id       — hard delete (admin only, cascades performance_cells)
router.delete('/:id', authorize('admin'), controller.remove)

export default router