import { query } from '../../config/database.js'
import { hashPassword, comparePassword } from '../../utils/hash.js'
import { signToken } from '../../utils/jwt.js'
import AppError from '../../utils/AppError.js'

/**
 * Register a new user
 */
export async function register({ username, email, password, fullName, role }) {
  // If the supplied username looks like an email, also store it in the email column
  const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(username)
  const resolvedEmail = email || (looksLikeEmail ? username : null)

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

/**
 * Login a user — accepts either username or email in the username field
 */
export async function login({ username, password }) {
  const { rows } = await query(
    `SELECT id, username, password_hash, role, full_name, is_active
     FROM efbusers
     WHERE username = $1 OR email = $1`,
    [username]
  )

  if (rows.length === 0) {
    throw new AppError('Invalid username or password', 401)
  }

  const user = rows[0]

  if (!user.is_active) {
    throw new AppError('Account is deactivated. Contact an administrator.', 403)
  }

  const isValid = await comparePassword(password, user.password_hash)
  if (!isValid) {
    throw new AppError('Invalid username or password', 401)
  }

  await query('UPDATE efbusers SET last_login = NOW() WHERE id = $1', [user.id])

  const token = signToken({
    id: user.id,
    username: user.username,
    role: user.role,
  })

  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      full_name: user.full_name,
    },
  }
}

/**
 * Get current user profile
 */
export async function getProfile(userId) {
  const { rows } = await query(
    'SELECT id, username, email, role, full_name, last_login, created_at FROM efbusers WHERE id = $1',
    [userId]
  )

  if (rows.length === 0) {
    throw new AppError('User not found', 404)
  }

  return rows[0]
}