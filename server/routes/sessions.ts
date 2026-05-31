import express from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { db, queries } from '../db'
import { nanoid } from 'nanoid'

const router = express.Router()

// Configure multer for video uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const date = new Date().toISOString().split('T')[0]
    const dir = path.join(process.cwd(), 'data', 'sessions', date)

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    cb(null, dir)
  },
  filename: (req, file, cb) => {
    const id = nanoid(10)
    const ext = path.extname(file.originalname)
    cb(null, `session-${id}${ext}`)
  }
})

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['video/webm', 'video/mp4', 'video/ogg']
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Invalid file type. Only video files allowed.'))
    }
  }
})

// GET /api/sessions - Get all sessions
router.get('/', (req, res) => {
  try {
    const { status, label, limit = 100, offset = 0 } = req.query

    let query = 'SELECT * FROM sessions WHERE 1=1'
    const params: any[] = []

    if (status) {
      query += ' AND status = ?'
      params.push(status)
    }

    if (label) {
      query += ' AND label = ?'
      params.push(label)
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?'
    params.push(Number(limit), Number(offset))

    const sessions = db.prepare(query).all(...params)

    res.json({
      sessions,
      total: sessions.length,
    })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

// GET /api/sessions/:id - Get session by ID
router.get('/:id', (req, res) => {
  try {
    const session = queries.getSessionById.get(req.params.id)

    if (!session) {
      return res.status(404).json({ error: 'Session not found' })
    }

    res.json(session)
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

// POST /api/sessions - Create new session
router.post('/', upload.single('video'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No video file uploaded' })
    }

    const id = nanoid()
    const timestamp = Date.now()
    const videoPath = req.file.path.replace(process.cwd(), '')
    const duration = req.body.duration ? parseInt(req.body.duration) : null
    const metadata = req.body.metadata || '{}'

    queries.insertSession.run(
      id,
      timestamp,
      videoPath,
      duration,
      metadata
    )

    const session = queries.getSessionById.get(id)

    res.status(201).json({
      message: 'Session created',
      session,
    })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

// DELETE /api/sessions/:id - Delete session
router.delete('/:id', (req, res) => {
  try {
    const session: any = queries.getSessionById.get(req.params.id)

    if (!session) {
      return res.status(404).json({ error: 'Session not found' })
    }

    // Delete video file
    const videoPath = path.join(process.cwd(), session.video_path)
    if (fs.existsSync(videoPath)) {
      fs.unlinkSync(videoPath)
    }

    // Delete from database
    db.prepare('DELETE FROM sessions WHERE id = ?').run(req.params.id)

    res.json({ message: 'Session deleted' })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

// POST /api/sessions/export - Export labeled sessions
router.post('/export', async (req, res) => {
  try {
    const sessions: any[] = db.prepare(`
      SELECT * FROM sessions
      WHERE status = 'labeled'
      ORDER BY created_at DESC
    `).all()

    if (sessions.length === 0) {
      return res.status(400).json({ error: 'No labeled sessions to export' })
    }

    // Create CSV
    const csv = [
      'id,timestamp,video_path,label,duration,labeled_at',
      ...sessions.map(s =>
        `${s.id},${s.timestamp},${s.video_path},${s.label},${s.duration},${s.labeled_at}`
      )
    ].join('\n')

    const exportDir = path.join(process.cwd(), 'data', 'exports')
    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true })
    }

    const timestamp = new Date().toISOString().split('T')[0]
    const csvPath = path.join(exportDir, `labeled-data-${timestamp}.csv`)

    fs.writeFileSync(csvPath, csv)

    res.json({
      message: 'Export created',
      path: csvPath,
      count: sessions.length,
    })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

export default router
