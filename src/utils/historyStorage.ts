import type { LivenessCheckResult } from '../core/types'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface KtpOcrResult {
  nik: string;
  nama: string;
  tempatLahir: string;
  tanggalLahir: string;
  alamat: string;
  rt_rw?: string;
  kelurahan_desa?: string;
  kecamatan?: string;
  agama?: string;
  jenis_kelamin?: string;
  golongan_darah?: string;
  pekerjaan?: string;
  kewarganegaraan?: string;
  status_perkawinan?: string;
  berlaku_hingga?: string;
}

export interface SessionHistoryEntry {
  id: string
  timestamp: number
  type?: 'liveness' | 'ktp'
  status: 'passed' | 'failed'
  score: number
  duration: number
  challenges: Array<{
    type: string
    instruction: string
    completed: boolean
    duration: number
  }>
  failReason?: string
  antiSpoofScore?: number
  qualityChecks: {
    brightness: boolean
    sharpness: boolean
    faceSize: boolean
  }
  screenshot?: string
  screenshots?: Array<{
    challengeType: string
    timestamp: string
    image: string
  }>
  isSynced?: boolean
  ktpData?: KtpOcrResult
}

const STORAGE_KEY = 'liveness_history'
const MAX_HISTORY_ENTRIES = 50

// ── Storage Functions ─────────────────────────────────────────────────────────

export function saveSessionToHistory(
  result: LivenessCheckResult,
  screenshot: string | null,
  isSynced = false,
  screenshots?: Array<{ challengeType: string, timestamp: string, image: string }>
): void {
  try {
    const history = loadHistory()

    const entry: SessionHistoryEntry = {
      id: result.sessionId,
      timestamp: result.timestamp,
      status: result.status,
      score: result.score,
      duration: (result.challengesPassed || []).reduce((sum, ch) => sum + ch.duration, 0) / 1000,
      challenges: (result.challengesPassed || []).map(ch => ({
        type: ch.type,
        instruction: ch.type, // simplified
        completed: ch.passed,
        duration: ch.duration / 1000
      })),
      failReason: result.failReason,
      antiSpoofScore: result.antiSpoof.score,
      qualityChecks: {
        brightness: result.quality.brightness > 0,
        sharpness: result.quality.blurScore > 0,
        faceSize: result.quality.faceSize > 0
      },
      screenshot: screenshot || undefined,
      screenshots,
      isSynced
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

export function saveKtpToHistory(
  imageUrl: string,
  ocrData: KtpOcrResult,
  status: 'passed' | 'failed' = 'passed',
  failReason?: string
): void {
  try {
    const history = loadHistory()

    const entry: SessionHistoryEntry = {
      id: `ktp-${Date.now()}`,
      timestamp: Date.now(),
      type: 'ktp',
      status: status,
      score: status === 'passed' ? 1.0 : 0.0,
      duration: 0,
      challenges: [],
      failReason: failReason,
      qualityChecks: {
        brightness: true,
        sharpness: true,
        faceSize: true
      },
      screenshot: imageUrl,
      ktpData: ocrData,
      isSynced: false
    }

    // Add to beginning (newest first)
    history.unshift(entry)

    // Limit to MAX_HISTORY_ENTRIES
    if (history.length > MAX_HISTORY_ENTRIES) {
      history.splice(MAX_HISTORY_ENTRIES)
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(history))
  } catch (error) {
    console.error('Failed to save KTP to history:', error)
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

export function markAsSynced(sessionId: string): void {
  try {
    const history = loadHistory()
    const entry = history.find(e => e.id === sessionId)
    if (entry) {
      entry.isSynced = true
      localStorage.setItem(STORAGE_KEY, JSON.stringify(history))
    }
  } catch (error) {
    console.error('Failed to mark as synced:', error)
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

  const passed = history.filter(e => e.status === 'passed').length
  const failed = history.length - passed
  const totalScore = history.reduce((sum, e) => sum + e.score, 0)

  return {
    total: history.length,
    passed,
    failed,
    passRate: (passed / history.length) * 100,
    avgScore: totalScore / history.length,
  }
}
