import express from 'express'
import cors from 'cors'
import path from 'path'
import { initDatabase } from './db'
import sessionsRouter from './routes/sessions'
import labelsRouter from './routes/labels'
import modelsRouter from './routes/models'
import configsRouter from './routes/configs'
import buildsRouter from './routes/builds'
import statsRouter from './routes/stats'

const app = express()
const PORT = process.env.PORT || 3001

// Middleware
app.use(cors())
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
})
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true, limit: '50mb' }))

// Initialize database
initDatabase()

// API Routes
app.use('/api/sessions', sessionsRouter)
app.use('/api/labels', labelsRouter)
app.use('/api/models', modelsRouter)
app.use('/api/configs', configsRouter)
app.use('/api/builds', buildsRouter)
app.use('/api/stats', statsRouter)

// Serve static files (sessions, models, builds)
app.use('/data', express.static(path.join(process.cwd(), 'data')))

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() })
})

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err)
  res.status(500).json({
    error: err.message || 'Internal server error',
  })
})

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`🚀 SDK Kit API running on http://0.0.0.0:${PORT}`)
  console.log(`📊 Dashboard: http://localhost:5173`)
})
