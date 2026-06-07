import { ReactNode, useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom'
import {
  MdHome,
  MdLabel,
  MdMemory,
  MdTune,
  MdBuild,
  MdPlayArrow,
  MdSettings,
  MdBugReport,
  MdHistory
} from 'react-icons/md'
import Dashboard from './pages/Dashboard'
import Labeling from './pages/Labeling'
import Models from './pages/Models'
import Config from './pages/Config'
import Builder from './pages/Builder'
import ChallengeSettings from './pages/ChallengeSettings'
import DebugLogger from './pages/DebugLogger'
import History from './pages/History'
import { LivenessCamera } from './components/LivenessCamera'
import type { LivenessCheckResult } from './core/types'

type SidebarNavItemConfig = {
  to: string
  label: string
  icon: ReactNode
}

const MAIN_NAV_ITEMS: SidebarNavItemConfig[] = [
  { to: '/', label: 'Dashboard', icon: <MdHome className="h-6 w-6" /> },
  { to: '/labeling', label: 'Labeling', icon: <MdLabel className="h-6 w-6" /> },
  { to: '/models', label: 'Models', icon: <MdMemory className="h-6 w-6" /> },
  { to: '/config', label: 'Config', icon: <MdTune className="h-6 w-6" /> },
  { to: '/builder', label: 'Builder', icon: <MdBuild className="h-6 w-6" /> },
  { to: '/history', label: 'History', icon: <MdHistory className="h-6 w-6" /> },
]

const BOTTOM_NAV_ITEMS: SidebarNavItemConfig[] = [
  { to: '/test', label: 'Test SDK', icon: <MdPlayArrow className="h-6 w-6" /> },
  {
    to: '/challenge-settings',
    label: 'Challenge Settings',
    icon: <MdSettings className="h-6 w-6" />,
  },
  { to: '/debug', label: 'Debug Logger', icon: <MdBugReport className="h-6 w-6" /> },
]

function SidebarNavItem({
  to,
  label,
  active,
  children,
}: {
  to: string
  label: string
  active: boolean
  children: ReactNode
}) {
  return (
    <Link
      to={to}
      aria-label={label}
      className={`group relative flex h-12 w-12 items-center justify-center rounded-xl transition-colors ${
        active
          ? 'bg-primary text-white'
          : 'text-muted hover:bg-surface-soft hover:text-ink'
      }`}
    >
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute left-[calc(100%+0.75rem)] top-1/2 z-[60] -translate-y-1/2 whitespace-nowrap rounded-lg bg-ink px-3 py-1.5 text-xs font-medium text-on-dark opacity-0 shadow-lg transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100"
      >
        {label}
        <span
          className="absolute right-full top-1/2 -translate-y-1/2 border-[5px] border-transparent border-r-ink"
          aria-hidden
        />
      </span>
    </Link>
  )
}

function Sidebar() {
  const location = useLocation()

  const isActive = (path: string) => location.pathname === path

  return (
    <div className="fixed left-0 top-0 z-40 flex h-screen w-20 flex-col items-center border-r border-hairline bg-canvas py-6">
      <nav className="flex flex-1 flex-col items-center gap-4">
        {MAIN_NAV_ITEMS.map(({ to, label, icon }) => (
          <SidebarNavItem key={to} to={to} label={label} active={isActive(to)}>
            {icon}
          </SidebarNavItem>
        ))}
      </nav>

      <div className="flex flex-col items-center gap-4">
        {BOTTOM_NAV_ITEMS.map(({ to, label, icon }) => (
          <SidebarNavItem key={to} to={to} label={label} active={isActive(to)}>
            {icon}
          </SidebarNavItem>
        ))}
      </div>
    </div>
  )
}

function TopBar() {
  return (
    <div className="fixed top-0 left-20 right-0 z-10 h-16 border-b border-hairline bg-canvas">
      <div className="flex h-full items-center justify-between px-8">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold text-ink">SDK Kit</h2>
        </div>
      </div>
    </div>
  )
}

function TestPage() {
  const [activeConfig, setActiveConfig] = useState<any>(null)

  useEffect(() => {
    const stored = localStorage.getItem('liveness_challenge_config')
    if (stored) {
      try {
        setActiveConfig(JSON.parse(stored))
      } catch (e) {
        console.error('Failed to parse active config:', e)
      }
    }
  }, [])

  const handleResult = (result: LivenessCheckResult) => {
    console.log('Liveness Check Result:', result)
    if (result.status === 'passed') {
      console.log('✅ PASSED — score:', result.score)
    } else {
      console.log('❌ FAILED — reason:', result.failReason)
    }
  }

  return (
    <div className="p-8 flex flex-col gap-6">
      {activeConfig && (
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <MdTune className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-[10px] text-muted font-bold uppercase tracking-wider">Active Configuration</p>
              <div className="flex gap-4 mt-0.5">
                <span className="text-sm font-semibold text-ink">
                  Challenges: <span className="text-primary">{activeConfig.challengeCount}</span>
                </span>
                <span className="text-sm font-semibold text-ink">
                  Threshold: <span className="text-primary">{activeConfig.antiSpoofThreshold}</span>
                </span>
                <span className="text-sm font-semibold text-ink">
                  Timeout: <span className="text-primary">{activeConfig.challengeTimeoutMs / 1000}s</span>
                </span>
              </div>
            </div>
          </div>
          <Link to="/config" className="text-xs font-bold text-primary hover:underline uppercase">
            Change
          </Link>
        </div>
      )}

      <div className="bg-canvas border border-hairline rounded-2xl overflow-hidden shadow-sm">
        <LivenessCamera
          onResult={handleResult}
        />
      </div>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-canvas">
        <Sidebar />
        <TopBar />
        <div className="ml-20 min-h-screen pt-16">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/labeling" element={<Labeling />} />
            <Route path="/models" element={<Models />} />
            <Route path="/config" element={<Config />} />
            <Route path="/builder" element={<Builder />} />
            <Route path="/history" element={<History />} />
            <Route path="/test" element={<TestPage />} />
            <Route path="/challenge-settings" element={<ChallengeSettings />} />
            <Route path="/debug" element={<DebugLogger />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  )
}

export default App
