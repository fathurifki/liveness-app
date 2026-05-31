import { useState, useEffect, useRef, useCallback } from 'react'
import { useLiveness } from '../hooks/useLiveness'
import { DEFAULT_CONFIG } from '../core/types'
import { normalizeEnabledChallenges } from '../utils/challengeDetector'
import type {
  LivenessCheckResult,
  LivenessEngineConfig,
  ChallengeType,
} from '../core/types'

// ============================================================================
// Types
// ============================================================================

export interface LivenessCameraProps {
  /** Partial configuration to override defaults */
  config?: Partial<LivenessEngineConfig>
  /** Callback when verification completes (passed or failed) */
  onResult?: (result: LivenessCheckResult) => void
  /** Callback when verification passes with captured photo */
  onCapture?: (photo: string, result: LivenessCheckResult) => void
  /** Custom theme colors */
  theme?: {
    primary?: string
    success?: string
    error?: string
    warning?: string
  }
  /** Show/hide settings button */
  showSettings?: boolean
  /** Custom labels for internationalization */
  labels?: {
    title?: string
    subtitle?: string
    startButton?: string
    retryButton?: string
    passedMessage?: string
    failedMessage?: string
  }
}

interface ChallengeOption {
  type: ChallengeType
  label: string
  icon: string
}

// ============================================================================
// Constants
// ============================================================================

const CHALLENGE_OPTIONS: ChallengeOption[] = [
  { type: 'blink', label: 'Blink', icon: '👁️' },
  { type: 'nod_top', label: 'Nod Up', icon: '⬆️' },
  { type: 'nod_bottom', label: 'Nod Down', icon: '⬇️' },
  { type: 'yaw_left', label: 'Yaw Left', icon: '⬅️' },
  { type: 'yaw_right', label: 'Yaw Right', icon: '➡️' },
  { type: 'smile', label: 'Smile', icon: '😊' },
  { type: 'open_mouth', label: 'Open Mouth', icon: '😮' },
  { type: 'gaze_target', label: 'Look at Point', icon: '🎯' },
]

// const DEFAULT_THEME = {
//   primary: '#3b82f6',
//   success: '#10b981',
//   error: '#ef4444',
//   warning: '#f59e0b',
// }

const DEFAULT_LABELS = {
  title: 'Face Verification',
  subtitle: 'Position your face within the frame',
  startButton: 'Start Verification',
  retryButton: 'Try Again',
  passedMessage: 'Verification Successful',
  failedMessage: 'Verification Failed',
}

// ============================================================================
// Component
// ============================================================================

