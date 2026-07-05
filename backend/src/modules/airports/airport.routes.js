import { Router } from 'express'
import multer from 'multer'
import * as controller from './airport.controller.js'
import { validate } from '../../middleware/validate.js'
import { authenticate, authorize } from '../../middleware/auth.js'
import { createAirportSchema, updateAirportSchema } from './airport.validation.js'

const router = Router()

// CSV import uses memory storage (buffers passed directly to the service)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max for large CSV files
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true)
    } else {
      cb(new Error('Only CSV files are accepted'))
    }
  },
})

router.use(authenticate)

// Public (auth only) — dispatchers need these for the map and pickers
// GET /api/airports                  — all active airports
router.get('/', controller.getAll)

// GET /api/airports/search?q=        — typeahead search (used by mockup JS)
// NOTE: /search must come before /:id or Express matches "search" as an id
router.get('/search', controller.search)

// GET /api/airports/:id              — single airport
router.get('/:id', controller.getOne)

// Admin only below this line
router.post(
  '/',
  authorize('admin'),
  validate(createAirportSchema),
  controller.create
)

router.patch(
  '/:id',
  authorize('admin'),
  validate(updateAirportSchema),
  controller.update
)

router.patch('/:id/deactivate', authorize('admin'), controller.deactivate)

// POST /api/airports/clear           — bulk delete by scope (aip or all)
router.post('/clear', authorize('admin'), controller.clearBySource)

// POST /api/airports/import          — OurAirports CSV import
router.post(
  '/import',
  authorize('admin'),
  upload.fields([
    { name: 'airports_csv', maxCount: 1 },
    { name: 'runways_csv', maxCount: 1 },
  ]),
  controller.importOurAirports
)

export default router