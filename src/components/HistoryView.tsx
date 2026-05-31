import { useState, useEffect } from 'react'
import {
  loadHistory,
  deleteSession,
  clearHistory,
  getHistoryStats,
  type SessionHistoryEntry,
} from '../utils/historyStorage'
import { generateReport, getModelInfo } from '../utils/reportGenerator'
import type { ReportData } from '../utils/reportGenerator'
import { DEFAULT_CONFIG } from '../core/types'

interface HistoryViewProps {
  onClose: () => void
}

export function HistoryView({ onClose }: HistoryViewProps) {
  const [history, setHistory] = useState<SessionHistoryEntry[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    setHistory(loadHistory())
  }, [])

  const stats = getHistoryStats()

  const handleDelete = (sessionId: string) => {
    if (confirm('Hapus session ini dari history?')) {
      deleteSession(sessionId)
      setHistory(loadHistory())
      setSelectedIds(prev => {
        const next = new Set(prev)
        next.delete(sessionId)
        return next
      })
    }
  }

  const handleClearAll = () => {
    if (confirm(`Hapus semua ${history.length} session dari history?`)) {
      clearHistory()
      setHistory([])
      setSelectedIds(new Set())
    }
  }

  const handleToggleSelect = (sessionId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(sessionId)) {
        next.delete(sessionId)
      } else {
        next.add(sessionId)
      }
      return next
    })
  }

  const handleSelectAll = () => {
    if (selectedIds.size === history.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(history.map(e => e.id)))
    }
  }

  const handleGenerateReport = async (entry: SessionHistoryEntry) => {
    const reportData: ReportData = {
      result: entry.result,
      config: DEFAULT_CONFIG,
      screenshot: entry.screenshot,
      debugMetrics: entry.debugMetrics,
      modelInfo: getModelInfo(),
      timestamp: entry.timestamp,
    }

    try {
      await generateReport(reportData)
    } catch (error) {
      alert('Gagal generate report: ' + (error as Error).message)
    }
  }

  const handleBatchReport = async () => {
    if (selectedIds.size === 0) return

    const selected = history.filter(e => selectedIds.has(e.id))
    let success = 0

    for (const entry of selected) {
      try {
        await handleGenerateReport(entry)
        success++
      } catch (error) {
        console.error('Failed to generate report for', entry.id, error)
      }
    }

    alert(`✓ ${success}/${selected.length} report berhasil di-generate`)
  }

  const formatDate = (ts: number) =>
    new Date(ts).toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

  const formatDuration = (challenges: typeof history[0]['result']['challengesPassed']) => {
    if (challenges.length === 0) return '-'
    const total = challenges.reduce((sum, ch) => sum + ch.duration, 0)
    return `${(total / 1000).toFixed(1)}s`
  }

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            aria-label="Kembali"
            className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-700 hover:bg-gray-600 text-white transition-colors"
          >
            ←
          </button>
          <div>
            <h2 className="text-white font-bold text-lg leading-none">History Verifikasi</h2>
            <p className="text-gray-400 text-xs mt-0.5">{stats.total} session tersimpan</p>
          </div>
        </div>
        {history.length > 0 && (
          <button
            onClick={handleClearAll}
            className="text-xs text-red-400 hover:text-red-300 px-3 py-1.5 rounded-lg hover:bg-red-500/10 transition-colors"
          >
            Hapus Semua
          </button>
        )}
      </div>

      {/* Stats */}
      {history.length > 0 && (
        <div className="px-4 py-3 bg-gray-800/50 border-b border-gray-700 grid grid-cols-4 gap-2 text-center">
          <div>
            <p className="text-gray-400 text-xs">Total</p>
            <p className="text-white font-bold text-lg">{stats.total}</p>
          </div>
          <div>
            <p className="text-gray-400 text-xs">Passed</p>
            <p className="text-green-400 font-bold text-lg">{stats.passed}</p>
          </div>
          <div>
            <p className="text-gray-400 text-xs">Failed</p>
            <p className="text-red-400 font-bold text-lg">{stats.failed}</p>
          </div>
          <div>
            <p className="text-gray-400 text-xs">Pass Rate</p>
            <p className="text-blue-400 font-bold text-lg">{stats.passRate.toFixed(0)}%</p>
          </div>
        </div>
      )}

      {/* Batch Actions */}
      {selectedIds.size > 0 && (
        <div className="px-4 py-2 bg-blue-600/20 border-b border-blue-500/30 flex items-center justify-between">
          <span className="text-blue-300 text-sm">{selectedIds.size} dipilih</span>
          <div className="flex gap-2">
            <button
              onClick={handleBatchReport}
              className="text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              📄 Generate {selectedIds.size} Report
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="text-xs px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
            >
              Batal
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {history.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-8">
          <div className="w-20 h-20 rounded-full bg-gray-800 flex items-center justify-center text-4xl">
            📊
          </div>
          <p className="text-gray-400 text-sm leading-relaxed">
            Belum ada history verifikasi.<br />Selesaikan verifikasi untuk menyimpan history.
          </p>
        </div>
      )}

      {/* Table */}
      {history.length > 0 && (
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-800 sticky top-0 z-10">
              <tr className="text-left text-gray-400 text-xs">
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === history.length}
                    onChange={handleSelectAll}
                    className="w-4 h-4 accent-blue-500 cursor-pointer"
                  />
                </th>
                <th className="px-4 py-3">Waktu</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Score</th>
                <th className="px-4 py-3">Challenges</th>
                <th className="px-4 py-3">Duration</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {history.map((entry, idx) => (
                <tr
                  key={entry.id}
                  className={`border-b border-gray-700 hover:bg-gray-800/50 transition-colors ${
                    idx % 2 === 0 ? 'bg-gray-900' : 'bg-gray-850'
                  }`}
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(entry.id)}
                      onChange={() => handleToggleSelect(entry.id)}
                      className="w-4 h-4 accent-blue-500 cursor-pointer"
                    />
                  </td>
                  <td className="px-4 py-3 text-gray-300 text-xs">
                    {formatDate(entry.timestamp)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${
                        entry.result.status === 'passed'
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-red-500/20 text-red-400'
                      }`}
                    >
                      {entry.result.status === 'passed' ? '✓ PASS' : '✗ FAIL'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-white font-mono text-sm">
                    {entry.result.score.toFixed(1)}
                  </td>
                  <td className="px-4 py-3 text-gray-300 text-xs">
                    {entry.result.challengesPassed.map(ch => ch.type).join(', ') || '-'}
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {formatDuration(entry.result.challengesPassed)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                        className="px-2 py-1 text-xs text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded transition-colors"
                        title="View detail"
                      >
                        👁️
                      </button>
                      <button
                        onClick={() => handleGenerateReport(entry)}
                        className="px-2 py-1 text-xs text-green-400 hover:text-green-300 hover:bg-green-500/10 rounded transition-colors"
                        title="Generate report"
                      >
                        📄
                      </button>
                      <button
                        onClick={() => handleDelete(entry.id)}
                        className="px-2 py-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors"
                        title="Hapus"
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Expanded Detail */}
          {expandedId && (() => {
            const entry = history.find(e => e.id === expandedId)
            if (!entry) return null

            return (
              <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setExpandedId(null)}>
                <div className="bg-gray-800 rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                  <div className="sticky top-0 bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center justify-between">
                    <h3 className="text-white font-bold">Session Detail</h3>
                    <button onClick={() => setExpandedId(null)} className="text-gray-400 hover:text-white text-xl">✕</button>
                  </div>

                  <div className="p-6 space-y-4">
                    {entry.screenshot && (
                      <div className="flex justify-center">
                        <img src={entry.screenshot} alt="Screenshot" className="max-w-xs rounded-lg" />
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-gray-400 text-xs">Session ID</p>
                        <p className="text-white font-mono">{entry.id}</p>
                      </div>
                      <div>
                        <p className="text-gray-400 text-xs">Timestamp</p>
                        <p className="text-white">{formatDate(entry.timestamp)}</p>
                      </div>
                      <div>
                        <p className="text-gray-400 text-xs">Anti-Spoof</p>
                        <p className="text-white">{entry.result.antiSpoof.isReal ? 'REAL' : 'FAKE'} ({(entry.result.antiSpoof.score * 100).toFixed(1)}%)</p>
                      </div>
                      <div>
                        <p className="text-gray-400 text-xs">Method</p>
                        <p className="text-white">{entry.result.antiSpoof.method}</p>
                      </div>
                    </div>

                    <div>
                      <p className="text-gray-400 text-xs mb-2">Challenges</p>
                      <div className="space-y-1">
                        {entry.result.challengesPassed.map((ch, i) => (
                          <div key={i} className="flex items-center justify-between bg-gray-700/50 px-3 py-2 rounded">
                            <span className="text-white text-sm">{ch.type}</span>
                            <span className={`text-xs font-bold ${ch.passed ? 'text-green-400' : 'text-red-400'}`}>
                              {ch.passed ? '✓ PASS' : '✗ FAIL'} ({ch.duration}ms)
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {entry.result.failReason && (
                      <div>
                        <p className="text-gray-400 text-xs">Fail Reason</p>
                        <p className="text-red-400">{entry.result.failReason}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}
