import { Router } from 'express'
import * as controller from './navpoint.controller.js'
import { validate } from '../../middleware/validate.js'
import { authenticate, authorize } from '../../middleware/auth.js'
import { createNavpointSchema, updateNavpointSchema, bulkImportSchema } from './navpoint.validation.js'

const router = Router()

router.use(authenticate)

// ── Public (any authenticated user) ──────────────────────────────

// GET /api/navpoints/all
// Returns every non-deprecated fix for the map layer.
// NOTE: /all, /search, /leg-suggestions MUST be registered before /:id
// otherwise Express matches those literal strings as UUID params.
router.get('/all', controller.getAll)

// GET /api/navpoints/search?q=
router.get('/search', controller.search)

// GET /api/navpoints/leg-suggestions?dep_id=&dest_id=&limit=
router.get('/leg-suggestions', controller.legSuggestions)

// GET /api/navpoints/:id
router.get('/:id', controller.getOne)

// POST /api/navpoints  — dispatchers can create user waypoints
router.post(
  '/',
  validate(createNavpointSchema),
  controller.create
)

// ── Admin only ────────────────────────────────────────────────────

// PATCH /api/navpoints/:id
router.patch(
  '/:id',
  authorize('admin'),
  validate(updateNavpointSchema),
  controller.update
)

// DELETE /api/navpoints/:id  — user waypoints only (service enforces this)
router.delete('/:id', controller.remove)

// POST /api/navpoints/bulk-import  — import VOR/NDB/waypoint JSON array
router.post(
  '/bulk-import',
  authorize('admin'),
  validate(bulkImportSchema),
  controller.bulkImport
)

export default router