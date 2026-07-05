import { Router } from 'express'

const router = Router()

// POST /api/performance/rtow — calculate RTOW + payload from performance database
router.post('/rtow', (req, res) => {
  // TODO: run RTOWInput through performance lookup/interpolation engine
  // see src/services/performanceEngine.service.ts (to be implemented)
  res.status(501).json({ message: 'Not implemented yet — performance engine pending' })
})

// POST /api/performance/wat — WAT limit analysis
router.post('/wat', (req, res) => {
  res.status(501).json({ message: 'Not implemented yet — performance engine pending' })
})

// GET /api/performance/envelope — performance envelope data for charts
router.get('/envelope', (req, res) => {
  res.status(501).json({ message: 'Not implemented yet — performance engine pending' })
})

export default router
