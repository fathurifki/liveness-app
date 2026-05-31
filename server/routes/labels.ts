import express from 'express'
import { queries } from '../db'

const router = express.Router()

// POST /api/labels/:sessionId - Label a session
router.post('/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params
    const { label, labeledBy = 'user' } = req.body

    if (!label || !['REAL', 'SPOOF'].includes(label)) {
      return res.status(400).json({ error: 'Invalid label. Must be REAL or SPOOF' })
    }

    const session = queries.getSessionById.get(sessionId)
    if (!session) {
      return res.status(404).json({ error: 'Session not found' })
    }

    queries.updateSessionLabel.run(label, labeledBy, sessionId)

    const updatedSession = queries.getSessionById.get(sessionId)

    res.json({
      message: 'Session labeled',
      session: updatedSession,
    })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

// POST /api/labels/:sessionId/skip - Skip a session
router.post('/:sessionId/skip', (req, res) => {
  try {
    const { sessionId } = req.params

    const session = queries.getSessionById.get(sessionId)
    if (!session) {
      return res.status(404).json({ error: 'Session not found' })
    }

    queries.db.prepare(`
      UPDATE sessions
      SET status = 'skipped'
      WHERE id = ?
    `).run(sessionId)

    const updatedSession = queries.getSessionById.get(sessionId)

    res.json({
      message: 'Session skipped',
      session: updatedSession,
    })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

export default router
