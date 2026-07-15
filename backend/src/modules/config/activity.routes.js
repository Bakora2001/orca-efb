// activity.routes.js
import { Router } from 'express'
import { getActivity } from './activity.controller.js'
import { authenticate } from '../../middleware/auth.js'

const router = Router()
router.use(authenticate)
router.get('/', getActivity)

export default router
