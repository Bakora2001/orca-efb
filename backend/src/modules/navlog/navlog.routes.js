import { Router } from 'express'
import { navlog } from './navlog.controller.js'
import { authenticate } from '../../middleware/auth.js'

const router = Router()
router.use(authenticate)

// POST /api/navlog
router.post('/', navlog)

export default router