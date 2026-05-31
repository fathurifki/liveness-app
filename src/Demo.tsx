import { useState } from 'react'
import { LivenessCamera } from './components/LivenessCamera'
import { LivenessCameraModern } from './components/LivenessCameraModern'
import type { LivenessCheckResult } from './core/types'

type DemoMode = 'original' | 'modern' | 'comparison'

export function Demo() {
  const [mode, setMode] = useState<DemoMode>('modern')
  const [result, setResult] = useState<LivenessCheckResult | null>(null)
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null)

  const handleResult = (res: LivenessCheckResult) => {
    setResult(res)
    console.log('Verification Result:', res)
  }

  const handleCapture = (photo: string, _res: LivenessCheckResult) => {
    setCapturedPhoto(photo)
    console.log('Photo captured:', photo.substring(0, 50) + '...')
  }

  return (
    <div className="min-h-screen bg-canvas py-12 px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-display-lg text-ink mb-4">
            Face Liveness SDK
          </h1>
          <p className="text-body-md text-body mb-8">
            Production-ready face liveness detection with MediaPipe + ONNX
          </p>

          {/* Mode Selector */}
          <div className="inline-flex rounded-pill bg-surface-strong p-1">
            <button
              onClick={() => setMode('modern')}
              className={`px-6 py-3 rounded-pill font-semibold transition-colors ${
                mode === 'modern'
                  ? 'bg-primary text-on-primary'
                  : 'text-body hover:text-ink'
              }`}
            >
              Modern UI
            </button>
            <button
              onClick={() => setMode('original')}
              className={`px-6 py-3 rounded-pill font-semibold transition-colors ${
                mode === 'original'
                  ? 'bg-primary text-on-primary'
                  : 'text-body hover:text-ink'
              }`}
            >
              Original UI
            </button>
            <button
              onClick={() => setMode('comparison')}
              className={`px-6 py-3 rounded-pill font-semibold transition-colors ${
                mode === 'comparison'
                  ? 'bg-primary text-on-primary'
                  : 'text-body hover:text-ink'
              }`}
            >
              Side by Side
            </button>
          </div>
        </div>

        {/* Demo Content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Camera Component(s) */}
          <div className={mode === 'comparison' ? 'lg:col-span-2' : ''}>
            {mode === 'modern' && (
              <LivenessCameraModern
                onResult={handleResult}
                onCapture={handleCapture}
                config={{
                  challengeCount: 2,
                  passScore: 70,
                }}
                labels={{
                  title: 'Face Verification',
                  subtitle: 'Position your face within the frame',
                  startButton: 'Start Verification',
                  retryButton: 'Try Again',
                }}
              />
            )}

            {mode === 'original' && (
              <div className="max-w-md mx-auto">
                <LivenessCamera
                  onResult={handleResult}
                  onCapture={handleCapture}
                  config={{
                    challengeCount: 2,
                    passScore: 70,
                  }}
                />
              </div>
            )}

            {mode === 'comparison' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div>
                  <h3 className="text-title-lg text-ink mb-4 text-center">
                    Modern UI
                  </h3>
                  <LivenessCameraModern
                    onResult={handleResult}
                    onCapture={handleCapture}
                    config={{
                      challengeCount: 2,
                      passScore: 70,
                    }}
                  />
                </div>
                <div>
                  <h3 className="text-title-lg text-ink mb-4 text-center">
                    Original UI
                  </h3>
                  <LivenessCamera
                    onResult={handleResult}
                    onCapture={handleCapture}
                    config={{
                      challengeCount: 2,
                      passScore: 70,
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Results Panel */}
          <div className={mode === 'comparison' ? 'lg:col-span-2' : ''}>
            <div className="bg-canvas border border-hairline rounded-xl p-8">
              <h2 className="text-title-lg text-ink mb-6">
                Verification Results
              </h2>

              {!result ? (
                <div className="text-center py-12">
                  <svg
                    className="w-16 h-16 text-muted mx-auto mb-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  <p className="text-body">
                    No verification results yet. Start a verification to see results here.
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Status Badge */}
                  <div className="flex items-center justify-between">
                    <span className="text-body font-semibold">
                      Status
                    </span>
                    <span
                      className={`px-4 py-2 rounded-pill font-semibold ${
                        result.status === 'passed'
                          ? 'bg-semantic-up text-white'
                          : 'bg-semantic-down text-white'
                      }`}
                    >
                      {result.status.toUpperCase()}
                    </span>
                  </div>

                  {/* Score */}
                  <div className="flex items-center justify-between">
                    <span className="text-body font-semibold">
                      Score
                    </span>
                    <div className="flex items-center gap-3">
                      <div className="w-32 h-3 bg-surface-strong rounded-pill overflow-hidden">
                        <div
                          className={`h-full rounded-pill transition-all duration-500 ${
                            result.score >= 70
                              ? 'bg-semantic-up'
                              : 'bg-semantic-down'
                          }`}
                          style={{ width: `${result.score}%` }}
                        />
                      </div>
                      <span className="text-title-lg text-ink">
                        {result.score}
                      </span>
                    </div>
                  </div>

                  {/* Anti-Spoof */}
                  <div className="flex items-center justify-between">
                    <span className="text-body font-semibold">
                      Anti-Spoof
                    </span>
                    <div className="text-right">
                      <div
                        className={`inline-block px-3 py-1 rounded-pill text-sm font-semibold ${
                          result.antiSpoof.isReal
                            ? 'bg-semantic-up text-white'
                            : 'bg-semantic-down text-white'
                        }`}
                      >
                        {result.antiSpoof.isReal ? 'Real Face' : 'Spoof Detected'}
                      </div>
                      <p className="text-caption text-muted mt-1">
                        Score: {(result.antiSpoof.score * 100).toFixed(1)}% (
                        {result.antiSpoof.method})
                      </p>
                    </div>
                  </div>

                  {/* Challenges */}
                  <div>
                    <span className="text-body font-semibold mb-3 block">
                      Challenges
                    </span>
                    <div className="space-y-2">
                      {result.challengesPassed.map((challenge, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between bg-surface-soft rounded-xl p-3"
                        >
                          <span className="text-ink font-semibold capitalize">
                            {challenge.type.replace('_', ' ')}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-muted">
                              {challenge.duration}ms
                            </span>
                            <span
                              className={`w-6 h-6 rounded-full flex items-center justify-center ${
                                challenge.passed
                                  ? 'bg-semantic-up text-white'
                                  : 'bg-semantic-down text-white'
                              }`}
                            >
                              {challenge.passed ? '✓' : '✗'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Quality */}
                  <div>
                    <span className="text-body font-semibold mb-3 block">
                      Quality Metrics
                    </span>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-surface-soft rounded-xl p-3 text-center">
                        <p className="text-caption text-muted mb-1">
                          Brightness
                        </p>
                        <p className="text-title-md text-ink">
                          {result.quality.brightness.toFixed(0)}
                        </p>
                      </div>
                      <div className="bg-surface-soft rounded-xl p-3 text-center">
                        <p className="text-caption text-muted mb-1">
                          Sharpness
                        </p>
                        <p className="text-title-md text-ink">
                          {result.quality.blurScore.toFixed(0)}
                        </p>
                      </div>
                      <div className="bg-surface-soft rounded-xl p-3 text-center">
                        <p className="text-caption text-muted mb-1">
                          Face Size
                        </p>
                        <p className="text-title-md text-ink">
                          {(result.quality.faceSize * 100).toFixed(0)}%
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Fail Reason */}
                  {result.failReason && (
                    <div className="bg-surface-soft border border-semantic-down rounded-xl p-4">
                      <p className="text-sm font-semibold text-semantic-down">
                        Fail Reason: {result.failReason.replace('_', ' ')}
                      </p>
                    </div>
                  )}

                  {/* Captured Photo */}
                  {capturedPhoto && (
                    <div>
                      <span className="text-body font-semibold mb-3 block">
                        Captured Photo
                      </span>
                      <img
                        src={capturedPhoto}
                        alt="Captured face"
                        className="w-full rounded-xl border border-hairline"
                      />
                    </div>
                  )}

                  {/* Session Info */}
                  <div className="pt-4 border-t border-hairline">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted">
                        Session ID
                      </span>
                      <code className="text-ink font-mono text-caption">
                        {result.sessionId}
                      </code>
                    </div>
                    <div className="flex items-center justify-between text-sm mt-2">
                      <span className="text-muted">
                        Timestamp
                      </span>
                      <span className="text-ink text-caption">
                        {new Date(result.timestamp).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Features Section */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="bg-canvas border border-hairline rounded-xl p-8">
            <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center mb-4">
              <svg
                className="w-6 h-6 text-on-primary"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                />
              </svg>
            </div>
            <h3 className="text-title-md text-ink mb-2">
              Anti-Spoof Detection
            </h3>
            <p className="text-body-sm text-body">
              Advanced ONNX models detect photo attacks, video replay, and deepfakes
              with high accuracy.
            </p>
          </div>

          <div className="bg-canvas border border-hairline rounded-xl p-8">
            <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center mb-4">
              <svg
                className="w-6 h-6 text-on-primary"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
            </div>
            <h3 className="text-title-md text-ink mb-2">
              Real-time Processing
            </h3>
            <p className="text-body-sm text-body">
              MediaPipe FaceMesh provides 468 facial landmarks at 30+ FPS for smooth
              real-time detection.
            </p>
          </div>

          <div className="bg-canvas border border-hairline rounded-xl p-8">
            <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center mb-4">
              <svg
                className="w-6 h-6 text-on-primary"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
                />
              </svg>
            </div>
            <h3 className="text-title-md text-ink mb-2">
              Fully Customizable
            </h3>
            <p className="text-body-sm text-body">
              Configure challenges, thresholds, timeouts, and UI to match your
              security requirements.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
