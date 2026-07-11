import jwt from 'jsonwebtoken'

const ACCESS_SECRET  = process.env.JWT_SECRET         || 'dev-access-secret'
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret'

const ACCESS_EXPIRES  = '15m'
const REFRESH_EXPIRES = '7d'

/**
 * Sign a short-lived access token (15 minutes).
 */
export function signAccessToken(payload) {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRES })
}

/**
 * Sign a long-lived refresh token (7 days).
 */
export function signRefreshToken(payload) {
  return jwt.sign(payload, REFRESH_SECRET, { expiresIn: REFRESH_EXPIRES })
}

/**
 * Verify an access token. Throws if invalid or expired.
 */
export function verifyAccessToken(token) {
  return jwt.verify(token, ACCESS_SECRET)
}

/**
 * Verify a refresh token. Throws if invalid or expired.
 */
export function verifyRefreshToken(token) {
  return jwt.verify(token, REFRESH_SECRET)
}

// Legacy aliases — kept so any existing callers don't break
export const signToken   = signAccessToken
export const verifyToken = verifyAccessToken

export { ACCESS_SECRET, REFRESH_SECRET, ACCESS_EXPIRES, REFRESH_EXPIRES }
