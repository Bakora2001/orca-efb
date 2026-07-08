/**
 * Verification script to check that chart routes are properly registered
 */

import { app } from '../src/app.js'

// Extract registered routes
function getRoutes(app) {
  const routes = []
  
  app._router.stack.forEach((middleware) => {
    if (middleware.route) {
      // Routes registered directly
      routes.push({
        path: middleware.route.path,
        methods: Object.keys(middleware.route.methods).join(', ').toUpperCase()
      })
    } else if (middleware.name === 'router') {
      // Routes registered via Router
      const routerPath = middleware.regexp.source
        .replace('\\/?', '')
        .replace('(?=\\/|$)', '')
        .replace(/\\\//g, '/')
        .replace(/\^/g, '')
      
      middleware.handle.stack.forEach((handler) => {
        if (handler.route) {
          const fullPath = routerPath + handler.route.path
          routes.push({
            path: fullPath,
            methods: Object.keys(handler.route.methods).join(', ').toUpperCase()
          })
        }
      })
    }
  })
  
  return routes
}

// Get all routes
const routes = getRoutes(app)

// Filter for chart routes
const chartRoutes = routes.filter(r => r.path.includes('/api/charts'))

console.log('\n✈️  Chart Routes Verification\n')
console.log('═'.repeat(50))

if (chartRoutes.length === 0) {
  console.log('❌ ERROR: No chart routes found!')
  process.exit(1)
}

console.log(`✅ Found ${chartRoutes.length} chart routes:\n`)

chartRoutes.forEach(route => {
  console.log(`   ${route.methods.padEnd(7)} ${route.path}`)
})

console.log('\n' + '═'.repeat(50))
console.log('✅ Chart routes successfully registered!\n')

process.exit(0)
