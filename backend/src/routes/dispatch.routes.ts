import { Router } from 'express'

const router = Router()

// GET /api/dispatch — list dispatch records
router.get('/', (req, res) => {
  res.status(501).json({ message: 'Not implemented yet — dispatch service pending' })
})

// POST /api/dispatch — create dispatch decision (runs performance engine + weather check)
router.post('/', (req, res) => {
  res.status(501).json({ message: 'Not implemented yet — dispatch service pending' })
})

// GET /api/dispatch/:id
router.get('/:id', (req, res) => {
  res.status(501).json({ message: 'Not implemented yet — dispatch service pending' })
})

export default router
