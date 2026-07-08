/**
 * Weather Service - METAR/TAF Proxy
 * 
 * Fetches live aviation weather from NOAA Aviation Weather Center API
 * Free service, no API key required
 */

import AppError from '../../utils/AppError.js'

const NOAA_BASE_URL = 'https://aviationweather.gov/api/data'
const REQUEST_TIMEOUT = 5000 // 5 seconds

/**
 * Fetch METAR and TAF for a given ICAO code
 * @param {string} icao - Airport ICAO code
 * @returns {Promise<Object>} Weather data with metar, taf, and error fields
 */
export async function getWeather(icao) {
  if (!icao || icao.trim().length === 0) {
    throw new AppError('No ICAO supplied', 400)
  }

  const icaoUpper = icao.trim().toUpperCase()
  const result = {
    icao: icaoUpper,
    metar: null,
    taf: null,
    error: null
  }

  try {
    // Fetch METAR
    const metarUrl = `${NOAA_BASE_URL}/metar?ids=${icaoUpper}&format=raw`
    const metarController = new AbortController()
    const metarTimeout = setTimeout(() => metarController.abort(), REQUEST_TIMEOUT)
    
    try {
      const metarResponse = await fetch(metarUrl, {
        headers: { 'User-Agent': 'OrcaEFB/1.0' },
        signal: metarController.signal
      })
      clearTimeout(metarTimeout)
      
      if (metarResponse.ok) {
        const metarText = await metarResponse.text()
        result.metar = metarText.trim() || null
      }
    } catch (err) {
      clearTimeout(metarTimeout)
      if (err.name !== 'AbortError') throw err
    }

    // Fetch TAF
    const tafUrl = `${NOAA_BASE_URL}/taf?ids=${icaoUpper}&format=raw`
    const tafController = new AbortController()
    const tafTimeout = setTimeout(() => tafController.abort(), REQUEST_TIMEOUT)
    
    try {
      const tafResponse = await fetch(tafUrl, {
        headers: { 'User-Agent': 'OrcaEFB/1.0' },
        signal: tafController.signal
      })
      clearTimeout(tafTimeout)
      
      if (tafResponse.ok) {
        const tafText = await tafResponse.text()
        result.taf = tafText.trim() || null
      }
    } catch (err) {
      clearTimeout(tafTimeout)
      if (err.name !== 'AbortError') throw err
    }

  } catch (error) {
    result.error = `Weather service unreachable (${error.message}). Check internet connection.`
  }

  return result
}
