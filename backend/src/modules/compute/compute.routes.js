import { Router } from 'express'
import * as controller from './compute.controller.js'
import { authenticate } from '../../middleware/auth.js'

const router = Router()

// All compute routes require authentication
router.use(authenticate)

// POST /api/compute
// Body: { aircraft_id, airport_id, oat, flap? }
router.post('/', controller.compute)

export default router