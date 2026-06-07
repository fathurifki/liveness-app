import express from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { db, queries } from '../db'
import { nanoid } from 'nanoid'
import ffmpeg from 'fluent-ffmpeg'
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg'
// @ts-ignore
import * as archiverModule from 'archiver'
const createArchive = (archiverModule.default || archiverModule) as any

ffmpeg.setFfmpegPath(ffmpegInstaller.path)

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
    console.log('Upload attempt - mimetype:', file.mimetype);
    if (file.mimetype.startsWith('video/') || file.mimetype.startsWith('image/')) {
      cb(null, true)
    } else {
      cb(new Error(`Invalid file type (${file.mimetype}). ERROR_DEBUG_IMAGE_V2`))
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
    console.log('POST /api/sessions called');
    if (!req.file) {
      console.log('No file in request');
      return res.status(400).json({ error: 'No media file uploaded' })
    }

    const id = nanoid()
    const timestamp = Date.now()
    const videoPath = req.file.path.replace(process.cwd(), '')
    const duration = req.body.duration ? parseInt(req.body.duration) : null
    const metadata = req.body.metadata || '{}'

    console.log('Saving session:', { id, videoPath, metadata });

    let mediaType = 'video'
    if (req.file.mimetype.startsWith('image/')) {
      mediaType = 'image'
    }

    queries.insertSession.run(
      id,
      timestamp,
      videoPath,
      duration,
      metadata,
      mediaType
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

// Helper: Extract frames from video
const extractFrames = (videoPath: string, outputDir: string, fps = 1): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true })
    }
    ffmpeg(videoPath)
      .fps(fps)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .save(`${outputDir}/frame-%04d.jpg`)
  })
}

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

    const timestamp = new Date().toISOString().replace(/[-:T]/g, '').split('.')[0]
    const exportDir = path.join(process.cwd(), 'data', 'exports')
    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true })
    }

    const tempDir = path.join(exportDir, `temp-${timestamp}`)
    const outZip = path.join(exportDir, `dataset-${timestamp}.zip`)

    // Create struct
    const dirs = {
      videosReal: path.join(tempDir, 'videos', 'REAL'),
      videosSpoof: path.join(tempDir, 'videos', 'SPOOF'),
      framesReal: path.join(tempDir, 'frames', 'REAL'),
      framesSpoof: path.join(tempDir, 'frames', 'SPOOF'),
      imagesReal: path.join(tempDir, 'images', 'REAL'),
      imagesSpoof: path.join(tempDir, 'images', 'SPOOF'),
    }

    Object.values(dirs).forEach(dir => fs.mkdirSync(dir, { recursive: true }))

    const metadataRecords = [
      'id,media_type,label,original_path,dataset_path'
    ]

    for (const s of sessions) {
      const srcPath = path.join(process.cwd(), s.video_path)
      if (!fs.existsSync(srcPath)) continue

      const labelDir = s.label === 'REAL' ? 'REAL' : 'SPOOF'
      const ext = path.extname(s.video_path)
      const filename = `${s.id}${ext}`

      if (s.media_type === 'image') {
        const dest = path.join(tempDir, 'images', labelDir, filename)
        fs.copyFileSync(srcPath, dest)
        metadataRecords.push(`${s.id},image,${s.label},${s.video_path},images/${labelDir}/${filename}`)
      } else {
        const dest = path.join(tempDir, 'videos', labelDir, filename)
        fs.copyFileSync(srcPath, dest)
        metadataRecords.push(`${s.id},video,${s.label},${s.video_path},videos/${labelDir}/${filename}`)

        // Extract frames
        const frameDir = path.join(tempDir, 'frames', labelDir, s.id)
        try {
          await extractFrames(srcPath, frameDir, 2) // 2 fps
        } catch (e) {
          console.error(`Failed to extract frames for ${s.id}`, e)
        }
      }
    }

    fs.writeFileSync(path.join(tempDir, 'metadata.csv'), metadataRecords.join('\n'))

    // Create ZIP
    const output = fs.createWriteStream(outZip)
    const archive = createArchive('zip', { zlib: { level: 9 } })

    archive.on('error', (err) => {
      throw err
    })

    await new Promise((resolve, reject) => {
      output.on('close', resolve)
      archive.on('error', reject)
      archive.pipe(output)
      archive.directory(tempDir, false)
      archive.finalize()
    })

    // Cleanup temp
    fs.rmSync(tempDir, { recursive: true, force: true })

    res.json({
      message: 'Export created',
      path: `dataset-${timestamp}.zip`,
      count: sessions.length,
    })
  } catch (error: any) {
    console.error('Export error:', error)
    res.status(500).json({ error: error.message })
  }
})

export default router
