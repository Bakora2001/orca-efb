import { Router } from 'express'

const router = Router()

// GET /api/users — list users (admin)
router.get('/', (req, res) => {
  res.status(501).json({ message: 'Not implemented yet — user service pending' })
})

// POST /api/users — create user (admin)
router.post('/', (req, res) => {
  res.status(501).json({ message: 'Not implemented yet — user service pending' })
})

// PUT /api/users/:id — update user (admin)
router.put('/:id', (req, res) => {
  res.status(501).json({ message: 'Not implemented yet — user service pending' })
})

export default router
