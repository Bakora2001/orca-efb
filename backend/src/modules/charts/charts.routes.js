import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import * as controller from './charts.controller.js'
import { authenticate, authorize } from '../../middleware/auth.js'

const router = Router()

// Multer configuration for chart file uploads
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, 'public/uploads')
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    cb(null, uniqueSuffix + path.extname(file.originalname))
  }
})

const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max for chart PDFs/images
  fileFilter: (_req, file, cb) => {
    // Accept PDF, PNG, JPG, JPEG
    const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg']
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Only PDF and image files (PNG, JPG, JPEG) are accepted'))
    }
  }
})

// All chart routes require authentication
router.use(authenticate)

// GET /api/charts - List all charts
router.get('/', controller.listCharts)

// GET /api/charts/:id/image - Serve chart image file (must come before /:id)
router.get('/:id/image', controller.serveChartImage)

// GET /api/charts/:id - Get chart by ID
router.get('/:id', controller.getChart)

// GET /api/charts/aircraft/:aircraftId - Get aircraft charts
router.get('/aircraft/:aircraftId', controller.getAircraftCharts)

// POST /api/charts/upload - Upload chart (authenticated with file upload)
router.post('/upload', upload.single('file'), controller.uploadChart)

// POST /api/charts/interpret - Interpret chart value
router.post('/interpret', controller.interpretChart)

// DELETE /api/charts/:id - Delete chart (admin only)
router.delete('/:id', authorize('admin'), controller.deleteChart)

export default router
