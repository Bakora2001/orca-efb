import { Router } from 'express'

const router = Router()

// POST /api/flight-planning/route — build route, distance, ETE, fuel burn
router.post('/route', (req, res) => {
  res.status(501).json({ message: 'Not implemented yet — flight planning service pending' })
})

// GET /api/flight-planning/:id
router.get('/:id', (req, res) => {
  res.status(501).json({ message: 'Not implemented yet — flight planning service pending' })
})

export default router
