import express from 'express'
import { queries } from '../db'
import { nanoid } from 'nanoid'

const router = express.Router()

// GET /api/configs - Get all configurations
router.get('/', (req, res) => {
  try {
    const configs = queries.getAllConfigs.all()
    res.json({ configs })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

// GET /api/configs/:id - Get config by ID
router.get('/:id', (req, res) => {
  try {
    const config = queries.getConfigById.get(req.params.id)
    if (!config) {
      return res.status(404).json({ error: 'Configuration not found' })
    }

    // Parse JSON config
    const parsed = {
      ...config,
      config: JSON.parse((config as any).config)
    }

    res.json(parsed)
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

// POST /api/configs - Create new configuration
router.post('/', (req, res) => {
  try {
    const { name, presetType, config, modelId } = req.body

    if (!name || !config) {
      return res.status(400).json({ error: 'Name and config are required' })
    }

    const id = nanoid()
    const configJson = typeof config === 'string' ? config : JSON.stringify(config)

    queries.insertConfig.run(
      id,
      name,
      presetType || 'custom',
      configJson,
      modelId || null
    )

    const newConfig = queries.getConfigById.get(id)

    res.status(201).json({
      message: 'Configuration created',
      config: {
        ...newConfig,
        config: JSON.parse((newConfig as any).config)
      },
    })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

// PUT /api/configs/:id - Update configuration
router.put('/:id', (req, res) => {
  try {
    const config = queries.getConfigById.get(req.params.id)
    if (!config) {
      return res.status(404).json({ error: 'Configuration not found' })
    }

    const { name, presetType, config: newConfig, modelId } = req.body

    const configJson = newConfig
      ? (typeof newConfig === 'string' ? newConfig : JSON.stringify(newConfig))
      : (config as any).config

    queries.db.prepare(`
      UPDATE configurations
      SET name = COALESCE(?, name),
          preset_type = COALESCE(?, preset_type),
          config = COALESCE(?, config),
          model_id = COALESCE(?, model_id)
      WHERE id = ?
    `).run(
      name || null,
      presetType || null,
      configJson,
      modelId || null,
      req.params.id
    )

    const updatedConfig = queries.getConfigById.get(req.params.id)

    res.json({
      message: 'Configuration updated',
      config: {
        ...updatedConfig,
        config: JSON.parse((updatedConfig as any).config)
      },
    })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

// DELETE /api/configs/:id - Delete configuration
router.delete('/:id', (req, res) => {
  try {
    const config = queries.getConfigById.get(req.params.id)
    if (!config) {
      return res.status(404).json({ error: 'Configuration not found' })
    }

    queries.db.prepare('DELETE FROM configurations WHERE id = ?').run(req.params.id)

    res.json({ message: 'Configuration deleted' })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

// GET /api/configs/presets/list - Get preset configurations
router.get('/presets/list', (req, res) => {
  try {
    const presets = {
      strict: {
        name: 'Strict',
        presetType: 'strict',
        config: {
          antiSpoofThreshold: 0.85,
          minBrightness: 50,
          maxBrightness: 210,
          minBlurScore: 90,
          minFaceSize: 0.18,
          maxFaceSize: 0.75,
          passScore: 85,
          challengeCount: 3,
          challengeTimeoutMs: 8000,
        }
      },
      balanced: {
        name: 'Balanced',
        presetType: 'balanced',
        config: {
          antiSpoofThreshold: 0.70,
          minBrightness: 40,
          maxBrightness: 220,
          minBlurScore: 80,
          minFaceSize: 0.15,
          maxFaceSize: 0.80,
          passScore: 70,
          challengeCount: 2,
          challengeTimeoutMs: 8000,
        }
      },
      lenient: {
        name: 'Lenient',
        presetType: 'lenient',
        config: {
          antiSpoofThreshold: 0.55,
          minBrightness: 30,
          maxBrightness: 230,
          minBlurScore: 70,
          minFaceSize: 0.12,
          maxFaceSize: 0.85,
          passScore: 60,
          challengeCount: 1,
          challengeTimeoutMs: 10000,
        }
      }
    }

    res.json({ presets })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

export default router
