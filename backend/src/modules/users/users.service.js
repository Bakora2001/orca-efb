// ─── users.service.js ────────────────────────────────────────────
import { query } from '../../config/database.js'
import { hashPassword } from '../../utils/hash.js'
import AppError from '../../utils/AppError.js'

export async function getAllUsers() {
  const { rows } = await query(
    `SELECT id, username, email, role, full_name, is_active, last_login, created_at
     FROM efbusers ORDER BY created_at DESC`
  )
  return rows
}

export async function getUserById(id) {
  const { rows } = await query(
    `SELECT id, username, email, role, full_name, is_active, last_login, created_at
     FROM efbusers WHERE id = $1`,
    [id]
  )
  if (rows.length === 0) throw new AppError('User not found', 404)
  return rows[0]
}

export async function createUser({ username, email, password, fullName, role }) {
  const existing = await query('SELECT id FROM efbusers WHERE username = $1', [username])
  if (existing.rows.length > 0) throw new AppError('Username already taken', 409)

  const passwordHash = await hashPassword(password)
  const { rows } = await query(
    `INSERT INTO efbusers (username, email, password_hash, full_name, role)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, username, email, role, full_name, is_active, created_at`,
    [username, email || null, passwordHash, fullName || null, role || 'dispatcher']
  )
  return rows[0]
}

export async function updateUser(id, updates) {
  await getUserById(id)
  if (updates.password) {
    updates.password_hash = await hashPassword(updates.password)
    delete updates.password
  }
  if (updates.fullName) { updates.full_name = updates.fullName; delete updates.fullName }

  const allowed = ['email', 'full_name', 'role', 'is_active', 'password_hash']
  const fields  = Object.keys(updates).filter(k => allowed.includes(k))
  if (fields.length === 0) throw new AppError('No valid fields to update', 400)

  const setClauses = fields.map((f, i) => `${f} = $${i + 1}`)
  const values     = fields.map(f => updates[f])
  const { rows }   = await query(
    `UPDATE efbusers SET ${setClauses.join(', ')}, updated_at = NOW()
     WHERE id = $${fields.length + 1}
     RETURNING id, username, email, role, full_name, is_active`,
    [...values, id]
  )
  return rows[0]
}

export async function deactivateUser(id) {
  await getUserById(id)
  const { rows } = await query(
    `UPDATE efbusers SET is_active = false, updated_at = NOW()
     WHERE id = $1
     RETURNING id, username, is_active`,
    [id]
  )
  return rows[0]
}