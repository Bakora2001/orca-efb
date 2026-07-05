import logger from '../config/logger.js'

/**
 * Central error handler — catches ALL errors from routes.
 * Place AFTER all routes in app.js.
 */
export function errorHandler(err, req, res, _next) {
  // Log the error
  logger.error({
    err,
    method: req.method,
    url: req.originalUrl,
    body: req.body,
    params: req.params,
    query: req.query,
    userId: req.user?.id,
  }, err.message)

  // PostgreSQL errors
  if (err.code === '23505') {
    return res.status(409).json({
      success: false,
      error: 'Duplicate entry',
      message: 'A record with that value already exists.',
    })
  }

  if (err.code === '23503') {
    return res.status(400).json({
      success: false,
      error: 'Foreign key violation',
      message: 'Referenced record does not exist.',
    })
  }

  if (err.code === '23502') {
    return res.status(400).json({
      success: false,
      error: 'Missing required field',
      message: 'A required field is missing.',
    })
  }

  // Zod validation errors
  if (err.name === 'ZodError') {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: err.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    })
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      error: 'Invalid token',
      message: 'The token is invalid or malformed.',
    })
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      error: 'Token expired',
      message: 'Your session has expired. Please log in again.',
    })
  }

  // Our custom AppError
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      success: false,
      error: err.message,
    })
  }

  // Unknown / programmer errors — don't leak details in production
  const isProduction = process.env.NODE_ENV === 'production'
  res.status(500).json({
    success: false,
    error: isProduction ? 'Internal server error' : err.message,
    ...(isProduction ? {} : { stack: err.stack }),
  })
}