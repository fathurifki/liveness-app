import type { LivenessCheckResult, DebugMetrics } from '../core/types'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SessionHistoryEntry {
  id: string  // sessionId dari LivenessCheckResult
  timestamp: number
  result: LivenessCheckResult
  screenshot: string | null
  debugMetrics: DebugMetrics | null
}

const STORAGE_KEY = 'liveness-history'
const MAX_HISTORY_ENTRIES = 100  // Limit untuk prevent localStorage overflow

// ── Storage Functions ─────────────────────────────────────────────────────────

export function saveSessionToHistory(
  result: LivenessCheckResult,
  screenshot: string | null,
  debugMetrics: DebugMetrics | null
): void {
  try {
    const history = loadHistory()

    const entry: SessionHistoryEntry = {
      id: result.sessionId,
      timestamp: result.timestamp,
      result,
      screenshot,
      debugMetrics,
    }

    // Add to beginning (newest first)
    history.unshift(entry)

    // Limit to MAX_HISTORY_ENTRIES
    if (history.length > MAX_HISTORY_ENTRIES) {
      history.splice(MAX_HISTORY_ENTRIES)
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(history))
  } catch (error) {
    console.error('Failed to save session to history:', error)
  }
}

export function loadHistory(): SessionHistoryEntry[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    if (!data) return []
    return JSON.parse(data) as SessionHistoryEntry[]
  } catch (error) {
    console.error('Failed to load history:', error)
    return []
  }
}

export function deleteSession(sessionId: string): void {
  try {
    const history = loadHistory()
    const filtered = history.filter(entry => entry.id !== sessionId)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered))
  } catch (error) {
    console.error('Failed to delete session:', error)
  }
}

export function clearHistory(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch (error) {
    console.error('Failed to clear history:', error)
  }
}

export function getSessionById(sessionId: string): SessionHistoryEntry | null {
  const history = loadHistory()
  return history.find(entry => entry.id === sessionId) || null
}

// ── Statistics ────────────────────────────────────────────────────────────────

export interface HistoryStats {
  total: number
  passed: number
  failed: number
  passRate: number
  avgScore: number
}

export function getHistoryStats(): HistoryStats {
  const history = loadHistory()

  if (history.length === 0) {
    return {
      total: 0,
      passed: 0,
      failed: 0,
      passRate: 0,
      avgScore: 0,
    }
  }

  const passed = history.filter(e => e.result.status === 'passed').length
  const failed = history.length - passed
  const totalScore = history.reduce((sum, e) => sum + e.result.score, 0)

  return {
    total: history.length,
    passed,
    failed,
    passRate: (passed / history.length) * 100,
    avgScore: totalScore / history.length,
  }
}
