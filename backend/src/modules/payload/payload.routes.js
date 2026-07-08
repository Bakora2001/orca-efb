import { Router } from 'express'
import * as controller from './payload.controller.js'
import { authenticate } from '../../middleware/auth.js'

const router = Router()

router.use(authenticate)

// POST /api/payload
// Body: { aircraft_id, dep_id, dest_id?, alt_id?, oat, flap?, alt_dist_nm?, extra_fuel_lb?, reserve_min? }
router.post('/', controller.compute)

export default router
