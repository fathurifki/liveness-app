import express from 'express'
import { db, queries } from '../db'

const router = express.Router()

// GET /api/stats - Get dashboard statistics
router.get('/', (req, res) => {
  try {
    const stats = queries.getStats.get()

    // Get label distribution
    const labelDistribution = db.prepare(`
      SELECT label, COUNT(*) as count
      FROM sessions
      WHERE status = 'labeled'
      GROUP BY label
    `).all()

    // Get recent activity (last 7 days)
    const sevenDaysAgo = Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60)
    const recentSessions = db.prepare(`
      SELECT DATE(created_at, 'unixepoch') as date, COUNT(*) as count
      FROM sessions
      WHERE created_at >= ?
      GROUP BY date
      ORDER BY date ASC
    `).all(sevenDaysAgo)

    // Get labeling progress by day
    const labelingProgress = db.prepare(`
      SELECT DATE(labeled_at, 'unixepoch') as date, COUNT(*) as count
      FROM sessions
      WHERE status = 'labeled' AND labeled_at >= ?
      GROUP BY date
      ORDER BY date ASC
    `).all(sevenDaysAgo)

    // Get latest builds
    const latestBuilds = db.prepare(`
      SELECT * FROM sdk_builds
      ORDER BY created_at DESC
      LIMIT 5
    `).all()

    // Get model performance comparison
    const modelStats = db.prepare(`
      SELECT id, name, version, accuracy, fpr, fnr, is_active
      FROM models
      ORDER BY created_at DESC
    `).all()

    res.json({
      overview: stats,
      labelDistribution,
      recentSessions,
      labelingProgress,
      latestBuilds,
      modelStats,
    })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

// GET /api/stats/labeling - Get labeling statistics
router.get('/labeling', (req, res) => {
  try {
    const stats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'labeled' THEN 1 ELSE 0 END) as labeled,
        SUM(CASE WHEN status = 'unlabeled' THEN 1 ELSE 0 END) as unlabeled,
        SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) as skipped,
        SUM(CASE WHEN label = 'REAL' THEN 1 ELSE 0 END) as real_count,
        SUM(CASE WHEN label = 'SPOOF' THEN 1 ELSE 0 END) as spoof_count
      FROM sessions
    `).get()

    res.json(stats)
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

export default router
