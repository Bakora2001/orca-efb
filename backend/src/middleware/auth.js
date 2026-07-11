import { verifyAccessToken } from '../utils/jwt.js'
import { query } from '../config/database.js'
import AppError from '../utils/AppError.js'

// ─── In-memory token blacklist ────────────────────────────────────────────────
// Stores { token: expiresAt (ms) } entries.
// Tokens are only held until their natural expiry — the cleanup timer purges them.
const blacklist = new Map()

setInterval(() => {
  const now = Date.now()
  for (const [token, exp] of blacklist) {
    if (exp <= now) blacklist.delete(token)
  }
}, 60_000) // clean every minute

export function blacklistToken(token, expMs) {
  blacklist.set(token, expMs)
}

// ─── authenticate ─────────────────────────────────────────────────────────────

/**
 * Verify JWT access token from Authorization: Bearer <token> header.
 * Also checks:
 *   • token blacklist (immediate invalidation on logout)
 *   • token.iat vs user.token_issued_after (invalidates tokens on password change)
 */
export async function authenticate(req, _res, next) {
  const authHeader = req.headers.authorization

  if (!authHeader?.startsWith('Bearer ')) {
    return next(new AppError('No token provided', 401))
  }

  const token = authHeader.split(' ')[1]

  // Blacklist check
  if (blacklist.has(token)) {
    return next(new AppError('Token has been revoked', 401))
  }

  let decoded
  try {
    decoded = verifyAccessToken(token)
  } catch {
    return next(new AppError('Invalid or expired token', 401))
  }

  // iat check — reject tokens issued before password change
  try {
    const { rows } = await query(
      'SELECT token_issued_after FROM efbusers WHERE id = $1 AND is_active = true',
      [decoded.id]
    )

    if (rows.length === 0) {
      return next(new AppError('User not found or inactive', 401))
    }

    const issuedAfter = rows[0].token_issued_after
    if (issuedAfter) {
      const issuedAfterMs = new Date(issuedAfter).getTime()
      // decoded.iat is in seconds
      if (decoded.iat * 1000 < issuedAfterMs) {
        return next(new AppError('Token has been invalidated — please log in again', 401))
      }
    }
  } catch (dbErr) {
    // If the column doesn't exist yet (pre-migration), skip the iat check gracefully
    if (!dbErr.message?.includes('token_issued_after')) {
      return next(dbErr)
    }
  }

  req.user  = decoded
  req.token = token
  next()
}

// ─── authorize ────────────────────────────────────────────────────────────────

/**
 * Restrict access to specific roles.
 * Usage: router.get('/admin-only', authenticate, authorize('admin'), handler)
 */
export function authorize(...roles) {
  return (req, _res, next) => {
    if (!req.user) {
      return next(new AppError('Authentication required', 401))
    }
    if (!roles.includes(req.user.role)) {
      return next(new AppError('You do not have permission to perform this action', 403))
    }
    next()
  }
}
