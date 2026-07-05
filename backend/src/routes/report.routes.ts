import { Router } from 'express'

const router = Router()

// GET /api/reports/dispatch — dispatch report export
router.get('/dispatch', (req, res) => {
  res.status(501).json({ message: 'Not implemented yet — reporting service pending' })
})

// GET /api/reports/fuel
router.get('/fuel', (req, res) => {
  res.status(501).json({ message: 'Not implemented yet — reporting service pending' })
})

// GET /api/reports/payload
router.get('/payload', (req, res) => {
  res.status(501).json({ message: 'Not implemented yet — reporting service pending' })
})

export default router
