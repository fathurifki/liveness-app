import { useState, useEffect } from 'react'
import { MdHistory, MdCheckCircle, MdCancel, MdSearch, MdDownload, MdChevronLeft, MdChevronRight } from 'react-icons/md'
import { format } from 'date-fns'
import jsPDF from 'jspdf'

interface HistoryEntry {
  id: string
  timestamp: Date
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
  video?: string
  logs?: Array<{
    timestamp: string
    level: 'info' | 'warn' | 'error'
    message: string
  }>
  modelInfo?: {
    faceDetection?: string
    antiSpoof?: string
  }
}

export default function History() {
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [filter, setFilter] = useState<'all' | 'passed' | 'failed'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedEntry, setSelectedEntry] = useState<HistoryEntry | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [currentScreenshotIndex, setCurrentScreenshotIndex] = useState(0)
  const itemsPerPage = 10

  // Load history from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('liveness_history')
    if (stored) {
      const parsed = JSON.parse(stored)
      setHistory(parsed.map((entry: any) => ({
        ...entry,
        timestamp: new Date(entry.timestamp)
      })))
    } else {
      // Demo data
      setHistory([
        {
          id: '1',
          timestamp: new Date('2026-05-25T03:45:00'),
          status: 'passed',
          score: 85,
          duration: 4.2,
          challenges: [
            { type: 'blink', instruction: 'Kedip 2x', completed: true, duration: 2.1 },
            { type: 'smile', instruction: 'Senyum', completed: true, duration: 2.1 }
          ],
          antiSpoofScore: 0.92,
          qualityChecks: { brightness: true, sharpness: true, faceSize: true }
        },
        {
          id: '2',
          timestamp: new Date('2026-05-25T03:30:00'),
          status: 'failed',
          score: 45,
          duration: 6.8,
          challenges: [
            { type: 'blink', instruction: 'Kedip 2x', completed: true, duration: 2.3 },
            { type: 'nod_top', instruction: 'Angguk ke atas', completed: false, duration: 4.5 }
          ],
          failReason: 'Challenge timeout',
          antiSpoofScore: 0.88,
          qualityChecks: { brightness: true, sharpness: false, faceSize: true }
        },
        {
          id: '3',
          timestamp: new Date('2026-05-25T03:15:00'),
          status: 'passed',
          score: 92,
          duration: 3.8,
          challenges: [
            { type: 'smile', instruction: 'Senyum', completed: true, duration: 1.9 },
            { type: 'blink', instruction: 'Kedip 2x', completed: true, duration: 1.9 }
          ],
          antiSpoofScore: 0.95,
          qualityChecks: { brightness: true, sharpness: true, faceSize: true }
        }
      ])
    }
  }, [])

  const filteredHistory = history
    .filter(entry => filter === 'all' || entry.status === filter)
    .filter(entry =>
      searchQuery === '' ||
      entry.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.failReason?.toLowerCase().includes(searchQuery.toLowerCase())
    )

  // Pagination
  const totalPages = Math.ceil(filteredHistory.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedHistory = filteredHistory.slice(startIndex, endIndex)

  // Reset to page 1 when filter or search changes
  useEffect(() => {
    setCurrentPage(1)
  }, [filter, searchQuery])

  // Reset screenshot index when selected entry changes
  useEffect(() => {
    setCurrentScreenshotIndex(0)
  }, [selectedEntry])

  const stats = {
    total: history.length,
    passed: history.filter(e => e.status === 'passed').length,
    failed: history.filter(e => e.status === 'failed').length,
    avgScore: history.length > 0
      ? Math.round(history.reduce((sum, e) => sum + e.score, 0) / history.length)
      : 0,
    avgDuration: history.length > 0
      ? (history.reduce((sum, e) => sum + e.duration, 0) / history.length).toFixed(1)
      : '0.0'
  }

  const handleExport = () => {
    const csv = [
      ['ID', 'Timestamp', 'Status', 'Score', 'Duration (s)', 'Challenges', 'Fail Reason'].join(','),
      ...history.map(entry => [
        entry.id,
        format(entry.timestamp, 'yyyy-MM-dd HH:mm:ss'),
        entry.status,
        entry.score,
        entry.duration,
        entry.challenges.map(c => c.type).join(';'),
        entry.failReason || ''
      ].join(','))
    ].join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `liveness-history-${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleClear = () => {
    if (confirm('Hapus semua history? Tindakan ini tidak dapat dibatalkan.')) {
      setHistory([])
      localStorage.removeItem('liveness_history')
      setSelectedEntry(null)
    }
  }

  const handleDownloadPDF = (entry: HistoryEntry) => {
    const doc = new jsPDF()
    const setFontStyle = (style: 'normal' | 'bold') => doc.setFont('helvetica', style)

    // Header
    doc.setFontSize(20)
    doc.text('Liveness Verification Report', 20, 20)

    doc.setFontSize(10)
    doc.setTextColor(100)
    doc.text(`Generated: ${format(new Date(), 'yyyy-MM-dd HH:mm:ss')}`, 20, 28)

    // Divider
    doc.setDrawColor(200)
    doc.line(20, 32, 190, 32)

    // Entry Details
    let y = 45
    doc.setFontSize(12)
    doc.setTextColor(0)

    doc.text('Verification ID:', 20, y)
    setFontStyle('bold')
    doc.text(entry.id, 70, y)
    setFontStyle('normal')
    y += 10

    doc.text('Timestamp:', 20, y)
    doc.text(format(entry.timestamp, 'yyyy-MM-dd HH:mm:ss'), 70, y)
    y += 10

    doc.text('Status:', 20, y)
    doc.setTextColor(entry.status === 'passed' ? 0 : 220, entry.status === 'passed' ? 150 : 50, entry.status === 'passed' ? 0 : 50)
    setFontStyle('bold')
    doc.text(entry.status.toUpperCase(), 70, y)
    setFontStyle('normal')
    doc.setTextColor(0)
    y += 10

    doc.text('Score:', 20, y)
    doc.text(String(entry.score), 70, y)
    y += 10

    doc.text('Duration:', 20, y)
    doc.text(`${entry.duration}s`, 70, y)
    y += 10

    if (entry.antiSpoofScore !== undefined) {
      doc.text('Anti-Spoof Score:', 20, y)
      doc.text(String(entry.antiSpoofScore), 70, y)
      y += 10
    }

    // Model Info
    if (entry.modelInfo && typeof entry.modelInfo === 'object') {
      const info = entry.modelInfo as any

      // Check if we have any model info to display
      const hasNewFormat = typeof info.faceDetection === 'string'
      const hasOldFormat = info.antiSpoof?.modelName

      if (hasNewFormat || hasOldFormat) {
        if (y > 200) {
          doc.addPage()
          y = 20
        }
        y += 5
        doc.setFontSize(14)
        doc.text('Model Information', 20, y)
        y += 8
        doc.setFontSize(10)

        if (hasNewFormat) {
          // New format (flat strings)
          if (info.faceDetection) {
            doc.text('Face Detection:', 25, y)
            setFontStyle('bold')
            doc.text(info.faceDetection, 70, y)
            setFontStyle('normal')
            y += 6
          }
          if (info.antiSpoof) {
            doc.text('Anti-Spoof:', 25, y)
            setFontStyle('bold')
            doc.text(info.antiSpoof, 70, y)
            setFontStyle('normal')
            y += 6
          }
          if (info.blinkDetection) {
            doc.text('Blink Detection:', 25, y)
            setFontStyle('bold')
            doc.text(info.blinkDetection, 70, y)
            setFontStyle('normal')
            y += 6
          }
          if (info.smileDetection) {
            doc.text('Smile Detection:', 25, y)
            setFontStyle('bold')
            doc.text(info.smileDetection, 70, y)
            setFontStyle('normal')
            y += 6
          }
        } else if (hasOldFormat) {
          // Old format (nested object)
          doc.text('Face Detection:', 25, y)
          setFontStyle('bold')
          doc.text('MediaPipe Face Mesh', 70, y)
          setFontStyle('normal')
          y += 6

          if (info.antiSpoof.modelName) {
            doc.text('Anti-Spoof:', 25, y)
            setFontStyle('bold')
            doc.text(info.antiSpoof.modelName, 70, y)
            setFontStyle('normal')
            y += 6
          }

          if (info.challenges?.blink) {
            doc.text('Blink Detection:', 25, y)
            setFontStyle('bold')
            doc.text(info.challenges.blink.modelName || 'EAR Heuristic', 70, y)
            setFontStyle('normal')
            y += 6
          }

          if (info.challenges?.smile) {
            doc.text('Smile Detection:', 25, y)
            setFontStyle('bold')
            doc.text(info.challenges.smile.modelName || 'Corner-lift Heuristic', 70, y)
            setFontStyle('normal')
            y += 6
          }
        }
        y += 4
      }
    }

    // Screenshot
    if (entry.screenshot) {
      if (y > 200) {
        doc.addPage()
        y = 20
      }
      y += 5
      doc.setFontSize(14)

      // Use screenshots array if available
      const screenshots = entry.screenshots && entry.screenshots.length > 0
        ? entry.screenshots
        : [{ challengeType: 'final', timestamp: '', image: entry.screenshot }]

      doc.text(`Captured Face (${screenshots.length} ${screenshots.length === 1 ? 'image' : 'images'})`, 20, y)
      y += 8

      screenshots.forEach((screenshot, idx) => {
        if (y > 200) {
          doc.addPage()
          y = 20
        }

        // Challenge type label
        if (screenshot.challengeType !== 'final') {
          doc.setFontSize(10)
          doc.setTextColor(100)
          doc.text(`Challenge: ${screenshot.challengeType}`, 20, y)
          y += 6
          doc.setTextColor(0)
        }

        try {
          doc.addImage(screenshot.image, 'JPEG', 20, y, 80, 60)
          y += 65
        } catch (e) {
          console.error('Failed to add screenshot to PDF:', e)
          doc.setFontSize(10)
          doc.setTextColor(150)
          doc.text('(Screenshot unavailable)', 20, y)
          doc.setTextColor(0)
          y += 10
        }

        // Add spacing between screenshots
        if (idx < screenshots.length - 1) {
          y += 5
        }
      })
    }

    // Quality Checks
    if (y > 240) {
      doc.addPage()
      y = 20
    }
    y += 5
    doc.setFontSize(14)
    doc.text('Quality Checks', 20, y)
    y += 8
    doc.setFontSize(10)

    doc.text(`Brightness: ${entry.qualityChecks.brightness ? '✓ Pass' : '✗ Fail'}`, 25, y)
    y += 6
    doc.text(`Sharpness: ${entry.qualityChecks.sharpness ? '✓ Pass' : '✗ Fail'}`, 25, y)
    y += 6
    doc.text(`Face Size: ${entry.qualityChecks.faceSize ? '✓ Pass' : '✗ Fail'}`, 25, y)
    y += 10

    // Challenges
    if (entry.challenges.length > 0) {
      if (y > 230) {
        doc.addPage()
        y = 20
      }
      y += 5
      doc.setFontSize(14)
      doc.text(`Challenges (${entry.challenges.length})`, 20, y)
      y += 8
      doc.setFontSize(10)

      entry.challenges.forEach((ch, idx) => {
        if (y > 250) {
          doc.addPage()
          y = 20
        }
        doc.text(`${idx + 1}. ${ch.type}`, 25, y)
        y += 6
        doc.setTextColor(100)
        doc.text(`   ${ch.instruction}`, 25, y)
        y += 6
        doc.setTextColor(0)
        doc.text(`   Status: ${ch.completed ? '✓ Completed' : '✗ Failed'} | Duration: ${ch.duration}s`, 25, y)
        y += 8
      })
    } else {
      if (y > 240) {
        doc.addPage()
        y = 20
      }
      y += 5
      doc.setFontSize(14)
      doc.text('Challenges', 20, y)
      y += 8
      doc.setFontSize(10)
      doc.setTextColor(150)
      doc.text('No challenges were executed', 25, y)
      doc.setTextColor(0)
      y += 10
    }

    // Fail Reason
    if (entry.failReason) {
      if (y > 240) {
        doc.addPage()
        y = 20
      }
      y += 5
      doc.setFontSize(14)
      doc.text('Fail Reason', 20, y)
      y += 8
      doc.setFontSize(10)
      doc.setTextColor(220, 50, 50)
      const lines = doc.splitTextToSize(entry.failReason, 170)
      doc.text(lines, 25, y)
      doc.setTextColor(0)
      y += lines.length * 6 + 4
    }

    // Debug Logs
    if (entry.logs && Array.isArray(entry.logs) && entry.logs.length > 0) {
      doc.addPage()
      y = 20
      doc.setFontSize(14)
      doc.text(`Debug Logs (${entry.logs.length} entries)`, 20, y)
      y += 8
      doc.setFontSize(8)
      doc.setFont('courier')

      entry.logs.forEach((log) => {
        if (!log || !log.timestamp || !log.level || !log.message) return

        if (y > 270) {
          doc.addPage()
          y = 20
        }

        const timestamp = format(new Date(log.timestamp), 'HH:mm:ss.SSS')
        const level = log.level.toUpperCase().padEnd(5)

        // Color by level
        if (log.level === 'error') {
          doc.setTextColor(220, 50, 50)
        } else if (log.level === 'warn') {
          doc.setTextColor(200, 150, 0)
        } else {
          doc.setTextColor(100)
        }

        const logLine = `[${timestamp}] ${level} ${log.message}`
        const lines = doc.splitTextToSize(logLine, 170)
        doc.text(lines, 20, y)
        y += lines.length * 4
        doc.setTextColor(0)
      })

      setFontStyle('normal')
    }

    // Footer
    const pageCount = doc.getNumberOfPages()
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i)
      doc.setFontSize(8)
      doc.setTextColor(150)
      doc.text('Face Liveness SDK - Production Platform', 105, 285, { align: 'center' })
      doc.text(`Page ${i} of ${pageCount}`, 190, 285, { align: 'right' })
    }

    // Save
    doc.save(`liveness-report-${entry.id}.pdf`)
  }

  return (
    <div className="min-h-screen bg-canvas">
      <div className="max-w-7xl mx-auto px-8 py-12">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center">
              <MdHistory className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-display-md text-ink font-normal">Verification History</h1>
          </div>
          <p className="text-body">Track and analyze liveness verification attempts</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
          <div className="bg-canvas border border-hairline rounded-xl p-6">
            <div className="text-caption text-muted mb-1">Total</div>
            <div className="text-display-sm text-ink font-normal">{stats.total}</div>
          </div>
          <div className="bg-canvas border border-hairline rounded-xl p-6">
            <div className="text-caption text-muted mb-1">Passed</div>
            <div className="text-display-sm text-semantic-up font-normal">{stats.passed}</div>
          </div>
          <div className="bg-canvas border border-hairline rounded-xl p-6">
            <div className="text-caption text-muted mb-1">Failed</div>
            <div className="text-display-sm text-semantic-down font-normal">{stats.failed}</div>
          </div>
          <div className="bg-canvas border border-hairline rounded-xl p-6">
            <div className="text-caption text-muted mb-1">Avg Score</div>
            <div className="text-display-sm text-ink font-normal">{stats.avgScore}</div>
          </div>
          <div className="bg-canvas border border-hairline rounded-xl p-6">
            <div className="text-caption text-muted mb-1">Avg Duration</div>
            <div className="text-display-sm text-ink font-normal">{stats.avgDuration}s</div>
          </div>
        </div>

        {/* Controls */}
        <div className="bg-canvas border border-hairline rounded-xl p-6 mb-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            {/* Search */}
            <div className="flex-1 min-w-[200px] max-w-md relative">
              <MdSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
              <input
                type="text"
                placeholder="Search by ID or reason..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-hairline rounded-pill text-ink focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>

            {/* Filter */}
            <div className="flex gap-2">
              {(['all', 'passed', 'failed'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-4 py-2 rounded-pill text-sm font-semibold transition-colors ${
                    filter === f
                      ? 'bg-primary text-white'
                      : 'bg-surface-strong text-body hover:bg-hairline'
                  }`}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={handleExport}
                className="px-4 py-2 bg-surface-strong hover:bg-hairline text-ink rounded-pill text-sm font-semibold transition-colors flex items-center gap-2"
              >
                <MdDownload className="w-4 h-4" />
                Export CSV
              </button>
              <button
                onClick={handleClear}
                className="px-4 py-2 bg-semantic-down hover:opacity-90 text-white rounded-pill text-sm font-semibold transition-colors"
              >
                Clear All
              </button>
            </div>
          </div>
        </div>

        {/* History Table */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* List */}
          <div className="bg-canvas border border-hairline rounded-xl overflow-hidden">
            <div className="bg-surface-soft px-6 py-3 border-b border-hairline">
              <span className="text-title-sm text-ink">History ({filteredHistory.length})</span>
            </div>
            <div className="max-h-[600px] overflow-y-auto">
              {paginatedHistory.length === 0 ? (
                <div className="flex items-center justify-center h-40 text-muted">
                  No history found
                </div>
              ) : (
                <div className="divide-y divide-hairline">
                  {paginatedHistory.map(entry => (
                    <button
                      key={entry.id}
                      onClick={() => setSelectedEntry(entry)}
                      className={`w-full px-6 py-4 text-left hover:bg-surface-soft transition-colors ${
                        selectedEntry?.id === entry.id ? 'bg-surface-soft' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {entry.status === 'passed' ? (
                            <MdCheckCircle className="w-5 h-5 text-semantic-up" />
                          ) : (
                            <MdCancel className="w-5 h-5 text-semantic-down" />
                          )}
                          <span className="text-body-md text-ink font-semibold">#{entry.id}</span>
                        </div>
                        <span className="text-caption text-muted">
                          {format(entry.timestamp, 'HH:mm:ss')}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-caption text-body">
                        <span>Score: {entry.score}</span>
                        <span>•</span>
                        <span>{entry.duration}s</span>
                        <span>•</span>
                        <span>{entry.challenges.length} challenges</span>
                      </div>
                      {entry.failReason && (
                        <div className="mt-2 text-caption text-semantic-down">
                          {entry.failReason}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="border-t border-hairline px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="text-caption text-muted">
                    Showing {startIndex + 1}-{Math.min(endIndex, filteredHistory.length)} of {filteredHistory.length}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="p-2 rounded-lg hover:bg-surface-soft disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <MdChevronLeft className="w-5 h-5 text-ink" />
                    </button>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                        <button
                          key={page}
                          onClick={() => setCurrentPage(page)}
                          className={`w-8 h-8 rounded-lg text-sm font-semibold transition-colors ${
                            currentPage === page
                              ? 'bg-primary text-white'
                              : 'text-ink hover:bg-surface-soft'
                          }`}
                        >
                          {page}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="p-2 rounded-lg hover:bg-surface-soft disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <MdChevronRight className="w-5 h-5 text-ink" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Detail */}
          <div className="bg-canvas border border-hairline rounded-xl overflow-hidden">
            <div className="bg-surface-soft px-6 py-3 border-b border-hairline flex items-center justify-between">
              <span className="text-title-sm text-ink">Details</span>
              {selectedEntry && (
                <button
                  onClick={() => handleDownloadPDF(selectedEntry)}
                  className="px-3 py-1.5 bg-primary hover:bg-primary-active text-white rounded-pill text-xs font-semibold transition-colors flex items-center gap-1.5"
                >
                  <MdDownload className="w-4 h-4" />
                  Download PDF
                </button>
              )}
            </div>
            <div className="p-6">
              {!selectedEntry ? (
                <div className="flex items-center justify-center h-40 text-muted">
                  Select an entry to view details
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Status */}
                  <div>
                    <div className="text-caption text-muted mb-2">Status</div>
                    <div className="flex items-center gap-2">
                      {selectedEntry.status === 'passed' ? (
                        <>
                          <MdCheckCircle className="w-6 h-6 text-semantic-up" />
                          <span className="text-title-md text-semantic-up">Passed</span>
                        </>
                      ) : (
                        <>
                          <MdCancel className="w-6 h-6 text-semantic-down" />
                          <span className="text-title-md text-semantic-down">Failed</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Metrics */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-caption text-muted mb-1">Score</div>
                      <div className="text-title-md text-ink">{selectedEntry.score}</div>
                    </div>
                    <div>
                      <div className="text-caption text-muted mb-1">Duration</div>
                      <div className="text-title-md text-ink">{selectedEntry.duration}s</div>
                    </div>
                    <div>
                      <div className="text-caption text-muted mb-1">Anti-Spoof</div>
                      <div className="text-title-md text-ink">
                        {selectedEntry.antiSpoofScore?.toFixed(2) || 'N/A'}
                      </div>
                    </div>
                    <div>
                      <div className="text-caption text-muted mb-1">Timestamp</div>
                      <div className="text-body-sm text-ink">
                        {format(selectedEntry.timestamp, 'MMM dd, HH:mm:ss')}
                      </div>
                    </div>
                  </div>

                  {/* Challenges */}
                  <div>
                    <div className="text-caption text-muted mb-2">Challenges</div>
                    <div className="space-y-2">
                      {selectedEntry.challenges.map((challenge, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-3 bg-surface-soft rounded-lg"
                        >
                          <div className="flex items-center gap-2">
                            {challenge.completed ? (
                              <MdCheckCircle className="w-4 h-4 text-semantic-up" />
                            ) : (
                              <MdCancel className="w-4 h-4 text-semantic-down" />
                            )}
                            <span className="text-body-sm text-ink">{challenge.instruction}</span>
                          </div>
                          <span className="text-caption text-muted">{challenge.duration}s</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Quality Checks */}
                  <div>
                    <div className="text-caption text-muted mb-2">Quality Checks</div>
                    <div className="grid grid-cols-3 gap-2">
                      {Object.entries(selectedEntry.qualityChecks).map(([key, value]) => (
                        <div
                          key={key}
                          className={`px-3 py-2 rounded-lg text-center text-caption ${
                            value ? 'bg-semantic-up/10 text-semantic-up' : 'bg-semantic-down/10 text-semantic-down'
                          }`}
                        >
                          {key.charAt(0).toUpperCase() + key.slice(1)}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Screenshot */}
                  {selectedEntry.screenshot && (
                    <div>
                      <div className="text-caption text-muted mb-2">Captured Face</div>
                      {(() => {
                        // Use screenshots array if available, otherwise fallback to single screenshot
                        const screenshots = selectedEntry.screenshots && selectedEntry.screenshots.length > 0
                          ? selectedEntry.screenshots
                          : [{ challengeType: 'final', timestamp: '', image: selectedEntry.screenshot }]

                        const currentScreenshot = screenshots[currentScreenshotIndex]

                        return (
                          <div>
                            <div className="relative rounded-lg overflow-hidden border border-hairline">
                              <img
                                src={currentScreenshot.image}
                                alt="Face capture"
                                className="w-full h-auto"
                              />
                              {/* Challenge type label */}
                              {currentScreenshot.challengeType !== 'final' && (
                                <div className="absolute top-2 left-2 bg-primary text-white px-3 py-1 rounded-pill text-xs font-semibold">
                                  {currentScreenshot.challengeType}
                                </div>
                              )}
                            </div>

                            {/* Carousel navigation */}
                            {screenshots.length > 1 && (
                              <div className="flex items-center justify-between mt-3">
                                <button
                                  onClick={() => setCurrentScreenshotIndex(prev => Math.max(0, prev - 1))}
                                  disabled={currentScreenshotIndex === 0}
                                  className="p-2 rounded-lg hover:bg-surface-soft disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                >
                                  <MdChevronLeft className="w-5 h-5 text-ink" />
                                </button>
                                <div className="text-caption text-muted">
                                  {currentScreenshotIndex + 1} / {screenshots.length}
                                </div>
                                <button
                                  onClick={() => setCurrentScreenshotIndex(prev => Math.min(screenshots.length - 1, prev + 1))}
                                  disabled={currentScreenshotIndex === screenshots.length - 1}
                                  className="p-2 rounded-lg hover:bg-surface-soft disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                >
                                  <MdChevronRight className="w-5 h-5 text-ink" />
                                </button>
                              </div>
                            )}
                          </div>
                        )
                      })()}
                    </div>
                  )}

                  {/* Model Info */}
                  {selectedEntry.modelInfo && typeof selectedEntry.modelInfo === 'object' && (
                    <div>
                      <div className="text-caption text-muted mb-2">Model Information</div>
                      <div className="space-y-2">
                        {/* Handle both old (nested object) and new (flat strings) format */}
                        {(() => {
                          const info = selectedEntry.modelInfo as any

                          // New format (flat strings)
                          if (typeof info.faceDetection === 'string') {
                            return (
                              <>
                                {info.faceDetection && (
                                  <div className="flex items-center justify-between px-3 py-2 bg-surface-soft rounded-lg">
                                    <span className="text-caption text-muted">Face Detection</span>
                                    <span className="text-body-sm text-ink font-mono">{info.faceDetection}</span>
                                  </div>
                                )}
                                {info.antiSpoof && (
                                  <div className="flex items-center justify-between px-3 py-2 bg-surface-soft rounded-lg">
                                    <span className="text-caption text-muted">Anti-Spoof</span>
                                    <span className="text-body-sm text-ink font-mono">{info.antiSpoof}</span>
                                  </div>
                                )}
                                {info.blinkDetection && (
                                  <div className="flex items-center justify-between px-3 py-2 bg-surface-soft rounded-lg">
                                    <span className="text-caption text-muted">Blink Detection</span>
                                    <span className="text-body-sm text-ink font-mono">{info.blinkDetection}</span>
                                  </div>
                                )}
                                {info.smileDetection && (
                                  <div className="flex items-center justify-between px-3 py-2 bg-surface-soft rounded-lg">
                                    <span className="text-caption text-muted">Smile Detection</span>
                                    <span className="text-body-sm text-ink font-mono">{info.smileDetection}</span>
                                  </div>
                                )}
                              </>
                            )
                          }

                          // Old format (nested object) - extract model names
                          if (info.antiSpoof?.modelName) {
                            return (
                              <>
                                <div className="flex items-center justify-between px-3 py-2 bg-surface-soft rounded-lg">
                                  <span className="text-caption text-muted">Face Detection</span>
                                  <span className="text-body-sm text-ink font-mono">MediaPipe Face Mesh</span>
                                </div>
                                <div className="flex items-center justify-between px-3 py-2 bg-surface-soft rounded-lg">
                                  <span className="text-caption text-muted">Anti-Spoof</span>
                                  <span className="text-body-sm text-ink font-mono">{info.antiSpoof.modelName}</span>
                                </div>
                                {info.challenges?.blink && (
                                  <div className="flex items-center justify-between px-3 py-2 bg-surface-soft rounded-lg">
                                    <span className="text-caption text-muted">Blink Detection</span>
                                    <span className="text-body-sm text-ink font-mono">
                                      {info.challenges.blink.modelName || 'EAR Heuristic'}
                                    </span>
                                  </div>
                                )}
                                {info.challenges?.smile && (
                                  <div className="flex items-center justify-between px-3 py-2 bg-surface-soft rounded-lg">
                                    <span className="text-caption text-muted">Smile Detection</span>
                                    <span className="text-body-sm text-ink font-mono">
                                      {info.challenges.smile.modelName || 'Corner-lift Heuristic'}
                                    </span>
                                  </div>
                                )}
                              </>
                            )
                          }

                          return null
                        })()}
                      </div>
                    </div>
                  )}

                  {/* Debug Logs */}
                  {selectedEntry.logs && Array.isArray(selectedEntry.logs) && selectedEntry.logs.length > 0 && (
                    <div>
                      <div className="text-caption text-muted mb-2">Debug Logs ({selectedEntry.logs.length})</div>
                      <div className="max-h-60 overflow-y-auto bg-surface-soft rounded-lg p-3 space-y-1 font-mono text-xs">
                        {selectedEntry.logs.map((log, idx) => {
                          if (!log || !log.timestamp || !log.level || !log.message) return null
                          return (
                            <div
                              key={idx}
                              className={`${
                                log.level === 'error' ? 'text-semantic-down' :
                                log.level === 'warn' ? 'text-yellow-600' :
                                'text-muted'
                              }`}
                            >
                              <span className="text-muted">[{format(new Date(log.timestamp), 'HH:mm:ss.SSS')}]</span>{' '}
                              <span className="font-semibold">{log.level.toUpperCase()}</span>{' '}
                              {log.message}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Fail Reason */}
                  {selectedEntry.failReason && (
                    <div>
                      <div className="text-caption text-muted mb-2">Fail Reason</div>
                      <div className="px-4 py-3 bg-semantic-down/10 rounded-lg text-body-sm text-semantic-down">
                        {selectedEntry.failReason}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
