import { Router } from 'express'
import * as controller from './auth.controller.js'
import { validate } from '../../middleware/validate.js'
import { authenticate } from '../../middleware/auth.js'
import { registerSchema, loginSchema } from './auth.validation.js'

const router = Router()

router.post('/register',         validate(registerSchema), controller.register)
router.post('/login',            validate(loginSchema),    controller.login)
router.post('/refresh',                                    controller.refresh)
router.post('/logout',           authenticate,             controller.logout)
router.get('/profile',           authenticate,             controller.getProfile)
router.post('/change-password',  authenticate,             controller.changePassword)

export default router
