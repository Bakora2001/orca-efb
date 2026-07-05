import AppError from '../utils/AppError.js'

/**
 * Middleware factory that validates request body against a Zod schema.
 * Usage: router.post('/login', validate(loginSchema), controller.login)
 */
export function validate(schema) {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body)

    if (!result.success) {
      const error = new AppError('Validation failed', 400)
      error.name = 'ZodError'
      error.errors = result.error.errors
      return next(error)
    }

    req.body = result.data // Use parsed/sanitized data
    next()
  }
}