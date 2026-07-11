// weather.controller.js
import { getWeather, clearWeatherCache } from './weather.service.js'
import asyncHandler from '../../utils/asyncHandler.js'

export const weather = asyncHandler(async (req, res) => {
  const icao = req.query.icao
  if (!icao) {
    return res.status(400).json({ success: false, message: 'icao query param is required' })
  }
  const result = await getWeather(icao)
  res.json({ success: true, data: result })
})

export const clearCache = asyncHandler(async (req, res) => {
  clearWeatherCache(req.query.icao ?? null)
  res.json({ success: true, data: { message: 'Weather cache cleared' } })
})