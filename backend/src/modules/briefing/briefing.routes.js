import { Router } from 'express'
import { ofp, performanceReport, performanceReportPdf } from './briefing.controller.js'
import { authenticate } from '../../middleware/auth.js'

const router = Router()
router.use(authenticate)

// POST /api/briefing/ofp                   — generate full OFP PDF
router.post('/ofp', ofp)

// POST /api/briefing/performance-report    — RTOW across temp range (JSON)
router.post('/performance-report', performanceReport)

// POST /api/briefing/performance-report/pdf — same but PDF download
router.post('/performance-report/pdf', performanceReportPdf)

export default router