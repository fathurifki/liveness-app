import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { format } from 'date-fns'
import { MdVideocam, MdMemory, MdArchive } from 'react-icons/md'

interface Stats {
  overview: {
    total_sessions: number
    labeled_sessions: number
    unlabeled_sessions: number
    total_models: number
    total_configs: number
    total_builds: number
  }
  labelDistribution: Array<{ label: string; count: number }>
  recentSessions: Array<{ date: string; count: number }>
  labelingProgress: Array<{ date: string; count: number }>
  latestBuilds: Array<any>
  modelStats: Array<any>
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadStats()
  }, [])

  const loadStats = async () => {
    try {
      const data = await api.getStats()
      setStats(data)
    } catch (error) {
      console.error('Failed to load stats:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-muted">Loading...</div>
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-semantic-down">Failed to load dashboard</div>
      </div>
    )
  }

  const { overview, labelDistribution, recentSessions, latestBuilds, modelStats } = stats

  const labeledPercentage = overview.total_sessions > 0
    ? Math.round((overview.labeled_sessions / overview.total_sessions) * 100)
    : 0

  const pieData = labelDistribution.map(item => ({
    name: item.label,
    value: item.count,
  }))

  const PIE_COLORS = ['#05b169', '#cf202f']

  return (
    <div className="min-h-screen bg-canvas">
      <div className="max-w-7xl mx-auto px-8 py-12">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-display-md text-ink font-normal">Dashboard</h1>
          <p className="text-body mt-2">SDK Kit Production Overview</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {/* Sessions Card */}
          <div className="bg-canvas border border-hairline rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-surface-strong rounded-lg flex items-center justify-center">
                <MdVideocam className="w-6 h-6 text-primary" />
              </div>
            </div>
            <div className="mb-4">
              <div className="text-sm text-muted mb-1">Total Sessions</div>
              <div className="text-4xl font-normal text-ink">{overview.total_sessions}</div>
            </div>
            <div className="mb-2">
              <div className="text-xs text-muted mb-1">Labeling Progress</div>
              <div className="w-full bg-surface-strong rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all"
                  style={{ width: `${labeledPercentage}%` }}
                />
              </div>
            </div>
            <div className="text-sm text-body">
              {overview.labeled_sessions} labeled ({labeledPercentage}%)
            </div>
          </div>

          {/* Models Card */}
          <div className="bg-canvas border border-hairline rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-surface-strong rounded-lg flex items-center justify-center">
                <MdMemory className="w-6 h-6 text-primary" />
              </div>
            </div>
            <div className="mb-4">
              <div className="text-sm text-muted mb-1">Models Trained</div>
              <div className="text-4xl font-normal text-ink">{overview.total_models}</div>
            </div>
            <div className="mb-2">
              <div className="text-xs text-muted mb-1">Active Model</div>
              <div className="text-sm font-medium text-ink">
                {modelStats.find(m => m.is_active)?.name || 'None'}
              </div>
            </div>
            <div className="text-sm text-body">
              {overview.total_configs} configurations
            </div>
          </div>

          {/* Builds Card */}
          <div className="bg-canvas border border-hairline rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-surface-strong rounded-lg flex items-center justify-center">
                <MdArchive className="w-6 h-6 text-primary" />
              </div>
            </div>
            <div className="mb-4">
              <div className="text-sm text-muted mb-1">SDK Builds</div>
              <div className="text-4xl font-normal text-ink">{overview.total_builds}</div>
            </div>
            <div className="mb-2">
              <div className="text-xs text-muted mb-1">Latest Version</div>
              <div className="text-sm font-medium text-ink">
                {latestBuilds[0]?.version || 'None'}
              </div>
            </div>
            <div className="text-sm text-body">
              {latestBuilds[0] ? format(new Date(latestBuilds[0].created_at * 1000), 'MMM dd, yyyy') : '-'}
            </div>
          </div>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-12">
          {/* Recent Sessions Chart */}
          <div className="bg-canvas border border-hairline rounded-xl p-6">
            <h3 className="text-title-md text-ink mb-6">Recent Sessions (7 Days)</h3>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={recentSessions}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" />
                <XAxis dataKey="date" stroke="#7c828a" fontSize={12} />
                <YAxis stroke="#7c828a" fontSize={12} />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke="#0052ff" strokeWidth={2} dot={{ fill: '#0052ff', r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Label Distribution */}
          <div className="bg-canvas border border-hairline rounded-xl p-6">
            <h3 className="text-title-md text-ink mb-6">Label Distribution</h3>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {pieData.map((item, index) => (
                    <Cell key={`cell-${item.name}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recent Builds Table */}
        <div className="bg-canvas border border-hairline rounded-xl p-6">
          <h3 className="text-title-md text-ink mb-6">Recent SDK Builds</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-hairline">
                  <th className="text-left py-3 px-4 text-sm font-semibold text-muted">Version</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-muted">Created</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-muted">Output Path</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-muted">Status</th>
                </tr>
              </thead>
              <tbody>
                {latestBuilds.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center py-8 text-muted">
                      No builds yet
                    </td>
                  </tr>
                ) : (
                  latestBuilds.map((build) => (
                    <tr key={build.id} className="border-b border-hairline-soft hover:bg-surface-soft">
                      <td className="py-3 px-4 text-sm font-medium text-ink">v{build.version}</td>
                      <td className="py-3 px-4 text-sm text-body">
                        {format(new Date(build.created_at * 1000), 'MMM dd, yyyy HH:mm')}
                      </td>
                      <td className="py-3 px-4 text-sm text-body font-mono text-xs">
                        {build.output_path}
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center px-3 py-1 rounded-pill text-xs font-semibold bg-surface-strong text-ink">
                          Ready
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
