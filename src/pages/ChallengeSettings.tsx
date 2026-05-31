import { useState, useEffect } from 'react'
import {
  MdTune,
  MdRemoveRedEye,
  MdArrowUpward,
  MdArrowDownward,
  MdArrowBack,
  MdArrowForward,
  MdSentimentSatisfied,
  MdRecordVoiceOver,
  MdGpsFixed
} from 'react-icons/md'

type ChallengeType = 'blink' | 'nod_top' | 'nod_bottom' | 'yaw_left' | 'yaw_right' | 'smile' | 'open_mouth' | 'gaze_target'

interface ChallengeOption {
  type: ChallengeType
  label: string
  icon: React.ReactNode
  description: string
}

const CHALLENGE_OPTIONS: ChallengeOption[] = [
  { type: 'blink', label: 'Kedip', icon: <MdRemoveRedEye className="w-8 h-8" />, description: 'User diminta untuk berkedip' },
  { type: 'nod_top', label: 'Angguk Atas', icon: <MdArrowUpward className="w-8 h-8" />, description: 'User diminta mengangguk ke atas' },
  { type: 'nod_bottom', label: 'Angguk Bawah', icon: <MdArrowDownward className="w-8 h-8" />, description: 'User diminta mengangguk ke bawah' },
  { type: 'yaw_left', label: 'Yaw Kiri', icon: <MdArrowBack className="w-8 h-8" />, description: 'User diminta menoleh ke kiri' },
  { type: 'yaw_right', label: 'Yaw Kanan', icon: <MdArrowForward className="w-8 h-8" />, description: 'User diminta menoleh ke kanan' },
  { type: 'smile', label: 'Senyum', icon: <MdSentimentSatisfied className="w-8 h-8" />, description: 'User diminta tersenyum' },
  { type: 'open_mouth', label: 'Buka Mulut', icon: <MdRecordVoiceOver className="w-8 h-8" />, description: 'User diminta membuka mulut' },
  { type: 'gaze_target', label: 'Lihat Titik', icon: <MdGpsFixed className="w-8 h-8" />, description: 'User diminta melihat titik target' },
]

export default function ChallengeSettings() {
  const [enabledChallenges, setEnabledChallenges] = useState<ChallengeType[]>(['blink', 'smile'])
  const [challengeCount, setChallengeCount] = useState(2)
  const [challengeTimeout, setChallengeTimeout] = useState(6)
  const [isUnlimited, setIsUnlimited] = useState(false)

  // Load settings from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('liveness_challenge_config')
    if (stored) {
      try {
        const config = JSON.parse(stored)
        setEnabledChallenges(config.enabledChallenges || ['blink', 'smile'])
        setChallengeCount(config.challengeCount || 2)
        const timeoutSec = config.challengeTimeoutMs / 1000
        if (timeoutSec >= 600) {
          setIsUnlimited(true)
          setChallengeTimeout(6)
        } else {
          setIsUnlimited(false)
          setChallengeTimeout(timeoutSec)
        }
      } catch (e) {
        console.error('Failed to load challenge config:', e)
      }
    }
  }, [])

  const handleToggleChallenge = (type: ChallengeType) => {
    setEnabledChallenges(prev => {
      if (prev.includes(type)) {
        return prev.length === 1 ? prev : prev.filter(t => t !== type)
      }
      return [...prev, type]
    })
  }

  const handleSave = () => {
    const config = {
      enabledChallenges,
      challengeCount: Math.min(challengeCount, enabledChallenges.length),
      challengeTimeoutMs: isUnlimited ? 600000 : challengeTimeout * 1000,
    }
    localStorage.setItem('liveness_challenge_config', JSON.stringify(config))
    console.log('Saved challenge config:', config)
    alert('✓ Challenge settings saved!')
  }

  const maxCount = enabledChallenges.length

  return (
    <div className="min-h-screen bg-canvas">
      <div className="max-w-4xl mx-auto px-8 py-12">
        {/* Header */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center">
              <MdTune className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-display-md text-ink font-normal">Challenge Settings</h1>
          </div>
          <p className="text-body">Configure liveness detection challenges and parameters</p>
        </div>

        {/* Challenge Types */}
        <div className="bg-canvas border border-hairline rounded-xl p-8 mb-6">
          <h2 className="text-title-md text-ink mb-4">Available Challenges</h2>
          <p className="text-body-sm text-body mb-6">
            Select which challenges will be available during liveness verification
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {CHALLENGE_OPTIONS.map(({ type, label, icon, description }) => {
              const active = enabledChallenges.includes(type)
              return (
                <button
                  key={type}
                  onClick={() => handleToggleChallenge(type)}
                  className={`flex items-start gap-4 p-4 rounded-xl border-2 transition-all text-left ${
                    active
                      ? 'border-primary bg-primary/5'
                      : 'border-hairline hover:border-primary/30 hover:bg-surface-soft'
                  }`}
                >
                  <div className={active ? 'text-primary' : 'text-muted'}>{icon}</div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-title-sm text-ink">{label}</span>
                      {active && (
                        <span className="px-2 py-0.5 bg-primary text-white text-xs font-semibold rounded-pill">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-caption text-body">{description}</p>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Challenge Count */}
        <div className="bg-canvas border border-hairline rounded-xl p-8 mb-6">
          <h2 className="text-title-md text-ink mb-4">Challenge Count</h2>
          <p className="text-body-sm text-body mb-6">
            Number of challenges to perform during verification
          </p>

          <div className="flex items-center gap-6">
            <div className="flex-1">
              <input
                type="range"
                min={1}
                max={maxCount}
                value={Math.min(challengeCount, maxCount)}
                onChange={e => setChallengeCount(Number(e.target.value))}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-caption text-muted mt-2">
                <span>1</span>
                <span>{maxCount}</span>
              </div>
            </div>
            <div className="text-center">
              <div className="text-display-sm text-primary font-normal">
                {Math.min(challengeCount, maxCount)}
              </div>
              <div className="text-caption text-muted">challenges</div>
            </div>
          </div>
        </div>

        {/* Timeout Settings */}
        <div className="bg-canvas border border-hairline rounded-xl p-8 mb-6">
          <h2 className="text-title-md text-ink mb-4">Timeout Settings</h2>
          <p className="text-body-sm text-body mb-6">
            Maximum time allowed per challenge
          </p>

          <div className="space-y-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isUnlimited}
                onChange={e => setIsUnlimited(e.target.checked)}
                className="w-5 h-5 accent-primary cursor-pointer"
              />
              <div>
                <div className="text-body-md text-ink font-semibold">Unlimited Timeout</div>
                <div className="text-caption text-body">No time limit for challenges</div>
              </div>
            </label>

            {!isUnlimited && (
              <div className="flex items-center gap-4 pt-4">
                <input
                  type="number"
                  min="1"
                  max="60"
                  step="0.5"
                  value={challengeTimeout}
                  onChange={e => setChallengeTimeout(Number(e.target.value))}
                  className="w-32 px-4 py-2 border border-hairline rounded-lg text-ink focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
                <span className="text-body">seconds per challenge</span>
              </div>
            )}
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end gap-3">
          <button
            onClick={() => window.history.back()}
            className="px-6 py-3 bg-surface-strong hover:bg-hairline text-ink rounded-pill font-semibold transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-6 py-3 bg-primary hover:bg-primary-active text-white rounded-pill font-semibold transition-colors"
          >
            Save Settings
          </button>
        </div>
      </div>
    </div>
  )
}
