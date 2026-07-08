import { Router } from 'express'
import * as controller from './weather.controller.js'
import { authenticate } from '../../middleware/auth.js'

const router = Router()

router.use(authenticate)

// GET /api/weather?icao=HKJK
router.get('/', controller.getWeather)

export default router
