import { useState } from 'react'
import { LivenessCamera } from './components/LivenessCamera'
import type { LivenessCheckResult } from './core/types'

/**
 * Example: Custom UI with Result Display
 */
export function ExampleWithResultDisplay() {
  const [result, setResult] = useState<LivenessCheckResult | null>(null)
  const [showCamera, setShowCamera] = useState(true)

  const handleResult = (res: LivenessCheckResult) => {
    setResult(res)
    setShowCamera(false)
  }

  const handleRetry = () => {
    setResult(null)
    setShowCamera(true)
  }

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      {showCamera ? (
        <LivenessCamera
          config={{
            challengeCount: 2,
            antiSpoofThreshold: 0.6,
            passScore: 70,
          }}
          onResult={handleResult}
        />
      ) : (
        <div className="flex flex-col items-center justify-center min-h-screen p-8">
          <div className="w-full max-w-md bg-canvas border border-hairline rounded-xl p-8">
            <h2 className="text-title-lg text-ink mb-6">
              Hasil Verifikasi
            </h2>

            {/* Status */}
            <div className="mb-6">
              <div
                className={`inline-flex items-center px-4 py-2 rounded-pill font-semibold ${
                  result?.status === 'passed'
                    ? 'bg-semantic-up text-white'
                    : 'bg-semantic-down text-white'
                }`}
              >
                {result?.status === 'passed' ? '✓ LULUS' : '✗ GAGAL'}
              </div>
            </div>

            {/* Score */}
            <div className="mb-4">
              <p className="text-body-sm text-muted mb-1">Score</p>
              <p className="text-display-sm text-ink">{result?.score.toFixed(2)}</p>
            </div>

            {/* Details */}
            <div className="space-y-3 mb-6">
              <div>
                <p className="text-body-sm text-muted">Anti-Spoof</p>
                <p className="text-body-md text-ink">
                  {result?.antiSpoof.isReal ? '✓ Real Face' : '✗ Fake Detected'} (
                  {((result?.antiSpoof.score ?? 0) * 100).toFixed(1)}%)
                </p>
              </div>

              <div>
                <p className="text-body-sm text-muted">Challenges</p>
                <div className="space-y-1">
                  {result?.challengesPassed.map((ch, idx) => (
                    <p key={idx} className="text-body-sm text-ink">
                      {ch.passed ? '✓' : '✗'} {ch.type} ({ch.duration}ms)
                    </p>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-body-sm text-muted">Quality</p>
                <p className="text-body-md text-ink">
                  Brightness: {result?.quality.brightness.toFixed(0)} | Blur:{' '}
                  {result?.quality.blurScore.toFixed(0)} | Face Size:{' '}
                  {((result?.quality.faceSize ?? 0) * 100).toFixed(1)}%
                </p>
              </div>

              {result?.failReason && (
                <div>
                  <p className="text-body-sm text-muted">Fail Reason</p>
                  <p className="text-body-md text-semantic-down">{result.failReason}</p>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={handleRetry}
                className="flex-1 px-6 py-3 bg-primary hover:bg-primary-active text-on-primary rounded-pill font-semibold transition-colors"
              >
                Coba Lagi
              </button>
              {result?.status === 'passed' && (
                <button
                  onClick={() => alert('Lanjut ke step berikutnya')}
                  className="flex-1 px-6 py-3 bg-semantic-up hover:opacity-90 text-white rounded-pill font-semibold transition-colors"
                >
                  Lanjutkan
                </button>
              )}
            </div>

            {/* Session Info */}
            <div className="mt-4 pt-4 border-t border-hairline">
              <p className="text-caption text-muted">
                Session ID: {result?.sessionId}
              </p>
              <p className="text-caption text-muted">
                Timestamp: {new Date(result?.timestamp || 0).toLocaleString('id-ID')}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Example: Strict Configuration (High Security)
 */
export function ExampleStrictMode() {
  return (
    <LivenessCamera
      config={{
        challengeCount: 3,           // 3 challenges
        antiSpoofThreshold: 0.75,    // Stricter threshold
        passScore: 80,               // Higher minimum score
        minBrightness: 50,           // Stricter lighting
        minBlurScore: 100,           // Sharper image required
        challengeTimeoutMs: 10000,   // More time per challenge
      }}
      onResult={(result) => {
        console.log('Strict mode result:', result)
      }}
    />
  )
}

/**
 * Example: Lenient Configuration (Better UX)
 */
export function ExampleLenientMode() {
  return (
    <LivenessCamera
      config={{
        challengeCount: 1,           // Only 1 challenge
        antiSpoofThreshold: 0.5,     // More lenient
        passScore: 60,               // Lower minimum score
        minBrightness: 30,           // Accept darker conditions
        minBlurScore: 60,            // Accept more blur
        challengeTimeoutMs: 12000,   // More time
      }}
      onResult={(result) => {
        console.log('Lenient mode result:', result)
      }}
    />
  )
}

/**
 * Example: Server-side Validation
 */
export function ExampleServerValidation() {
  const handleResult = async (result: LivenessCheckResult) => {
    if (result.status === 'passed') {
      try {
        // Send to server for validation
        const response = await fetch('/api/verify-liveness', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer YOUR_TOKEN',
          },
          body: JSON.stringify({
            sessionId: result.sessionId,
            score: result.score,
            timestamp: result.timestamp,
            antiSpoof: result.antiSpoof,
            challenges: result.challengesPassed,
          }),
        })

        const serverResult = await response.json()

        if (serverResult.verified) {
          console.log('✅ Server verified!')
          // Proceed to next step
        } else {
          console.log('❌ Server rejected')
          // Show error
        }
      } catch (error) {
        console.error('Server validation error:', error)
      }
    }
  }

  return <LivenessCamera onResult={handleResult} />
}

/**
 * Example: Multi-step Flow
 */
export function ExampleMultiStepFlow() {
  const [step, setStep] = useState<'intro' | 'liveness' | 'success'>('intro')

  return (
    <div className="min-h-screen bg-canvas">
      {step === 'intro' && (
        <div className="flex flex-col items-center justify-center min-h-screen p-8">
          <div className="w-full max-w-md text-center">
            <h1 className="text-display-md text-ink mb-4">
              Verifikasi Identitas
            </h1>
            <p className="text-body-md text-body mb-8">
              Kami perlu memverifikasi bahwa Anda adalah orang yang sebenarnya.
              Proses ini hanya memakan waktu beberapa detik.
            </p>
            <button
              onClick={() => setStep('liveness')}
              className="px-8 py-3 bg-primary hover:bg-primary-active text-on-primary rounded-pill font-semibold transition-colors"
            >
              Mulai Verifikasi
            </button>
          </div>
        </div>
      )}

      {step === 'liveness' && (
        <LivenessCamera
          onResult={(result) => {
            if (result.status === 'passed') {
              setStep('success')
            }
          }}
        />
      )}

      {step === 'success' && (
        <div className="flex flex-col items-center justify-center min-h-screen p-8">
          <div className="w-full max-w-md text-center">
            <div className="w-24 h-24 bg-semantic-up rounded-full flex items-center justify-center mx-auto mb-6">
              <svg
                className="w-12 h-12 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h1 className="text-display-md text-ink mb-4">
              Verifikasi Berhasil!
            </h1>
            <p className="text-body-md text-body mb-8">
              Identitas Anda telah diverifikasi. Anda dapat melanjutkan ke langkah
              berikutnya.
            </p>
            <button
              onClick={() => alert('Lanjut ke dashboard')}
              className="px-8 py-3 bg-primary hover:bg-primary-active text-on-primary rounded-pill font-semibold transition-colors"
            >
              Lanjutkan
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
