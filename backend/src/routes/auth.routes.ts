import { Router } from 'express'

const router = Router()

// POST /api/auth/login
router.post('/login', (req, res) => {
  // TODO: validate credentials against the users table, issue JWT
  res.status(501).json({ message: 'Not implemented yet — auth service pending' })
})

// POST /api/auth/register
router.post('/register', (req, res) => {
  // TODO: create dispatcher/administrator account
  res.status(501).json({ message: 'Not implemented yet — auth service pending' })
})

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.status(501).json({ message: 'Not implemented yet — auth service pending' })
})

export default router
