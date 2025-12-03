import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { trimTrailingSlash } from 'hono/trailing-slash'
import authController from './controllers/authController'
import recipeController from './controllers/recipeController'

type Bindings = {
  FOODIST: D1Database
  IMAGES: R2Bucket
  JWT_SECRET: string
}

const app = new Hono<{ Bindings: Bindings }>()

// Remove trailing slashes
app.use('*', trimTrailingSlash())

// CORS middleware
app.use('*', cors({
  origin: [
    'https://foodist-frontend.pages.dev',
    'http://localhost:3000',
    'http://localhost:5173', // Vite default
    '*' // Allow all origins during development
  ],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  credentials: true,
  exposeHeaders: ['Content-Length', 'X-Request-Id'],
  maxAge: 86400, // 24 hours
}))

// Global error handler
app.onError((err, c) => {
  console.error('Error:', err)
  return c.json({ 
    error: 'Internal Server Error',
    message: err.message 
  }, 500)
})

// Root route - health check
app.get('/', (c) => {
  return c.json({ 
    message: 'Foodist API is running!',
    version: '1.0.0',
    endpoints: {
      auth: '/auth',
      recipes: '/recipes'
    }
  })
})

// Mount controllers
app.route('/auth', authController)
app.route('/recipes', recipeController)

// 404 handler
app.notFound((c) => {
  return c.json({ 
    error: 'Not Found',
    message: `Route ${c.req.method} ${c.req.path} not found`,
    availableRoutes: [
      'GET /',
      'POST /auth/register',
      'POST /auth/login',
      'GET /recipes',
      'GET /recipes/:id',
      'POST /recipes',
    ]
  }, 404)
})

export default app