export function LivenessCameraModern({
  config: configProp,
  onResult,
  onCapture,
  // theme: themeProp,
  showSettings = true,
  labels: labelsProp,
}: LivenessCameraProps) {
  // const _theme = { ...DEFAULT_THEME, ...themeProp }
  const labels = { ...DEFAULT_LABELS, ...labelsProp }
  const baseConfig = { ...DEFAULT_CONFIG, ...configProp }

  // ── State ──────────────────────────────────────────────────────────────
  const [enabledChallenges, setEnabledChallenges] = useState<ChallengeType[]>(
    () => normalizeEnabledChallenges(baseConfig.enabledChallenges),
  )
  const [challengeCount, setChallengeCount] = useState(baseConfig.challengeCount)
  const [showSettingsPanel, setShowSettingsPanel] = useState(false)

  // ── Liveness Hook ──────────────────────────────────────────────────────
  const mergedConfig: Partial<LivenessEngineConfig> = {
    ...configProp,
    enabledChallenges,
    challengeCount: Math.min(challengeCount, enabledChallenges.length),
  }

  const latestResultRef = useRef<LivenessCheckResult | null>(null)

  const handleResult = useCallback(
    (result: LivenessCheckResult) => {
      latestResultRef.current = result
      onResult?.(result)
    },
    [onResult]
  )

  const {
    status,
    videoRef,
    canvasRef,
    currentChallenge,
    challengeProgress,
    qualityWarning,
    start,
    reset,
  } = useLiveness({
    config: mergedConfig,
    onResult: handleResult,
  })

  // ── Capture Screenshot ─────────────────────────────────────────────────
  useEffect(() => {
    if (status !== 'passed' && status !== 'failed') return
    const video = videoRef.current
    const result = latestResultRef.current
    if (!video || !result || video.videoWidth === 0) return

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Mirror to match displayed video
    ctx.translate(canvas.width, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(video, 0, 0)
    const screenshot = canvas.toDataURL('image/jpeg', 0.9)

    if (status === 'passed' && onCapture) {
      onCapture(screenshot, result)
    }
  }, [status, videoRef, onCapture])

  // ── Handlers ───────────────────────────────────────────────────────────
  const handleToggleChallenge = (type: ChallengeType) => {
    setEnabledChallenges((prev) => {
      if (prev.includes(type)) {
        return prev.length === 1 ? prev : prev.filter((t) => t !== type)
      }
      return [...prev, type]
    })
  }

  const handleStart = () => {
    setShowSettingsPanel(false)
    start()
  }

  // ── Status Messages ────────────────────────────────────────────────────
  const getStatusMessage = () => {
    switch (status) {
      case 'idle':
        return 'Ready to start verification'
      case 'initializing':
        return 'Loading models...'
      case 'ready':
        return 'Position your face in the frame'
      case 'detecting':
        return 'Detecting face...'
      case 'challenge':
        return currentChallenge?.instruction ?? 'Follow the instruction'
      case 'processing':
        return 'Analyzing...'
      case 'passed':
        return labels.passedMessage
      case 'failed':
        return labels.failedMessage
      default:
        return ''
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="relative w-full max-w-md mx-auto">
      {/* Header */}
      <div className="text-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          {labels.title}
        </h1>
        <p className="text-gray-600 dark:text-gray-400 text-sm">
          {getStatusMessage()}
        </p>
      </div>

      {/* Camera Container */}
      <div className="relative bg-gradient-to-br from-gray-900 to-gray-800 rounded-3xl overflow-hidden shadow-2xl aspect-[3/4]">
        {/* Settings Button */}
        {showSettings && (
          <button
            onClick={() => setShowSettingsPanel(!showSettingsPanel)}
            className="absolute top-4 right-4 z-20 w-10 h-10 bg-black/50 hover:bg-black/70 backdrop-blur-sm rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110"
            aria-label="Settings"
          >
            <svg
              className="w-5 h-5 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </button>
        )}

        {/* Idle State */}
        {status === 'idle' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 p-8">
            <div className="w-32 h-32 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-xl">
              <svg
                className="w-16 h-16 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
            </div>
            <p className="text-gray-400 text-center max-w-xs">
              {labels.subtitle}
            </p>
            <button
              onClick={handleStart}
              className="px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-2xl font-semibold text-lg shadow-lg transition-all duration-200 hover:scale-105 hover:shadow-xl"
            >
              {labels.startButton}
            </button>
          </div>
        )}

        {/* Loading State */}
        {(status === 'initializing' || status === 'processing') && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
            <div className="relative w-16 h-16">
              <div className="absolute inset-0 border-4 border-blue-500/30 rounded-full" />
              <div className="absolute inset-0 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
            <p className="text-white text-sm font-medium">
              {status === 'initializing' ? 'Loading models...' : 'Analyzing...'}
            </p>
          </div>
        )}

        {/* Video Stream */}
        <video
          ref={videoRef}
          className={`absolute inset-0 w-full h-full object-cover scale-x-[-1] ${
            status === 'ready' || status === 'detecting' || status === 'challenge'
              ? 'block'
              : 'hidden'
          }`}
          playsInline
          muted
          autoPlay
        />

        {/* Active Session Overlays */}
        {(status === 'ready' || status === 'detecting' || status === 'challenge') && (
          <>
            {/* Face Oval Guide */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="relative w-64 h-80">
                <div className="absolute inset-0 border-4 border-white/60 rounded-[50%] shadow-lg" />
                <div className="absolute inset-0 border-4 border-blue-500/40 rounded-[50%] animate-pulse" />
              </div>
            </div>

            {/* Gaze Target */}
            {status === 'challenge' &&
              currentChallenge?.type === 'gaze_target' &&
              currentChallenge.gazeTarget && (
                <div
                  className="absolute w-8 h-8 rounded-full bg-gradient-to-br from-red-500 to-pink-500 border-4 border-white shadow-xl animate-pulse pointer-events-none"
                  style={{
                    left: `${currentChallenge.gazeTarget.x * 100}%`,
                    top: `${currentChallenge.gazeTarget.y * 100}%`,
                    transform: 'translate(-50%, -50%)',
                  }}
                />
              )}

            {/* Quality Warning */}
            {qualityWarning && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-yellow-500 text-black px-4 py-2 rounded-xl text-sm font-semibold shadow-lg animate-bounce">
                ⚠️ {qualityWarning}
              </div>
            )}

            {/* Challenge Card */}
            {status === 'challenge' && currentChallenge && (
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-11/12 max-w-sm">
                <div className="bg-white/95 backdrop-blur-sm rounded-2xl p-5 shadow-2xl">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-lg font-bold text-gray-900">
                      {currentChallenge.instruction}
                    </p>
                    <span className="text-3xl">
                      {CHALLENGE_OPTIONS.find((o) => o.type === currentChallenge.type)
                        ?.icon}
                    </span>
                  </div>
                  <div className="relative w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                    <div
                      className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full transition-all duration-100"
                      style={{ width: `${challengeProgress}%` }}
                    />
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Success State */}
        {status === 'passed' && (
          <div className="absolute inset-0 bg-gradient-to-br from-green-500 to-emerald-600 flex flex-col items-center justify-center gap-4">
            <div className="w-24 h-24 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <svg
                className="w-16 h-16 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={3}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <p className="text-white text-3xl font-bold tracking-wide">
              {labels.passedMessage}
            </p>
            <button
              onClick={reset}
              className="mt-4 px-8 py-3 bg-white text-green-600 rounded-2xl font-semibold hover:bg-gray-100 transition-all duration-200 hover:scale-105 shadow-lg"
            >
              {labels.retryButton}
            </button>
          </div>
        )}

        {/* Failed State */}
        {status === 'failed' && (
          <div className="absolute inset-0 bg-gradient-to-br from-red-500 to-rose-600 flex flex-col items-center justify-center gap-4">
            <div className="w-24 h-24 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <svg
                className="w-16 h-16 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={3}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </div>
            <p className="text-white text-3xl font-bold">{labels.failedMessage}</p>
            <button
              onClick={reset}
              className="mt-4 px-8 py-3 bg-white text-red-600 rounded-2xl font-semibold hover:bg-gray-100 transition-all duration-200 hover:scale-105 shadow-lg"
            >
              {labels.retryButton}
            </button>
          </div>
        )}

        {/* Hidden Canvas */}
        <canvas ref={canvasRef} className="hidden" />
      </div>

      {/* Status Indicator */}
      <div className="flex items-center justify-center gap-3 mt-6">
        <div
          className={`w-3 h-3 rounded-full transition-all duration-300 ${
            status === 'idle' || status === 'failed'
              ? 'bg-gray-400'
              : status === 'passed'
              ? 'bg-green-500 shadow-lg shadow-green-500/50'
              : 'bg-blue-500 animate-pulse shadow-lg shadow-blue-500/50'
          }`}
        />
        <p className="text-gray-600 dark:text-gray-400 text-sm font-medium">
          {status === 'idle' && 'Not Started'}
          {status === 'initializing' && 'Initializing...'}
          {status === 'ready' && 'Ready'}
          {status === 'detecting' && 'Detecting...'}
          {status === 'challenge' && 'Challenge Active'}
          {status === 'processing' && 'Processing...'}
          {status === 'passed' && 'Passed'}
          {status === 'failed' && 'Failed'}
        </p>
      </div>

      {/* Settings Panel */}
      {showSettingsPanel && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowSettingsPanel(false)}
          />

          {/* Panel */}
          <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 max-w-md mx-auto bg-white dark:bg-gray-800 rounded-3xl shadow-2xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                Settings
              </h3>
              <button
                onClick={() => setShowSettingsPanel(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <svg
                  className="w-5 h-5 text-gray-600 dark:text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* Challenge Types */}
            <div className="mb-6">
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                Challenge Types
              </p>
              <div className="grid grid-cols-3 gap-2">
                {CHALLENGE_OPTIONS.map(({ type, label, icon }) => {
                  const active = enabledChallenges.includes(type)
                  return (
                    <button
                      key={type}
                      onClick={() => handleToggleChallenge(type)}
                      className={`flex flex-col items-center gap-2 rounded-xl py-3 text-xs font-medium transition-all duration-200 ${
                        active
                          ? 'bg-gradient-to-br from-blue-500 to-purple-600 text-white shadow-lg scale-105'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                      }`}
                    >
                      <span className="text-2xl">{icon}</span>
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Challenge Count */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  Number of Challenges
                </p>
                <span className="text-lg font-bold text-blue-600">
                  {Math.min(challengeCount, enabledChallenges.length)}
                </span>
              </div>
              <input
                type="range"
                min={1}
                max={enabledChallenges.length}
                value={Math.min(challengeCount, enabledChallenges.length)}
                onChange={(e) => setChallengeCount(Number(e.target.value))}
                className="w-full accent-blue-600"
              />
            </div>

            {/* Start Button */}
            <button
              onClick={handleStart}
              className="w-full py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-2xl font-semibold transition-all duration-200 hover:scale-105 shadow-lg"
            >
              Start Verification
            </button>
          </div>
        </>
      )}
    </div>
  )
}
