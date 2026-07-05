import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret'
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h'

/**
 * Sign a JWT token for a user
 */
export function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })
}

/**
 * Verify and decode a JWT token
 */
export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET)
}

export { JWT_SECRET, JWT_EXPIRES_IN }