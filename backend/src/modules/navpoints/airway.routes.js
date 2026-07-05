import { Router } from 'express'
import multer from 'multer'
import * as controller from './airway.controller.js'
import { authenticate, authorize } from '../../middleware/auth.js'

const router = Router()
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB — airway files can be large
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true)
    } else {
      cb(new Error('Only CSV files are accepted'))
    }
  },
})

router.use(authenticate)

// GET /api/airways?south=&north=&west=&east=&limit=
router.get('/', controller.getByBbox)

// GET /api/airways/route/:routeName
router.get('/route/:routeName', controller.getByName)

// POST /api/airways/import-csv  — upload airway_segments.csv (admin only)
router.post('/import-csv', authorize('admin'), upload.single('airway_csv'), controller.importCsv)

// POST /api/airways/bulk-import  — JSON array (admin only)
router.post('/bulk-import', authorize('admin'), controller.bulkImport)

// POST /api/airways/clear  — wipe all airways (admin only)
router.post('/clear', authorize('admin'), controller.clearAll)

export default router


// import { Router } from 'express'
// import * as controller from './airway.controller.js'
// import { authenticate, authorize } from '../../middleware/auth.js'

// const router = Router()

// router.use(authenticate)

// // GET /api/airways?south=&north=&west=&east=&limit=
// // Primary endpoint — called by map on every pan/zoom
// router.get('/', controller.getByBbox)

// // GET /api/airways/route/:routeName
// // Get all segments of a named airway e.g. GET /api/airways/route/B226
// router.get('/route/:routeName', controller.getByName)

// // POST /api/airways/bulk-import  — admin: import segment JSON array
// router.post('/bulk-import', authorize('admin'), controller.bulkImport)

// // POST /api/airways/clear  — admin: wipe all airways
// router.post('/clear', authorize('admin'), controller.clearAll)

// export default router