import { verifyToken } from '../utils/jwt.js'
import AppError from '../utils/AppError.js'

/**
 * Verify JWT token from Authorization header.
 * Attaches decoded user to req.user.
 */
export function authenticate(req, _res, next) {
  const authHeader = req.headers.authorization

  if (!authHeader?.startsWith('Bearer ')) {
    return next(new AppError('No token provided', 401))
  }

  try {
    const token = authHeader.split(' ')[1]
    const decoded = verifyToken(token)
    req.user = decoded
    next()
  } catch (err) {
    return next(new AppError('Invalid or expired token', 401))
  }
}

/**
 * Restrict access to specific roles.
 * Usage: router.get('/admin-only', authenticate, authorize('admin'), controller.fn)
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