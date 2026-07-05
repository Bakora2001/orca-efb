/**
 * Custom application error with HTTP status code.
 * Throw this anywhere — the error handler catches it.
 */
class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message)
    this.statusCode = statusCode
    this.isOperational = true
    Error.captureStackTrace(this, this.constructor)
  }
}

export default AppError