import { useEffect, useRef, useState } from 'react'
import type { DebugLogLevel, DebugMetrics } from '../core/types'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DebugLogEntry {
  ts: number
  message: string
  level: DebugLogLevel
}

interface DebugOverlayProps {
  metrics: DebugMetrics | null
  enabled: boolean
  /** Dipasang dari parent agar useLiveness bisa menulis ke tab Log */
  onRegisterLogSink?: (sink: (message: string, level?: DebugLogLevel) => void) => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number, decimals = 3) {
  return n.toFixed(decimals)
}

function PassBadge({ pass }: { pass: boolean }) {
  return (
    <span className={`text-[10px] font-bold px-1 rounded ${pass ? 'bg-green-500/30 text-green-300' : 'bg-red-500/30 text-red-300'}`}>
      {pass ? 'PASS' : 'FAIL'}
    </span>
  )
}

function Row({ label, value, badge }: { label: string; value: string; badge?: boolean | null }) {
  return (
    <div className="flex items-center justify-between gap-2 py-[2px]">
      <span className="text-gray-400 text-[11px] shrink-0">{label}</span>
      <div className="flex items-center gap-1.5">
        <span className="text-white text-[11px] font-mono">{value}</span>
        {badge !== undefined && badge !== null && <PassBadge pass={badge} />}
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-2">
      <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1 border-b border-gray-700 pb-0.5">
        {title}
      </div>
      {children}
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function DebugOverlay({ metrics, enabled, onRegisterLogSink }: DebugOverlayProps) {
  const [logs, setLogs] = useState<DebugLogEntry[]>([])
  const [activeTab, setActiveTab] = useState<'metrics' | 'log'>('metrics')
  const [minimized, setMinimized] = useState(false)
  const [pos, setPos] = useState({ x: 8, y: 8 })
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const logEndRef = useRef<HTMLDivElement>(null)
  const prevMetrics = useRef<DebugMetrics | null>(null)
  const dragState = useRef<{ active: boolean; startX: number; startY: number; panelX: number; panelY: number } | null>(null)

  useEffect(() => {
    if (!onRegisterLogSink) return
    onRegisterLogSink((message, level = 'info') => {
      setLogs((prev) => [...prev.slice(-199), { ts: Date.now(), message, level }])
    })
  }, [onRegisterLogSink])

  // ── Drag ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const move = (cx: number, cy: number) => {
      const d = dragState.current
      if (!d?.active) return
      const pw = panelRef.current?.offsetWidth ?? 280
      const ph = panelRef.current?.offsetHeight ?? 400
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - pw, d.panelX + cx - d.startX)),
        y: Math.max(0, Math.min(window.innerHeight - ph, d.panelY + cy - d.startY)),
      })
    }
    const onMM = (e: MouseEvent) => move(e.clientX, e.clientY)
    const onTM = (e: TouchEvent) => move(e.touches[0].clientX, e.touches[0].clientY)
    const onEnd = () => { if (dragState.current) dragState.current.active = false }
    window.addEventListener('mousemove', onMM)
    window.addEventListener('mouseup', onEnd)
    window.addEventListener('touchmove', onTM, { passive: true })
    window.addEventListener('touchend', onEnd)
    return () => {
      window.removeEventListener('mousemove', onMM)
      window.removeEventListener('mouseup', onEnd)
      window.removeEventListener('touchmove', onTM)
      window.removeEventListener('touchend', onEnd)
    }
  }, [])

  const onDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    const cx = 'touches' in e ? e.touches[0].clientX : e.clientX
    const cy = 'touches' in e ? e.touches[0].clientY : e.clientY
    dragState.current = { active: true, startX: cx, startY: cy, panelX: pos.x, panelY: pos.y }
  }

  // ── Copy to Clipboard ─────────────────────────────────────────────────────────
  const copyToClipboard = async (data: unknown, label: string) => {
    try {
      const json = JSON.stringify(data, null, 2)
      await navigator.clipboard.writeText(json)
      setCopyFeedback(`✓ ${label} copied!`)
      setTimeout(() => setCopyFeedback(null), 2000)
    } catch (error) {
      setCopyFeedback(`✗ Copy failed`)
      setTimeout(() => setCopyFeedback(null), 2000)
    }
  }

  const handleCopyMetrics = () => {
    if (!metrics) return
    copyToClipboard(metrics, 'Metrics')
  }

  const handleCopyLogs = () => {
    if (logs.length === 0) return
    const logsWithTimestamp = logs.map(log => ({
      timestamp: new Date(log.ts).toISOString(),
      timestampMs: log.ts,
      level: log.level,
      message: log.message,
    }))
    copyToClipboard(logsWithTimestamp, 'Logs')
  }

  const handleCopyAll = () => {
    const allData = {
      exportedAt: new Date().toISOString(),
      metrics: metrics || null,
      logs: logs.map(log => ({
        timestamp: new Date(log.ts).toISOString(),
        timestampMs: log.ts,
        level: log.level,
        message: log.message,
      })),
      summary: {
        totalFrames: metrics?.frameCount ?? 0,
        fps: metrics?.fps ?? 0,
        totalLogs: logs.length,
      },
    }
    copyToClipboard(allData, 'All data')
  }

  // ── Auto-log on notable events ───────────────────────────────────────────────
  useEffect(() => {
    if (!metrics || !enabled) return
    const prev = prevMetrics.current
    const entries: DebugLogEntry[] = []
    const ts = Date.now()

    // Smile state change
    if (prev && prev.smileHeuristicPass !== metrics.smileHeuristicPass) {
      entries.push({
        ts, level: metrics.smileHeuristicPass ? 'pass' : 'fail',
        message: metrics.smileHeuristicPass
          ? `😊 Senyum terdeteksi (lift L:${fmt(metrics.smileLeftLift)} R:${fmt(metrics.smileRightLift)})`
          : `😐 Senyum hilang (lift L:${fmt(metrics.smileLeftLift)} R:${fmt(metrics.smileRightLift)})`,
      })
    }

    // ONNX smile prob update
    if (prev && metrics.smileOnnxProb !== null && prev.smileOnnxProb !== metrics.smileOnnxProb) {
      entries.push({
        ts, level: metrics.smileOnnxPass ? 'pass' : 'info',
        message: `🤖 ONNX smile prob: ${fmt(metrics.smileOnnxProb ?? 0)} → ${metrics.smileOnnxPass ? 'PASS' : 'FAIL'}`,
      })
    }

    // Challenge change
    if (prev && prev.challengeType !== metrics.challengeType && metrics.challengeType) {
      entries.push({
        ts, level: 'info',
        message: `🎯 Challenge: ${metrics.challengeType}`,
      })
    }

    // Challenge passed
    if (prev && !prev.challengePassed && metrics.challengePassed) {
      entries.push({
        ts, level: 'pass',
        message: `✅ Challenge "${metrics.challengeType}" PASSED`,
      })
    }

    // Quality warning
    if (prev && prev.qualityPassed && !metrics.qualityPassed) {
      entries.push({
        ts, level: 'warn',
        message: `⚠️ Quality check FAILED (brightness:${fmt(metrics.brightness, 0)} blur:${fmt(metrics.blurScore, 0)} face:${fmt(metrics.faceSize, 2)})`,
      })
    }

    if (entries.length > 0) {
      setLogs(prev => [...prev.slice(-199), ...entries])
    }

    prevMetrics.current = metrics
  }, [metrics, enabled])

  // Auto-scroll log
  useEffect(() => {
    if (activeTab === 'log') {
      logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs, activeTab])

  if (!enabled) return null

  const m = metrics

  const formatTs = (ts: number) => {
    const d = new Date(ts)
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}.${String(d.getMilliseconds()).padStart(3,'0')}`
  }

  const logColor = (level: DebugLogLevel) => {
    if (level === 'pass') return 'text-green-400'
    if (level === 'fail') return 'text-red-400'
    if (level === 'warn') return 'text-yellow-400'
    return 'text-gray-300'
  }

  return (
    <div
      ref={panelRef}
      className="fixed z-[9999] w-72 select-none"
      style={{ left: pos.x, top: pos.y, touchAction: 'none' }}
    >
      <div className="bg-gray-950/95 border border-gray-700 rounded-xl shadow-2xl overflow-hidden backdrop-blur-sm">

        {/* Header / Drag handle */}
        <div
          className="flex items-center justify-between px-3 py-2 bg-gray-900 cursor-grab active:cursor-grabbing border-b border-gray-700"
          onMouseDown={onDragStart}
          onTouchStart={onDragStart}
        >
          <div className="flex items-center gap-2">
            <span className="text-base">🐛</span>
            <span className="text-white font-bold text-xs">Debug Logger</span>
            {m && (
              <span className="text-[10px] text-gray-400 font-mono">
                {m.fps} fps · #{m.frameCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {/* Copy feedback */}
            {copyFeedback && (
              <span className="text-[10px] text-green-400 mr-1 animate-pulse">
                {copyFeedback}
              </span>
            )}
            <button
              onClick={() => setLogs([])}
              title="Clear logs"
              className="text-gray-500 hover:text-gray-300 text-[10px] px-1.5 py-0.5 rounded hover:bg-gray-700 transition-colors"
            >
              CLR
            </button>
            <button
              onClick={() => setMinimized(v => !v)}
              className="text-gray-500 hover:text-white w-6 h-6 flex items-center justify-center rounded hover:bg-gray-700 transition-colors text-sm"
            >
              {minimized ? '▲' : '▼'}
            </button>
          </div>
        </div>

        {!minimized && (
          <>
            {/* Tabs */}
            <div className="flex border-b border-gray-700">
              {(['metrics', 'log'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 py-1.5 text-[11px] font-semibold transition-colors ${
                    activeTab === tab
                      ? 'text-blue-400 bg-blue-500/10 border-b-2 border-blue-400'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {tab === 'metrics' ? '📊 Metrics' : `📋 Log ${logs.length > 0 ? `(${logs.length})` : ''}`}
                </button>
              ))}
            </div>

            {/* Copy Actions Bar */}
            <div className="flex items-center justify-between px-3 py-1.5 bg-gray-900/50 border-b border-gray-700">
              <span className="text-[10px] text-gray-500 uppercase tracking-wider">
                Copy to Clipboard
              </span>
              <div className="flex gap-1">
                {activeTab === 'metrics' && (
                  <button
                    onClick={handleCopyMetrics}
                    disabled={!metrics}
                    className="text-[10px] px-2 py-1 rounded bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    📊 Metrics
                  </button>
                )}
                {activeTab === 'log' && (
                  <button
                    onClick={handleCopyLogs}
                    disabled={logs.length === 0}
                    className="text-[10px] px-2 py-1 rounded bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    📋 Logs
                  </button>
                )}
                <button
                  onClick={handleCopyAll}
                  disabled={!metrics && logs.length === 0}
                  className="text-[10px] px-2 py-1 rounded bg-green-600/20 text-green-400 hover:bg-green-600/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  📦 All
                </button>
              </div>
            </div>

            {/* Metrics Tab */}
            {activeTab === 'metrics' && (
              <div className="px-3 py-2 max-h-[70vh] overflow-y-auto">
                {!m ? (
                  <p className="text-gray-500 text-xs text-center py-4">Menunggu data wajah...</p>
                ) : (
                  <>
                    <Section title="Quality">
                      <Row label="Brightness" value={fmt(m.brightness, 0)} />
                      <Row label="Blur Score" value={fmt(m.blurScore, 0)} />
                      <Row label="Face Size" value={fmt(m.faceSize, 3)} badge={m.qualityPassed} />
                    </Section>

                    <Section title="Eye Aspect Ratio (EAR)">
                      <Row label="Left EAR" value={fmt(m.earLeft)} />
                      <Row label="Right EAR" value={fmt(m.earRight)} />
                      <Row
                        label="Avg EAR"
                        value={fmt(m.earAvg)}
                        badge={m.earAvg > 0.18}
                      />
                    </Section>

                    <Section title="Smile Heuristic">
                      <Row label="MAR" value={fmt(m.mar)} />
                      <Row label="Mouth MidY" value={fmt(m.smileMidY)} />
                      <Row label="Left Lift" value={fmt(m.smileLeftLift)} badge={m.smileLeftLift > 0.018} />
                      <Row label="Right Lift" value={fmt(m.smileRightLift)} badge={m.smileRightLift > 0.018} />
                      <Row label="Smile Pass" value={m.smileHeuristicPass ? 'YES' : 'NO'} badge={m.smileHeuristicPass} />
                    </Section>

                    <Section title="Smile ONNX">
                      <Row
                        label="Prob"
                        value={m.smileOnnxProb !== null ? fmt(m.smileOnnxProb) : 'N/A (no model)'}
                        badge={m.smileOnnxProb !== null ? m.smileOnnxPass : null}
                      />
                      <Row label="Threshold" value="0.38" />
                    </Section>

                    <Section title="Head Pose (raw)">
                      <Row label="Yaw (LM)" value={fmt(m.yaw, 1)} />
                      <Row label="Pitch (LM)" value={fmt(m.pitch, 1)} />
                      <Row
                        label="Yaw ONNX"
                        value={m.headPoseYawOnnx !== null ? fmt(m.headPoseYawOnnx, 3) : 'N/A'}
                      />
                      <Row
                        label="Pitch ONNX"
                        value={m.headPosePitchOnnx !== null ? fmt(m.headPosePitchOnnx, 3) : 'N/A'}
                      />
                      <Row
                        label="Roll ONNX"
                        value={m.headPoseRollOnnx !== null ? fmt(m.headPoseRollOnnx, 3) : 'N/A'}
                      />
                    </Section>

                    <Section title="Nod (atas / bawah)">
                      <Row
                        label="Arah"
                        value={
                          m.challengeType === 'nod_top'
                            ? 'atas'
                            : m.challengeType === 'nod_bottom'
                              ? 'bawah'
                              : '—'
                        }
                      />
                      <Row
                        label="Δpitch LM"
                        value={m.nodDeltaLm !== null ? fmt(m.nodDeltaLm, 2) : 'calibrating…'}
                      />
                      <Row
                        label="Δpitch ONNX"
                        value={m.nodDeltaOnnx !== null ? fmt(m.nodDeltaOnnx, 3) : 'N/A'}
                      />
                      <Row
                        label="Thresh LM"
                        value={m.challengeType === 'nod_top' ? '≤−8' : m.challengeType === 'nod_bottom' ? '≥+8' : '—'}
                      />
                      <Row
                        label="Lulus"
                        value={
                          m.challengeType === 'nod_top' || m.challengeType === 'nod_bottom'
                            ? m.nodPass
                              ? 'YA'
                              : 'TIDAK'
                            : '—'
                        }
                        badge={
                          m.challengeType === 'nod_top' || m.challengeType === 'nod_bottom'
                            ? m.nodPass
                            : null
                        }
                      />
                    </Section>

                    <Section title="Yaw (kiri / kanan)">
                      <Row
                        label="Arah"
                        value={
                          m.challengeType === 'yaw_left'
                            ? 'kiri'
                            : m.challengeType === 'yaw_right'
                              ? 'kanan'
                              : '—'
                        }
                      />
                      <Row
                        label="Δyaw LM"
                        value={m.yawDeltaLm !== null ? fmt(m.yawDeltaLm, 2) : 'calibrating…'}
                      />
                      <Row
                        label="Δyaw ONNX"
                        value={m.yawDeltaOnnx !== null ? fmt(m.yawDeltaOnnx, 3) : 'N/A'}
                      />
                      <Row
                        label="Thresh LM"
                        value={m.challengeType === 'yaw_left' ? '≤−10' : m.challengeType === 'yaw_right' ? '≥+10' : '—'}
                      />
                      <Row
                        label="Lulus"
                        value={
                          m.challengeType === 'yaw_left' || m.challengeType === 'yaw_right'
                            ? m.yawPass
                              ? 'YA'
                              : 'TIDAK'
                            : '—'
                        }
                        badge={
                          m.challengeType === 'yaw_left' || m.challengeType === 'yaw_right'
                            ? m.yawPass
                            : null
                        }
                      />
                    </Section>

                    <Section title="Anti-Spoof">
                      <Row label="Score" value={m.antiSpoofScore !== null ? fmt(m.antiSpoofScore) : 'N/A'} />
                      <Row label="Method" value={m.antiSpoofMethod} />
                    </Section>

                    <Section title="Challenge">
                      <Row label="Type" value={m.challengeType ?? 'none'} />
                      <Row label="Passed" value={m.challengePassed ? 'YES' : 'NO'} badge={m.challengePassed} />
                    </Section>
                  </>
                )}
              </div>
            )}

            {/* Log Tab */}
            {activeTab === 'log' && (
              <div className="max-h-[70vh] overflow-y-auto px-2 py-2 space-y-0.5">
                {logs.length === 0 ? (
                  <p className="text-gray-500 text-xs text-center py-4">Belum ada event tercatat</p>
                ) : (
                  logs.map((entry, i) => (
                    <div key={i} className="flex gap-1.5 text-[10px] font-mono leading-relaxed">
                      <span className="text-gray-600 shrink-0">{formatTs(entry.ts)}</span>
                      <span className={logColor(entry.level)}>{entry.message}</span>
                    </div>
                  ))
                )}
                <div ref={logEndRef} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
