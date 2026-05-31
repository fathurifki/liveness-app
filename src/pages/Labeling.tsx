import { useEffect, useState, useRef } from 'react'
import { api } from '../lib/api'
import { MdCheckCircle } from 'react-icons/md'

interface Session {
  id: string
  timestamp: number
  video_path: string
  duration: number | null
  status: 'unlabeled' | 'labeled' | 'skipped'
  label: 'REAL' | 'SPOOF' | null
  labeled_by: string | null
  labeled_at: number | null
  created_at: number
}

export default function Labeling() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [labeling, setLabeling] = useState(false)
  const [stats, setStats] = useState({ total: 0, labeled: 0, unlabeled: 0, skipped: 0 })
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    loadSessions()
    loadStats()
  }, [])

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (labeling) return

      const currentSession = sessions[currentIndex]
      if (!currentSession || currentSession.status !== 'unlabeled') return

      if (e.key === 'r' || e.key === 'R') {
        handleLabel('REAL')
      } else if (e.key === 's' || e.key === 'S') {
        handleLabel('SPOOF')
      } else if (e.key === 'x' || e.key === 'X') {
        handleSkip()
      } else if (e.key === 'ArrowRight') {
        handleNext()
      } else if (e.key === 'ArrowLeft') {
        handlePrevious()
      } else if (e.key === ' ') {
        e.preventDefault()
        togglePlayPause()
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [sessions, currentIndex, labeling])

  const loadSessions = async () => {
    try {
      const data = await api.getSessions({ status: 'unlabeled', limit: 100 })
      setSessions(data.sessions)
    } catch (error) {
      console.error('Failed to load sessions:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadStats = async () => {
    try {
      const data = await api.getLabelingStats()
      setStats(data)
    } catch (error) {
      console.error('Failed to load stats:', error)
    }
  }

  const handleLabel = async (label: 'REAL' | 'SPOOF') => {
    const session = sessions[currentIndex]
    if (!session) return

    setLabeling(true)
    try {
      await api.labelSession(session.id, label, 'user')

      const updatedSessions = [...sessions]
      updatedSessions[currentIndex] = {
        ...session,
        status: 'labeled',
        label,
        labeled_at: Math.floor(Date.now() / 1000),
      }
      setSessions(updatedSessions)

      if (currentIndex < sessions.length - 1) {
        setCurrentIndex(currentIndex + 1)
      }

      loadStats()
    } catch (error) {
      console.error('Failed to label session:', error)
    } finally {
      setLabeling(false)
    }
  }

  const handleSkip = async () => {
    const session = sessions[currentIndex]
    if (!session) return

    setLabeling(true)
    try {
      await api.skipSession(session.id)

      const updatedSessions = [...sessions]
      updatedSessions[currentIndex] = {
        ...session,
        status: 'skipped',
      }
      setSessions(updatedSessions)

      if (currentIndex < sessions.length - 1) {
        setCurrentIndex(currentIndex + 1)
      }

      loadStats()
    } catch (error) {
      console.error('Failed to skip session:', error)
    } finally {
      setLabeling(false)
    }
  }

  const handleNext = () => {
    if (currentIndex < sessions.length - 1) {
      setCurrentIndex(currentIndex + 1)
    }
  }

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1)
    }
  }

  const togglePlayPause = () => {
    if (videoRef.current) {
      if (videoRef.current.paused) {
        videoRef.current.play()
      } else {
        videoRef.current.pause()
      }
    }
  }

  const handleExport = async () => {
    try {
      const result = await api.exportSessions()
      alert(`Export successful! ${result.count} sessions exported to ${result.path}`)
    } catch (error) {
      console.error('Failed to export:', error)
      alert('Export failed')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-muted">Loading sessions...</div>
      </div>
    )
  }

  const currentSession = sessions[currentIndex]
  const unlabeledSessions = sessions.filter(s => s.status === 'unlabeled')
  const progress = sessions.length > 0 ? Math.round(((currentIndex + 1) / sessions.length) * 100) : 0

  return (
    <div className="min-h-screen bg-canvas">
      <div className="max-w-7xl mx-auto px-8 py-12">
        {/* Header */}
        <div className="flex items-center justify-between mb-12">
          <div>
            <h1 className="text-display-md text-ink font-normal">Labeling Tool</h1>
            <p className="text-body mt-2">Review and label sessions as REAL or SPOOF</p>
          </div>
          <button
            onClick={handleExport}
            className="px-6 py-3 bg-primary hover:bg-primary-active text-white rounded-pill font-semibold transition-colors"
          >
            Export Dataset
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-4 gap-4 mb-12">
          <div className="bg-canvas border border-hairline rounded-xl p-4">
            <div className="text-sm text-muted mb-1">Total</div>
            <div className="text-3xl font-normal text-ink">{stats.total}</div>
          </div>
          <div className="bg-canvas border border-hairline rounded-xl p-4">
            <div className="text-sm text-muted mb-1">Labeled</div>
            <div className="text-3xl font-normal text-semantic-up">{stats.labeled}</div>
          </div>
          <div className="bg-canvas border border-hairline rounded-xl p-4">
            <div className="text-sm text-muted mb-1">Unlabeled</div>
            <div className="text-3xl font-normal text-primary">{stats.unlabeled}</div>
          </div>
          <div className="bg-canvas border border-hairline rounded-xl p-4">
            <div className="text-sm text-muted mb-1">Skipped</div>
            <div className="text-3xl font-normal text-muted">{stats.skipped}</div>
          </div>
        </div>

        {unlabeledSessions.length === 0 ? (
          <div className="bg-canvas border border-hairline rounded-xl p-12 text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-surface-strong rounded-xl flex items-center justify-center">
              <MdCheckCircle className="w-8 h-8 text-semantic-up" />
            </div>
            <h2 className="text-title-lg text-ink mb-2">All Done!</h2>
            <p className="text-body mb-6">No unlabeled sessions remaining</p>
            <button
              onClick={handleExport}
              className="px-6 py-3 bg-primary hover:bg-primary-active text-white rounded-pill font-semibold transition-colors"
            >
              Export Labeled Data
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Video Player */}
            <div className="lg:col-span-2">
              <div className="bg-canvas border border-hairline rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-title-md text-ink">
                    Session {currentIndex + 1} of {sessions.length}
                  </h3>
                  <div className="text-sm text-muted">
                    Progress: {progress}%
                  </div>
                </div>

                {/* Video */}
                <div className="bg-surface-dark rounded-lg overflow-hidden mb-4">
                  {currentSession ? (
                    <video
                      ref={videoRef}
                      src={`http://localhost:3001${currentSession.video_path}`}
                      controls
                      autoPlay
                      loop
                      className="w-full aspect-video"
                    />
                  ) : (
                    <div className="w-full aspect-video flex items-center justify-center text-muted">
                      No video
                    </div>
                  )}
                </div>

                {/* Controls */}
                <div className="flex items-center justify-between">
                  <button
                    onClick={handlePrevious}
                    disabled={currentIndex === 0}
                    className="px-4 py-2 bg-surface-strong hover:bg-hairline disabled:opacity-50 disabled:cursor-not-allowed text-ink rounded-lg font-medium transition-colors"
                  >
                    ← Previous
                  </button>

                  <div className="flex gap-3">
                    <button
                      onClick={() => handleLabel('REAL')}
                      disabled={labeling || !currentSession || currentSession.status !== 'unlabeled'}
                      className="px-6 py-3 bg-semantic-up hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-pill font-semibold transition-opacity"
                    >
                      ✓ REAL (R)
                    </button>
                    <button
                      onClick={() => handleLabel('SPOOF')}
                      disabled={labeling || !currentSession || currentSession.status !== 'unlabeled'}
                      className="px-6 py-3 bg-semantic-down hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-pill font-semibold transition-opacity"
                    >
                      ✗ SPOOF (S)
                    </button>
                    <button
                      onClick={handleSkip}
                      disabled={labeling || !currentSession || currentSession.status !== 'unlabeled'}
                      className="px-6 py-3 bg-surface-strong hover:bg-hairline disabled:opacity-50 disabled:cursor-not-allowed text-ink rounded-pill font-semibold transition-colors"
                    >
                      Skip (X)
                    </button>
                  </div>

                  <button
                    onClick={handleNext}
                    disabled={currentIndex === sessions.length - 1}
                    className="px-4 py-2 bg-surface-strong hover:bg-hairline disabled:opacity-50 disabled:cursor-not-allowed text-ink rounded-lg font-medium transition-colors"
                  >
                    Next →
                  </button>
                </div>
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Keyboard Shortcuts */}
              <div className="bg-canvas border border-hairline rounded-xl p-6">
                <h3 className="text-title-md text-ink mb-4">Keyboard Shortcuts</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-body">Label REAL</span>
                    <kbd className="px-2 py-1 bg-surface-strong rounded font-mono text-ink">R</kbd>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-body">Label SPOOF</span>
                    <kbd className="px-2 py-1 bg-surface-strong rounded font-mono text-ink">S</kbd>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-body">Skip</span>
                    <kbd className="px-2 py-1 bg-surface-strong rounded font-mono text-ink">X</kbd>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-body">Play/Pause</span>
                    <kbd className="px-2 py-1 bg-surface-strong rounded font-mono text-ink">Space</kbd>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-body">Previous</span>
                    <kbd className="px-2 py-1 bg-surface-strong rounded font-mono text-ink">←</kbd>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-body">Next</span>
                    <kbd className="px-2 py-1 bg-surface-strong rounded font-mono text-ink">→</kbd>
                  </div>
                </div>
              </div>

              {/* Session Info */}
              {currentSession && (
                <div className="bg-canvas border border-hairline rounded-xl p-6">
                  <h3 className="text-title-md text-ink mb-4">Session Info</h3>
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="text-muted">ID:</span>
                      <span className="ml-2 font-mono text-xs text-ink">{currentSession.id.slice(0, 8)}</span>
                    </div>
                    <div>
                      <span className="text-muted">Created:</span>
                      <span className="ml-2 text-body">{new Date(currentSession.created_at * 1000).toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-muted">Status:</span>
                      <span className={`ml-2 px-2 py-0.5 rounded-pill text-xs font-semibold ${
                        currentSession.status === 'labeled' ? 'bg-surface-strong text-semantic-up' :
                        currentSession.status === 'skipped' ? 'bg-surface-strong text-muted' :
                        'bg-surface-strong text-primary'
                      }`}>
                        {currentSession.status}
                      </span>
                    </div>
                    {currentSession.label && (
                      <div>
                        <span className="text-muted">Label:</span>
                        <span className={`ml-2 px-2 py-0.5 rounded-pill text-xs font-semibold ${
                          currentSession.label === 'REAL' ? 'bg-surface-strong text-semantic-up' : 'bg-surface-strong text-semantic-down'
                        }`}>
                          {currentSession.label}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
