import { Router } from 'express'

const router = Router()

// POST /api/ofp/generate — generate full OFP document from flight + performance + weather data
router.post('/generate', (req, res) => {
  res.status(501).json({ message: 'Not implemented yet — OFP service pending' })
})

// GET /api/ofp/:id/pdf — export OFP as PDF
router.get('/:id/pdf', (req, res) => {
  res.status(501).json({ message: 'Not implemented yet — OFP service pending' })
})

export default router
