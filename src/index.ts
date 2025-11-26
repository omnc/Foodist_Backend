import { Hono } from 'hono'
import authController from './controllers/authController'
import recipeController from './controllers/recipeController'

const app = new Hono()

app.route('/auth', authController)
app.route('/recipe', recipeController)

export default app
