import pinoHttp from 'pino-http'
import logger from '../config/logger.js'

const requestLogger = pinoHttp({
  logger,
  // Hide sensitive data from logs
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', 'req.body.password'],
    censor: '[REDACTED]',
  },
  // Custom success/error messages
  customLogLevel: (req, res, err) => {
    if (res.statusCode >= 500 || err) return 'error'
    if (res.statusCode >= 400) return 'warn'
    return 'info'
  },
  customSuccessMessage: (req, res) => {
    return `${req.method} ${req.url} completed with ${res.statusCode}`
  },
  customErrorMessage: (req, res, err) => {
    return `${req.method} ${req.url} failed with ${res.statusCode}: ${err.message}`
  },
})

export default requestLogger