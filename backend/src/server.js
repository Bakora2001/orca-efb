import { connect, disconnect } from './config/database.js'
import { httpServer } from './app.js'

const PORT = process.env.PORT || 4000

async function startServer() {
  try {
    // Connect to PostgreSQL
    connect()

    // Start listening
    httpServer.listen(PORT, () => {
      console.log(`Orca Aviation EFB API listening on port ${PORT}`)
    })

    // Graceful shutdown
    const shutdown = async (signal) => {
      console.log(`\nReceived ${signal}. Shutting down...`)
      await disconnect()
      process.exit(0)
    }

    process.on('SIGINT', () => shutdown('SIGINT'))
    process.on('SIGTERM', () => shutdown('SIGTERM'))
  } catch (err) {
    console.error('Failed to start server:', err)
    process.exit(1)
  }
}

startServer()
