import { Hono } from 'hono'
import authController from './controllers/authController'
import recipeController from './controllers/recipeController'

type Bindings = {
  FOODIST: D1Database
  IMAGES: R2Bucket
  JWT_SECRET: string
}

const app = new Hono<{ Bindings: Bindings }>()

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

export default app
