import { Router } from 'express'
import * as controller from './weather.controller.js'
import { authenticate, authorize } from '../../middleware/auth.js'

const router = Router()

// All weather routes require authentication
router.use(authenticate)

// GET /api/weather?icao=HKJK
router.get('/', controller.weather)

// DELETE /api/weather/cache?icao=HKJK  (omit icao to clear all)
router.delete('/cache', authorize('admin'), controller.clearCache)

export default router