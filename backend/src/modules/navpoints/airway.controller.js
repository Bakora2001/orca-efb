import * as airwayService from './airway.service.js'
import asyncHandler from '../../utils/asyncHandler.js'

export const getByBbox = asyncHandler(async (req, res) => {
  const { south, north, west, east, limit } = req.query
  const segments = await airwayService.getAirwaysByBbox(south, north, west, east, limit)
  res.json(segments) // plain array — map draws polylines directly from this
})

export const getByName = asyncHandler(async (req, res) => {
  const segments = await airwayService.getAirwayByName(req.params.routeName)
  res.json({ success: true, data: segments })
})

export const importCsv = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'CSV file is required (field name: airway_csv)' })
  }
  const result = await airwayService.importAirwaysCsv(req.file.buffer, {
    overwrite: req.body.overwrite === 'true' || req.body.overwrite === true,
  })
  res.json({ success: true, data: result })
})

export const bulkImport = asyncHandler(async (req, res) => {
  const { segments, overwrite } = req.body
  if (!Array.isArray(segments) || segments.length === 0) {
    return res.status(400).json({ success: false, message: 'segments must be a non-empty array' })
  }
  const result = await airwayService.bulkImportAirways(segments, { overwrite: overwrite === true })
  res.json({ success: true, data: result })
})

export const clearAll = asyncHandler(async (req, res) => {
  const { confirm } = req.body
  if (confirm !== 'DELETE ALL') {
    return res.status(400).json({ success: false, message: 'Send { confirm: "DELETE ALL" } to proceed' })
  }
  const result = await airwayService.clearAllAirways()
  res.json({ success: true, data: result })
})


// import * as airwayService from './airway.service.js'
// import asyncHandler from '../../utils/asyncHandler.js'

// export const getByBbox = asyncHandler(async (req, res) => {
//   const { south, north, west, east, limit } = req.query
//   const segments = await airwayService.getAirwaysByBbox(south, north, west, east, limit)
//   // Plain array — mockup uses this directly to draw polylines on map
//   res.json(segments)
// })

// export const getByName = asyncHandler(async (req, res) => {
//   const segments = await airwayService.getAirwayByName(req.params.routeName)
//   res.json({ success: true, data: segments })
// })

// export const bulkImport = asyncHandler(async (req, res) => {
//   const { segments, overwrite } = req.body
//   if (!Array.isArray(segments) || segments.length === 0) {
//     return res.status(400).json({ success: false, message: 'segments must be a non-empty array' })
//   }
//   const result = await airwayService.bulkImportAirways(segments, { overwrite: overwrite === true })
//   res.json({ success: true, data: result })
// })

// export const clearAll = asyncHandler(async (req, res) => {
//   const { confirm } = req.body
//   if (confirm !== 'DELETE ALL') {
//     return res.status(400).json({ success: false, message: 'Send { confirm: "DELETE ALL" } to proceed' })
//   }
//   const result = await airwayService.clearAllAirways()
//   res.json({ success: true, data: result })
// })