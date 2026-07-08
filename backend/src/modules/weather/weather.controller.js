import * as weatherService from './weather.service.js'
import asyncHandler from '../../utils/asyncHandler.js'

export const getWeather = asyncHandler(async (req, res) => {
  const result = await weatherService.getWeather(req.query.icao)
  res.json(result)
})
