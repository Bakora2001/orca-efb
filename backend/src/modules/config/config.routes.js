import { Router } from 'express'
import { getConfig, updateConfig } from './config.controller.js'
import { authenticate, authorize } from '../../middleware/auth.js'

const router = Router()
router.use(authenticate)

router.get('/',  getConfig)
router.post('/', authorize('admin'), updateConfig)

export default router