import AppError from '../utils/AppError.js'

/**
 * Catches all unmatched routes (404).
 * Place AFTER all routes, BEFORE errorHandler.
 */
export function notFoundHandler(req, _res, next) {
  next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404))
}