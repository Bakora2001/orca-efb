import { Router } from 'express'
import * as controller from './users.controller.js'
import { authenticate, authorize } from '../../middleware/auth.js'

const router = Router()
router.use(authenticate)
router.use(authorize('admin'))

router.get('/',          controller.getAll)
router.get('/:id',       controller.getOne)
router.post('/',         controller.create)
router.patch('/:id',     controller.update)
router.patch('/:id/deactivate', controller.deactivate)

export default router