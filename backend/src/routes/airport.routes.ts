import { Router } from 'express'

const router = Router()

// GET /api/airports — list / search airports
router.get('/', (req, res) => {
  res.status(501).json({ message: 'Not implemented yet — airport service pending' })
})

// GET /api/airports/:icao
router.get('/:icao', (req, res) => {
  res.status(501).json({ message: 'Not implemented yet — airport service pending' })
})

// POST /api/airports — add airport (admin)
router.post('/', (req, res) => {
  res.status(501).json({ message: 'Not implemented yet — airport service pending' })
})

export default router
