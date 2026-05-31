import express from 'express'
import { queries } from '../db'
import { nanoid } from 'nanoid'

const router = express.Router()

// GET /api/builds - Get all builds
router.get('/', (req, res) => {
  try {
    const builds = queries.getAllBuilds.all()
    res.json({ builds })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

// GET /api/builds/:id - Get build by ID
router.get('/:id', (req, res) => {
  try {
    const build = queries.getBuildById.get(req.params.id)
    if (!build) {
      return res.status(404).json({ error: 'Build not found' })
    }
    res.json(build)
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

// POST /api/builds - Create new build
router.post('/', async (req, res) => {
  try {
    const { version, modelId, configId } = req.body

    if (!version || !modelId || !configId) {
      return res.status(400).json({ error: 'Version, modelId, and configId are required' })
    }

    // Verify model and config exist
    const model = queries.getModelById.get(modelId)
    const config = queries.getConfigById.get(configId)

    if (!model) {
      return res.status(404).json({ error: 'Model not found' })
    }

    if (!config) {
      return res.status(404).json({ error: 'Configuration not found' })
    }

    const id = nanoid()
    const outputPath = `/data/builds/liveness-sdk-v${version}`

    queries.insertBuild.run(
      id,
      version,
      modelId,
      configId,
      outputPath
    )

    const build = queries.getBuildById.get(id)

    res.status(201).json({
      message: 'Build created',
      build,
    })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

// DELETE /api/builds/:id - Delete build
router.delete('/:id', (req, res) => {
  try {
    const build = queries.getBuildById.get(req.params.id)
    if (!build) {
      return res.status(404).json({ error: 'Build not found' })
    }

    queries.db.prepare('DELETE FROM sdk_builds WHERE id = ?').run(req.params.id)

    res.json({ message: 'Build deleted' })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

export default router
