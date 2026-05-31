import { useState, useEffect, useRef } from 'react'
import { MdBugReport, MdClear, MdDownload, MdPause, MdPlayArrow } from 'react-icons/md'

interface LogEntry {
  id: number
  timestamp: string
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
}

export default function DebugLogger() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [isPaused, setIsPaused] = useState(false)
  const [filter, setFilter] = useState<'all' | 'info' | 'warn' | 'error' | 'debug'>('all')
  const [autoScroll, setAutoScroll] = useState(false)
  const logsEndRef = useRef<HTMLDivElement>(null)
  const logIdCounter = useRef(0)

  // Simulate log entries for demo
  useEffect(() => {
    if (isPaused) return

    const interval = setInterval(() => {
      const levels: Array<'info' | 'warn' | 'error' | 'debug'> = ['info', 'warn', 'error', 'debug']
      const messages = [
        'Face detection initialized',
        'MediaPipe model loaded successfully',
        'Challenge started: blink',
        'Anti-spoof check passed',
        'Quality check: brightness OK',
        'Warning: Face too close to camera',
        'Error: Failed to detect landmarks',
        'Debug: FPS = 30',
        'Challenge completed in 2.3s',
        'Verification result: PASSED',
      ]

      const newLog: LogEntry = {
        id: logIdCounter.current++,
        timestamp: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 }),
        level: levels[Math.floor(Math.random() * levels.length)],
        message: messages[Math.floor(Math.random() * messages.length)],
      }

      setLogs(prev => [...prev.slice(-99), newLog]) // Keep last 100 logs
    }, 2000)

    return () => clearInterval(interval)
  }, [isPaused])

  // Auto scroll to bottom
  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs, autoScroll])

  const handleClear = () => {
    setLogs([])
    logIdCounter.current = 0
  }

  const handleDownload = () => {
    const content = logs.map(log => `[${log.timestamp}] [${log.level.toUpperCase()}] ${log.message}`).join('\n')
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `debug-log-${Date.now()}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const filteredLogs = filter === 'all' ? logs : logs.filter(log => log.level === filter)

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'info': return 'text-primary'
      case 'warn': return 'text-accent-yellow'
      case 'error': return 'text-semantic-down'
      case 'debug': return 'text-muted'
      default: return 'text-ink'
    }
  }

  const getLevelBg = (level: string) => {
    switch (level) {
      case 'info': return 'bg-primary/10'
      case 'warn': return 'bg-accent-yellow/10'
      case 'error': return 'bg-semantic-down/10'
      case 'debug': return 'bg-surface-soft'
      default: return 'bg-surface-soft'
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-canvas via-surface-soft/30 to-canvas">
      <div className="max-w-7xl mx-auto px-8 py-12">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 bg-accent-yellow rounded-xl flex items-center justify-center">
              <MdBugReport className="w-6 h-6 text-ink" />
            </div>
            <h1 className="text-display-md text-ink font-normal">Debug Logger</h1>
          </div>
          <p className="text-body">Real-time logging for liveness detection debugging</p>
        </div>

        {/* Controls */}
        <div className="liveness-glass-surface mb-6 rounded-2xl p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            {/* Filter Buttons */}
            <div className="flex gap-2">
              {(['all', 'info', 'warn', 'error', 'debug'] as const).map(level => (
                <button
                  key={level}
                  onClick={() => setFilter(level)}
                  className={`px-4 py-2 rounded-pill text-sm font-semibold transition-colors ${
                    filter === level
                      ? 'bg-primary text-white'
                      : 'bg-surface-strong text-body hover:bg-hairline'
                  }`}
                >
                  {level.charAt(0).toUpperCase() + level.slice(1)}
                  {level !== 'all' && (
                    <span className="ml-2 opacity-70">
                      ({logs.filter(l => l.level === level).length})
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              <button
                onClick={() => setAutoScroll(!autoScroll)}
                className={`px-4 py-2 rounded-pill text-sm font-semibold transition-colors ${
                  autoScroll
                    ? 'bg-primary text-white'
                    : 'bg-surface-strong text-body hover:bg-hairline'
                }`}
              >
                Auto-scroll
              </button>
              <button
                onClick={() => setIsPaused(!isPaused)}
                className="px-4 py-2 bg-surface-strong hover:bg-hairline text-ink rounded-pill text-sm font-semibold transition-colors flex items-center gap-2"
              >
                {isPaused ? <MdPlayArrow className="w-4 h-4" /> : <MdPause className="w-4 h-4" />}
                {isPaused ? 'Resume' : 'Pause'}
              </button>
              <button
                onClick={handleDownload}
                className="px-4 py-2 bg-surface-strong hover:bg-hairline text-ink rounded-pill text-sm font-semibold transition-colors flex items-center gap-2"
              >
                <MdDownload className="w-4 h-4" />
                Export
              </button>
              <button
                onClick={handleClear}
                className="px-4 py-2 bg-semantic-down hover:opacity-90 text-white rounded-pill text-sm font-semibold transition-colors flex items-center gap-2"
              >
                <MdClear className="w-4 h-4" />
                Clear
              </button>
            </div>
          </div>
        </div>

        {/* Log Console */}
        <div className="liveness-glass-surface overflow-hidden rounded-2xl">
          <div className="border-b border-white/50 bg-white/45 px-6 py-3 backdrop-blur-md">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-ink">Console Output</span>
              <span className="text-xs text-muted">
                {filteredLogs.length} {filteredLogs.length === 1 ? 'entry' : 'entries'}
              </span>
            </div>
          </div>

          <div className="h-[600px] overflow-y-auto bg-white/25 p-4 font-mono text-sm backdrop-blur-sm">
            {filteredLogs.length === 0 ? (
              <div className="flex h-full items-center justify-center text-muted">
                No logs to display
              </div>
            ) : (
              <div className="space-y-1">
                {filteredLogs.map(log => (
                  <div
                    key={log.id}
                    className={`flex gap-3 rounded-lg border border-white/40 px-3 py-2 backdrop-blur-sm transition-opacity hover:opacity-90 ${getLevelBg(log.level)}`}
                  >
                    <span className="whitespace-nowrap text-xs text-muted">
                      {log.timestamp}
                    </span>
                    <span className={`w-14 text-xs font-bold uppercase ${getLevelColor(log.level)}`}>
                      [{log.level}]
                    </span>
                    <span className="flex-1 text-ink">
                      {log.message}
                    </span>
                  </div>
                ))}
                <div ref={logsEndRef} />
              </div>
            )}
          </div>
        </div>

        {/* Info Card */}
        <div className="liveness-glass-surface mt-6 rounded-2xl p-6">
          <h3 className="text-title-sm text-ink mb-3">Debug Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-muted">Total Logs:</span>
              <span className="ml-2 text-ink font-semibold">{logs.length}</span>
            </div>
            <div>
              <span className="text-muted">Status:</span>
              <span className={`ml-2 font-semibold ${isPaused ? 'text-accent-yellow' : 'text-semantic-up'}`}>
                {isPaused ? 'Paused' : 'Active'}
              </span>
            </div>
            <div>
              <span className="text-muted">Auto-scroll:</span>
              <span className={`ml-2 font-semibold ${autoScroll ? 'text-semantic-up' : 'text-muted'}`}>
                {autoScroll ? 'Enabled' : 'Disabled'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
