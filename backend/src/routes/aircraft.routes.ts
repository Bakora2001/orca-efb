import { Router } from 'express'

const router = Router()

// GET /api/aircraft — list fleet
router.get('/', (req, res) => {
  res.status(501).json({ message: 'Not implemented yet — fleet service pending' })
})

// GET /api/aircraft/:registration
router.get('/:registration', (req, res) => {
  res.status(501).json({ message: 'Not implemented yet — fleet service pending' })
})

// POST /api/aircraft — add aircraft (admin)
router.post('/', (req, res) => {
  res.status(501).json({ message: 'Not implemented yet — fleet service pending' })
})

// PUT /api/aircraft/:registration — update aircraft (admin)
router.put('/:registration', (req, res) => {
  res.status(501).json({ message: 'Not implemented yet — fleet service pending' })
})

export default router
