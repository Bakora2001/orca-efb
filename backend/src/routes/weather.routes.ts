import { Router } from 'express'

const router = Router()

// GET /api/weather/:icao — live METAR/TAF for an airport
router.get('/:icao', (req, res) => {
  // TODO: integrate with an aviation weather provider (e.g. NOAA ADDS, AVWX, CheckWX)
  res.status(501).json({ message: 'Not implemented yet — weather service pending' })
})

export default router
