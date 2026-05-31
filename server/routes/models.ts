import express from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { db, queries } from '../db'
import { nanoid } from 'nanoid'

const router = express.Router()

// Local models path (public/models)
const LOCAL_MODELS_DIR = path.join(process.cwd(), 'public', 'models')

// Friendly name mapping for known model files
const MODEL_NAME_MAP: Record<string, { name: string; description: string }> = {
  'MiniFASNet.onnx':       { name: 'MiniFASNet Anti-Spoof',   description: 'Face anti-spoofing detection' },
  'liveness_model.onnx':   { name: 'Liveness Model',          description: 'General liveness detection' },
  'head_pose_model.onnx':  { name: 'Head Pose Estimator',     description: 'Pitch / yaw / roll estimation' },
  'eye_state.onnx':        { name: 'Eye State Detector',      description: 'Blink / eye-open detection' },
  'eye_state_merged.onnx': { name: 'Eye State (Merged)',      description: 'Merged eye-state model' },
  'smile_detect.onnx':     { name: 'Smile Detector',          description: 'Smile detection' },
  'smile_detect_merged.onnx': { name: 'Smile Detector (Merged)', description: 'Merged smile model' },
}

// Configure multer for model uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(process.cwd(), 'data', 'models')
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    cb(null, dir)
  },
  filename: (req, file, cb) => {
    const id = nanoid(10)
    const ext = path.extname(file.originalname)
    cb(null, `model-${id}${ext}`)
  }
})

const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.onnx', '.tflite', '.pb']
    const ext = path.extname(file.originalname).toLowerCase()
    if (allowedTypes.includes(ext)) {
      cb(null, true)
    } else {
      cb(new Error('Invalid file type. Only model files (.onnx, .tflite, .pb) allowed.'))
    }
  }
})

// GET /api/models - Get all models
router.get('/', (req, res) => {
  try {
    const models = queries.getAllModels.all()
    res.json({ models })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

// GET /api/models/:id - Get model by ID
router.get('/:id', (req, res) => {
  try {
    const model = queries.getModelById.get(req.params.id)
    if (!model) {
      return res.status(404).json({ error: 'Model not found' })
    }
    res.json(model)
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

// GET /api/models/active - Get active model
router.get('/active/current', (req, res) => {
  try {
    const model = queries.getActiveModel.get()
    if (!model) {
      return res.status(404).json({ error: 'No active model set' })
    }
    res.json(model)
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

// GET /api/models/local/scan - Scan and list local models from public/models
router.get('/local/scan', (req, res) => {
  try {
    if (!fs.existsSync(LOCAL_MODELS_DIR)) {
      return res.json({ localModels: [] })
    }

    const files = fs.readdirSync(LOCAL_MODELS_DIR)
    const onnxFiles = files.filter(f => f.endsWith('.onnx') && !f.includes('.stub') && !f.includes('.bak'))

    const localModels = onnxFiles.map(filename => {
      const filePath = path.join(LOCAL_MODELS_DIR, filename)
      const stats = fs.statSync(filePath)
      const modelInfo = MODEL_NAME_MAP[filename] || {
        name: filename.replace('.onnx', ''),
        description: 'ONNX model'
      }

      return {
        filename,
        name: modelInfo.name,
        description: modelInfo.description,
        size: stats.size,
        path: `/models/${filename}`,
      }
    })

    res.json({ localModels })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

// POST /api/models/local/register - Register a local model to database
router.post('/local/register', (req, res) => {
  try {
    const { filename, name, version } = req.body

    if (!filename || !name || !version) {
      return res.status(400).json({ error: 'Filename, name, and version are required' })
    }

    const localPath = path.join(LOCAL_MODELS_DIR, filename)
    if (!fs.existsSync(localPath)) {
      return res.status(404).json({ error: 'Model file not found in public/models' })
    }

    const id = nanoid()
    const relativePath = `/models/${filename}`

    queries.insertModel.run(
      id,
      name,
      version,
      relativePath,
      null, // accuracy
      null, // fpr
      null  // fnr
    )

    const model = queries.getModelById.get(id)

    res.status(201).json({
      message: 'Local model registered',
      model,
    })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})


// POST /api/models - Upload new model
router.post('/', upload.single('model'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No model file uploaded' })
    }

    const { name, version, accuracy, fpr, fnr } = req.body

    if (!name || !version) {
      return res.status(400).json({ error: 'Name and version are required' })
    }

    const id = nanoid()
    const filePath = req.file.path.replace(process.cwd(), '')

    queries.insertModel.run(
      id,
      name,
      version,
      filePath,
      accuracy ? parseFloat(accuracy) : null,
      fpr ? parseFloat(fpr) : null,
      fnr ? parseFloat(fnr) : null
    )

    const model = queries.getModelById.get(id)

    res.status(201).json({
      message: 'Model uploaded',
      model,
    })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

// PUT /api/models/:id/activate - Set model as active
router.put('/:id/activate', (req, res) => {
  try {
    const model = queries.getModelById.get(req.params.id)
    if (!model) {
      return res.status(404).json({ error: 'Model not found' })
    }

    queries.setActiveModel.run(req.params.id)

    res.json({
      message: 'Model activated',
      model: queries.getModelById.get(req.params.id),
    })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

// PUT /api/models/:id - Update model metadata
router.put('/:id', (req, res) => {
  try {
    const model = queries.getModelById.get(req.params.id)
    if (!model) {
      return res.status(404).json({ error: 'Model not found' })
    }

    const { name, version, accuracy, fpr, fnr } = req.body

    db.prepare(`
      UPDATE models
      SET name = COALESCE(?, name),
          version = COALESCE(?, version),
          accuracy = COALESCE(?, accuracy),
          fpr = COALESCE(?, fpr),
          fnr = COALESCE(?, fnr)
      WHERE id = ?
    `).run(
      name || null,
      version || null,
      accuracy ? parseFloat(accuracy) : null,
      fpr ? parseFloat(fpr) : null,
      fnr ? parseFloat(fnr) : null,
      req.params.id
    )

    const updatedModel = queries.getModelById.get(req.params.id)

    res.json({
      message: 'Model updated',
      model: updatedModel,
    })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

// DELETE /api/models/:id - Delete model
router.delete('/:id', (req, res) => {
  try {
    const model: any = queries.getModelById.get(req.params.id)
    if (!model) {
      return res.status(404).json({ error: 'Model not found' })
    }

    // Don't allow deleting active model
    if (model.is_active) {
      return res.status(400).json({ error: 'Cannot delete active model' })
    }

    // Delete model file
    const modelPath = path.join(process.cwd(), model.file_path)
    if (fs.existsSync(modelPath)) {
      fs.unlinkSync(modelPath)
    }

    // Delete from database
    db.prepare('DELETE FROM models WHERE id = ?').run(req.params.id)

    res.json({ message: 'Model deleted' })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

export default router
