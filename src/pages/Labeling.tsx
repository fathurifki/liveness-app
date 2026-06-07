import { useEffect, useState, useRef } from 'react'
import { api } from '../lib/api'
import { MdCheckCircle, MdChevronLeft, MdChevronRight, MdHistory } from 'react-icons/md'

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
  media_type?: 'video' | 'image'
  metadata?: string // JSON string from DB
}

export default function Labeling() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [view, setView] = useState<'list' | 'detail'>('list')
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'unlabeled' | 'labeled' | 'skipped'>('all')
  const [loading, setLoading] = useState(true)
  const [labeling, setLabeling] = useState(false)
  const [stats, setStats] = useState({ total: 0, labeled: 0, unlabeled: 0, skipped: 0 })
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    loadSessions()
    loadStats()
  }, [filter])

  const loadSessions = async () => {
    try {
      setLoading(true)
      const params: any = { limit: 100 }
      if (filter !== 'all') params.status = filter

      const data = await api.getSessions(params)
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

  const currentSession = sessions.find(s => s.id === selectedSessionId)

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (labeling || view !== 'detail' || !currentSession) return

      if (e.key === 'r' || e.key === 'R') {
        handleLabel('REAL')
      } else if (e.key === 's' || e.key === 'S') {
        handleLabel('SPOOF')
      } else if (e.key === 'x' || e.key === 'X') {
        handleSkip()
      } else if (e.key === ' ') {
        e.preventDefault()
        togglePlayPause()
      } else if (e.key === 'Escape') {
        setView('list')
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [currentSession, labeling, view])

  const handleLabel = async (label: 'REAL' | 'SPOOF') => {
    if (!currentSession) return

    setLabeling(true)
    try {
      await api.labelSession(currentSession.id, label, 'user')

      setSessions(prev => prev.map(s => s.id === currentSession.id ? {
        ...s,
        status: 'labeled',
        label,
        labeled_at: Math.floor(Date.now() / 1000)
      } : s))

      loadStats()
      moveToNext()
    } catch (error) {
      console.error('Failed to label session:', error)
    } finally {
      setLabeling(false)
    }
  }

  const handleSkip = async () => {
    if (!currentSession) return

    setLabeling(true)
    try {
      await api.skipSession(currentSession.id)

      setSessions(prev => prev.map(s => s.id === currentSession.id ? {
        ...s,
        status: 'skipped'
      } : s))

      loadStats()
      moveToNext()
    } catch (error) {
      console.error('Failed to skip session:', error)
    } finally {
      setLabeling(false)
    }
  }

  const moveToNext = () => {
    const currentIndex = sessions.findIndex(s => s.id === selectedSessionId)
    // Find next session that is unlabeled in the list
    const nextUnlabeled = sessions.slice(currentIndex + 1).find(s => s.status === 'unlabeled')

    if (nextUnlabeled) {
      setSelectedSessionId(nextUnlabeled.id)
    } else {
      setView('list')
      setSelectedSessionId(null)
      loadSessions()
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
      setLoading(true)
      const result = await api.exportSessions()
      alert(`Export successful! Dataset exported to ${result.path}`)
    } catch (error) {
      console.error('Failed to export:', error)
      alert('Export failed')
    } finally {
      setLoading(false)
    }
  }

  const handleImportMedia = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      setLoading(true)
      const formData = new FormData()
      formData.append('video', file)

      await api.createSession(formData)
      await Promise.all([loadSessions(), loadStats()])
      alert('Media imported successfully')
    } catch (error) {
      console.error('Failed to import media:', error)
      alert('Failed to import media')
    } finally {
      setLoading(false)
      e.target.value = ''
    }
  }

  const getMediaPath = (path: string) => {
    if (!path) return ''
    const cleanPath = path.replace(/^\/+/, '/') // Ensure exactly one leading slash
    return `http://${window.location.hostname}:3001${cleanPath}`
  }

  return (
    <div className="min-h-screen bg-canvas">
      <div className="max-w-7xl mx-auto px-8 py-12">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-display-md text-ink font-normal">Labeling Tool</h1>
            <p className="text-body mt-2">Review and label sessions as REAL or SPOOF</p>
          </div>
          <div className="flex gap-4">
            <label className="px-6 py-3 bg-surface-strong hover:bg-hairline text-ink rounded-pill font-semibold transition-colors cursor-pointer flex items-center justify-center">
              Import Media
              <input
                type="file"
                accept="video/*,image/*"
                className="hidden"
                onChange={handleImportMedia}
              />
            </label>
            <button
              onClick={handleExport}
              className="px-6 py-3 bg-primary hover:bg-primary-active text-white rounded-pill font-semibold transition-colors"
            >
              Export Dataset
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <button
            onClick={() => setFilter('all')}
            className={`bg-canvas border rounded-xl p-4 text-left transition-all ${filter === 'all' ? 'border-primary ring-1 ring-primary' : 'border-hairline'}`}
          >
            <div className="text-sm text-muted mb-1">Total</div>
            <div className="text-3xl font-normal text-ink">{stats.total}</div>
          </button>
          <button
            onClick={() => setFilter('labeled')}
            className={`bg-canvas border rounded-xl p-4 text-left transition-all ${filter === 'labeled' ? 'border-semantic-up ring-1 ring-semantic-up' : 'border-hairline'}`}
          >
            <div className="text-sm text-muted mb-1">Labeled</div>
            <div className="text-3xl font-normal text-semantic-up">{stats.labeled}</div>
          </button>
          <button
            onClick={() => setFilter('unlabeled')}
            className={`bg-canvas border rounded-xl p-4 text-left transition-all ${filter === 'unlabeled' ? 'border-primary ring-1 ring-primary' : 'border-hairline'}`}
          >
            <div className="text-sm text-muted mb-1">Unlabeled</div>
            <div className="text-3xl font-normal text-primary">{stats.unlabeled}</div>
          </button>
          <button
            onClick={() => setFilter('skipped')}
            className={`bg-canvas border rounded-xl p-4 text-left transition-all ${filter === 'skipped' ? 'border-muted ring-1 ring-muted' : 'border-hairline'}`}
          >
            <div className="text-sm text-muted mb-1">Skipped</div>
            <div className="text-3xl font-normal text-muted">{stats.skipped}</div>
          </button>
        </div>

        {view === 'list' ? (
          <div className="bg-canvas border border-hairline rounded-xl overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-surface-soft border-b border-hairline">
                  <th className="px-6 py-4 text-sm font-semibold text-muted uppercase">ID</th>
                  <th className="px-6 py-4 text-sm font-semibold text-muted uppercase">Type</th>
                  <th className="px-6 py-4 text-sm font-semibold text-muted uppercase">Status</th>
                  <th className="px-6 py-4 text-sm font-semibold text-muted uppercase">Label</th>
                  <th className="px-6 py-4 text-sm font-semibold text-muted uppercase">Date</th>
                  <th className="px-6 py-4 text-sm font-semibold text-muted uppercase text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {sessions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-muted">
                      No sessions found in this category
                    </td>
                  </tr>
                ) : (
                  sessions.map(session => (
                    <tr key={session.id} className="hover:bg-surface-soft transition-colors">
                      <td className="px-6 py-4 font-mono text-xs">{session.id.slice(0, 8)}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-pill text-[10px] font-bold uppercase ${session.media_type === 'image' ? 'bg-blue-100 text-blue-600' : 'bg-purple-100 text-purple-600'}`}>
                          {session.media_type || 'video'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-pill text-[10px] font-bold uppercase ${
                          session.status === 'labeled' ? 'bg-green-100 text-semantic-up' :
                          session.status === 'skipped' ? 'bg-gray-100 text-muted' :
                          'bg-primary/10 text-primary'
                        }`}>
                          {session.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {session.label ? (
                          <span className={`px-2 py-1 rounded-pill text-[10px] font-bold uppercase ${
                            session.label === 'REAL' ? 'bg-green-100 text-semantic-up' : 'bg-red-100 text-semantic-down'
                          }`}>
                            {session.label}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-muted">
                        {new Date(session.created_at * 1000).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => {
                            setSelectedSessionId(session.id)
                            setView('detail')
                          }}
                          className="px-4 py-2 bg-surface-strong hover:bg-hairline text-ink rounded-lg text-sm font-medium transition-colors"
                        >
                          Review
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div>
            <button
              onClick={() => setView('list')}
              className="mb-6 flex items-center gap-2 text-primary hover:underline font-medium"
            >
              ← Back to List
            </button>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <div className="bg-canvas border border-hairline rounded-xl p-6">
                  <div className="bg-surface-dark rounded-lg overflow-hidden mb-6">
                    {currentSession ? (
                      currentSession.media_type === 'image' ? (
                        <img
                          src={getMediaPath(currentSession.video_path)}
                          alt="Session media"
                          className="w-full aspect-video object-contain bg-surface-strong"
                          crossOrigin="anonymous"
                          onError={(e) => console.error("Image load error:", (e.target as HTMLImageElement).src)}
                        />
                      ) : (
                        <video
                          ref={videoRef}
                          src={getMediaPath(currentSession.video_path)}
                          controls
                          autoPlay
                          loop
                          className="w-full aspect-video object-contain bg-surface-strong"
                          crossOrigin="anonymous"
                          onError={(e) => console.error("Video load error:", (e.target as HTMLVideoElement).src)}
                        />
                      )
                    ) : (
                      <div className="w-full aspect-video flex items-center justify-center text-muted">
                        Session not found
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-center gap-4">
                    <button
                      onClick={() => handleLabel('REAL')}
                      disabled={labeling || !currentSession}
                      className={`px-8 py-3 bg-semantic-up hover:opacity-90 disabled:opacity-50 text-white rounded-pill font-semibold transition-opacity ${currentSession?.label === 'REAL' ? 'ring-4 ring-semantic-up/30' : ''}`}
                    >
                      ✓ REAL (R)
                    </button>
                    <button
                      onClick={() => handleLabel('SPOOF')}
                      disabled={labeling || !currentSession}
                      className={`px-8 py-3 bg-semantic-down hover:opacity-90 disabled:opacity-50 text-white rounded-pill font-semibold transition-opacity ${currentSession?.label === 'SPOOF' ? 'ring-4 ring-semantic-down/30' : ''}`}
                    >
                      ✗ SPOOF (S)
                    </button>
                    <button
                      onClick={handleSkip}
                      disabled={labeling || !currentSession}
                      className={`px-8 py-3 bg-surface-strong hover:bg-hairline disabled:opacity-50 text-ink rounded-pill font-semibold transition-colors ${currentSession?.status === 'skipped' ? 'ring-4 ring-muted/30' : ''}`}
                    >
                      Skip (X)
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="bg-canvas border border-hairline rounded-xl p-6">
                  <h3 className="text-title-md text-ink mb-4">Session Info</h3>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted">ID:</span>
                      <span className="font-mono text-ink">{currentSession?.id}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted">Created:</span>
                      <span className="text-body">{currentSession && new Date(currentSession.created_at * 1000).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted">Status:</span>
                      <span className={`px-2 py-0.5 rounded-pill text-xs font-semibold ${
                        currentSession?.status === 'labeled' ? 'bg-green-100 text-semantic-up' :
                        currentSession?.status === 'skipped' ? 'bg-gray-100 text-muted' :
                        'bg-primary/10 text-primary'
                      }`}>
                        {currentSession?.status}
                      </span>
                    </div>
                    {currentSession?.label && (
                      <div className="flex justify-between">
                        <span className="text-muted">Label:</span>
                        <span className={`px-2 py-0.5 rounded-pill text-xs font-semibold ${
                          currentSession.label === 'REAL' ? 'bg-green-100 text-semantic-up' : 'bg-red-100 text-semantic-down'
                        }`}>
                          {currentSession.label}
                        </span>
                      </div>
                    )}

                    {(() => {
                      try {
                        const meta = JSON.parse(currentSession?.metadata || '{}');
                        if (!meta.score && !meta.source) return null;
                        return (
                          <div className="pt-3 mt-3 border-t border-hairline space-y-2">
                            <p className="text-muted text-xs uppercase font-bold">SDK Test Info</p>
                            {meta.challenge_type && (
                              <div className="mb-2">
                                <span className="px-2 py-1 bg-primary text-white text-[10px] font-bold rounded uppercase">
                                  Challenge: {meta.challenge_type}
                                </span>
                              </div>
                            )}
                            <div className="flex justify-between">
                              <span className="text-muted">Score:</span>
                              <span className={`font-mono font-bold ${meta.score >= 50 ? 'text-semantic-up' : 'text-semantic-down'}`}>
                                {Number(meta.score).toFixed(1)}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted">SDK Result:</span>
                              <span className="text-body">{meta.status}</span>
                            </div>
                            {meta.failReason && (
                              <div className="text-xs text-semantic-down bg-red-50 p-2 rounded">
                                Alasan: {meta.failReason}
                              </div>
                            )}
                          </div>
                        );
                      } catch (e) {
                        return null;
                      }
                    })()}
                  </div>
                </div>

                <div className="bg-canvas border border-hairline rounded-xl p-6">
                  <h3 className="text-title-md text-ink mb-4">Shortcuts</h3>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2 bg-surface-soft rounded flex justify-between"><span>Real</span><kbd className="font-mono font-bold">R</kbd></div>
                    <div className="p-2 bg-surface-soft rounded flex justify-between"><span>Spoof</span><kbd className="font-mono font-bold">S</kbd></div>
                    <div className="p-2 bg-surface-soft rounded flex justify-between"><span>Skip</span><kbd className="font-mono font-bold">X</kbd></div>
                    <div className="p-2 bg-surface-soft rounded flex justify-between"><span>Exit</span><kbd className="font-mono font-bold">ESC</kbd></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
