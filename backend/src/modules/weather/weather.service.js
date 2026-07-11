/**
 * weather.service.js
 * ───────────────────
 * Proxy to NOAA Aviation Weather Center API.
 *
 * Returns live METAR + TAF for a given ICAO code.
 * Responses cached in memory for 5 minutes to avoid hammering NOAA
 * on repeated OFP builds for the same airfield.
 *
 * Features:
 *   • 5-minute in-memory cache
 *   • Parallel METAR + TAF fetch
 *   • 8-second timeout per request
 *   • Descriptive error messages
 *   • Cache clearing for admin updates
 */

import AppError from '../../utils/AppError.js'

const NOAA_BASE_URL = 'https://aviationweather.gov/api/data'
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes
const REQUEST_TIMEOUT_MS = 8000 // 8 seconds

// Simple in-memory cache: { icao: { metar, taf, fetchedAt } }
const cache = new Map()

// ═══════════════════════════════════════════════════════════════════════════
// MAIN ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetch METAR and TAF for a given ICAO code.
 *
 * @param {string} icao - Airport ICAO code (e.g., "HKJK")
 * @returns {Promise<object>} { icao, metar, taf, fetchedAt, cached }
 */
export async function getWeather(icao) {
  if (!icao || icao.trim().length < 3) {
    throw new AppError('ICAO code is required (min 3 characters)', 400)
  }

  const key = icao.trim().toUpperCase()

  // Return cached result if still fresh
  const cached = cache.get(key)
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return { ...cached, cached: true }
  }

  // Fetch METAR and TAF in parallel
  const [metarText, tafText] = await Promise.all([
    _fetchNoaa('metar', key),
    _fetchNoaa('taf',   key),
  ])

  const result = {
    icao:      key,
    metar:     metarText,
    taf:       tafText,
    fetchedAt: Date.now(),
    cached:    false,
  }

  cache.set(key, result)
  return result
}

// ═══════════════════════════════════════════════════════════════════════════
// CACHE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Clear cache entry for a specific ICAO, or clear all.
 * Called when an admin updates an airport's METAR station config.
 *
 * @param {string} [icao] - Specific ICAO to clear, or omit to clear all
 */
export function clearWeatherCache(icao) {
  if (icao) {
    cache.delete(icao.toUpperCase())
  } else {
    cache.clear()
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PRIVATE HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetch a single weather product from NOAA.
 *
 * @param {string} type - 'metar' or 'taf'
 * @param {string} icao - ICAO code
 * @returns {Promise<string>} Raw text or descriptive error message
 */
async function _fetchNoaa(type, icao) {
  try {
    const url = `${NOAA_BASE_URL}/${type}?ids=${icao}&format=raw`

    const res = await fetch(url, {
      headers: { 'User-Agent': 'OrcaEFB/1.0' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })

    if (!res.ok) {
      return `${type.toUpperCase()} unavailable (HTTP ${res.status})`
    }

    const text = (await res.text()).trim()
    return text.length > 0 ? text : `No ${type.toUpperCase()} available for ${icao}`

  } catch (err) {
    if (err.name === 'TimeoutError') {
      return `${type.toUpperCase()} fetch timed out after ${REQUEST_TIMEOUT_MS / 1000}s`
    }
    return `${type.toUpperCase()} unavailable: ${err.message}`
  }
}