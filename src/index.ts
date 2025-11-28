import { Hono } from 'hono'
import { cors } from 'hono/cors'
import authController from './controllers/authController'
import recipeController from './controllers/recipeController'

type Bindings = {
  FOODIST: D1Database
  IMAGES: R2Bucket
  JWT_SECRET: string
}

const app = new Hono<{ Bindings: Bindings }>()

// CORS middleware
app.use('*', cors({
  origin: '*', // In production, replace with your frontend domain
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
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
