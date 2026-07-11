import { query } from '../../config/database.js'
import { hashPassword, comparePassword } from '../../utils/hash.js'
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../utils/jwt.js'
import AppError from '../../utils/AppError.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRefreshCookieOptions() {
  return {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
    maxAge:   7 * 24 * 60 * 60 * 1000, // 7 days in ms
    path:     '/api/auth',
  }
}

function buildTokenPair(user) {
  const payload = { id: user.id, username: user.username, role: user.role }
  return {
    accessToken:  signAccessToken(payload),
    refreshToken: signRefreshToken(payload),
  }
}

// ─── register ─────────────────────────────────────────────────────────────────

export async function register({ username, email, password, fullName, role }) {
  const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(username)
  const resolvedEmail  = email || (looksLikeEmail ? username : null)

  const existing = await query(
    'SELECT id FROM efbusers WHERE username = $1 OR (email = $2 AND $2 IS NOT NULL)',
    [username, resolvedEmail]
  )
  if (existing.rows.length > 0) {
    throw new AppError('Username or email already taken', 409)
  }

  const passwordHash = await hashPassword(password)

  const { rows } = await query(
    `INSERT INTO efbusers (username, email, password_hash, full_name, role)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, username, email, role, full_name, created_at`,
    [username, resolvedEmail, passwordHash, fullName || null, role || 'dispatcher']
  )

  return rows[0]
}

// ─── login ────────────────────────────────────────────────────────────────────

export async function login({ username, password }, res) {
  const { rows } = await query(
    `SELECT id, username, password_hash, role, full_name, is_active
     FROM efbusers
     WHERE username = $1 OR email = $1`,
    [username]
  )

  if (rows.length === 0) throw new AppError('Invalid username or password', 401)

  const user = rows[0]
  if (!user.is_active) throw new AppError('Account is deactivated. Contact an administrator.', 403)

  const isValid = await comparePassword(password, user.password_hash)
  if (!isValid) throw new AppError('Invalid username or password', 401)

  await query('UPDATE efbusers SET last_login = NOW() WHERE id = $1', [user.id])

  const { accessToken, refreshToken } = buildTokenPair(user)

  // Set refresh token in httpOnly cookie
  res.cookie('refreshToken', refreshToken, makeRefreshCookieOptions())

  return {
    token: accessToken,   // keep key as 'token' so existing frontend code still works
    user: {
      id:        user.id,
      username:  user.username,
      role:      user.role,
      full_name: user.full_name,
    },
  }
}

// ─── refresh ──────────────────────────────────────────────────────────────────

export async function refresh(refreshToken) {
  if (!refreshToken) throw new AppError('No refresh token', 401)

  let decoded
  try {
    decoded = verifyRefreshToken(refreshToken)
  } catch {
    throw new AppError('Invalid or expired refresh token', 401)
  }

  // Load fresh user from DB — catches deactivated accounts and role changes
  const { rows } = await query(
    `SELECT id, username, role, full_name, is_active FROM efbusers WHERE id = $1`,
    [decoded.id]
  )

  if (rows.length === 0 || !rows[0].is_active) {
    throw new AppError('User not found or inactive', 401)
  }

  const user = rows[0]
  const accessToken = signAccessToken({ id: user.id, username: user.username, role: user.role })

  return {
    token: accessToken,
    user: {
      id:        user.id,
      username:  user.username,
      role:      user.role,
      full_name: user.full_name,
    },
  }
}

// ─── logout ───────────────────────────────────────────────────────────────────

export async function logout(res) {
  // Clear the refresh cookie
  res.clearCookie('refreshToken', { ...makeRefreshCookieOptions(), maxAge: 0 })
}

// ─── getProfile ───────────────────────────────────────────────────────────────

export async function getProfile(userId) {
  const { rows } = await query(
    'SELECT id, username, email, role, full_name, last_login, created_at FROM efbusers WHERE id = $1',
    [userId]
  )
  if (rows.length === 0) throw new AppError('User not found', 404)
  return rows[0]
}

// ─── changePassword ───────────────────────────────────────────────────────────
// Updates password and bumps token_issued_after so all existing tokens are invalidated.

export async function changePassword(userId, currentPassword, newPassword) {
  const { rows } = await query(
    'SELECT password_hash FROM efbusers WHERE id = $1',
    [userId]
  )
  if (rows.length === 0) throw new AppError('User not found', 404)

  const valid = await comparePassword(currentPassword, rows[0].password_hash)
  if (!valid) throw new AppError('Current password is incorrect', 401)

  const newHash = await hashPassword(newPassword)
  await query(
    `UPDATE efbusers SET password_hash = $1, token_issued_after = NOW(), updated_at = NOW()
     WHERE id = $2`,
    [newHash, userId]
  )
}
