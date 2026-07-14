import * as airportService from './airport.service.js'
import asyncHandler from '../../utils/asyncHandler.js'

const mapAirport = (a) => ({
  ...a,
  icao: a.icao_code,
  iata: a.iata_code
})

export const getAll = asyncHandler(async (req, res) => {
  const airports = await airportService.getAllAirports()
  res.json({ success: true, data: airports.map(mapAirport) })
})

export const search = asyncHandler(async (req, res) => {
  const results = await airportService.searchAirports(req.query.q, 30)
  // The mockup expects a plain array (not wrapped), so we return directly
  // to match: const r = await fetch('/api/airports/search?q=...')
  //           const aps = await r.json()  <-- used as array
  res.json(results.map(mapAirport))
})

export const getOne = asyncHandler(async (req, res) => {
  const airport = await airportService.getAirportById(req.params.id)
  res.json({ success: true, data: mapAirport(airport) })
})

export const create = asyncHandler(async (req, res) => {
  const airport = await airportService.createAirport(req.body)
  res.status(201).json({ success: true, data: airport })
})

export const update = asyncHandler(async (req, res) => {
  const airport = await airportService.updateAirport(req.params.id, req.body)
  res.json({ success: true, data: airport })
})

export const deactivate = asyncHandler(async (req, res) => {
  const result = await airportService.deleteAirport(req.params.id)
  res.json({ success: true, data: result })
})

export const clearBySource = asyncHandler(async (req, res) => {
  const { scope, confirm: confirmText } = req.body
  if (scope === 'all' && confirmText !== 'DELETE ALL') {
    return res.status(400).json({ success: false, message: 'Type DELETE ALL to confirm' })
  }
  const result = await airportService.clearAirportsBySource(scope)
  res.json({ success: true, data: result })
})

export const importOurAirports = asyncHandler(async (req, res) => {
  const airportsCsv = req.files?.airports_csv?.[0]
  const runwaysCsv = req.files?.runways_csv?.[0]

  if (!airportsCsv) {
    return res.status(400).json({ success: false, message: 'airports_csv file is required' })
  }

  const result = await airportService.importOurAirports(
    airportsCsv.buffer,
    runwaysCsv?.buffer || null,
    {
      overwrite: req.body.overwrite === 'true' || req.body.overwrite === true,
      requireRunway: req.body.require_runway !== 'false',
      skipSmall: req.body.skip_small !== 'false',
      countryFilter: req.body.region_filter || '',
    }
  )

  res.json({ success: true, data: result })
})