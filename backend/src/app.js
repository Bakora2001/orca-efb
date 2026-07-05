import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import compression from 'compression'
import cookieParser from 'cookie-parser'
import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import { query } from './config/database.js'
import requestLogger from './middleware/requestLogger.js'
import logger from './config/logger.js'
import { notFoundHandler } from './middleware/notFoundHandler.js'
import { errorHandler } from './middleware/errorHandler.js'

// ─── Route Imports ───────────────────────────────────────────────
import authRoutes     from './modules/auth/auth.routes.js'
import aircraftRoutes from './modules/aircrafts/aircraft.routes.js'
import airportRoutes  from './modules/airports/airport.routes.js'
// import navpointRoutes    from './modules/navpoints/navpoint.routes.js'
// import performanceRoutes from './modules/performance/performance.routes.js'
// import computeRoutes     from './modules/compute/compute.routes.js'
// import payloadRoutes     from './modules/payload/payload.routes.js'
// import navlogRoutes      from './modules/navlog/navlog.routes.js'
// import ofpRoutes         from './modules/ofp/ofp.routes.js'
// import weatherRoutes     from './modules/weather/weather.routes.js'
// import userRoutes        from './modules/users/user.routes.js'
// import configRoutes      from './modules/config/config.routes.js'

const app = express()

// ─── Core Middleware ─────────────────────────────────────────────
app.use(helmet())
app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
    credentials: true,
  })
)
app.use(compression())
app.use(cookieParser())
app.use(express.json())
app.use(requestLogger)

// ─── Health Checks ───────────────────────────────────────────────
app.get('/', (_req, res) => {
  res.send('🛩️  Orca Aviation EFB Backend — Running')
})

app.get('/health', async (_req, res) => {
  const checks = {
    api: 'OK',
    database: 'OK',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  }

  try {
    await query('SELECT 1')
  } catch {
    checks.database = 'ERROR'
  }

  const allHealthy = checks.database === 'OK'
  res.status(allHealthy ? 200 : 503).json(checks)
})

// ─── API Routes ──────────────────────────────────────────────────
app.use('/api/auth',     authRoutes)
app.use('/api/aircraft', aircraftRoutes)
app.use('/api/airports', airportRoutes)

// ─── 404 + Error Handlers (MUST be after all routes) ─────────────
app.use(notFoundHandler)
app.use(errorHandler)

// ─── HTTP + WebSocket Server ──────────────────────────────────────
const httpServer = createServer(app)

const wss = new WebSocketServer({ server: httpServer, path: '/ws' })
wss.on('connection', (socket) => {
  logger.info('WebSocket client connected')
  socket.send(
    JSON.stringify({
      type: 'connected',
      message: 'Orca Aviation EFB realtime channel',
    })
  )
  socket.on('message', (raw) => {
    socket.send(raw.toString())
  })
})

export { app, httpServer }