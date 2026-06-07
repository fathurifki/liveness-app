import type {
  LivenessCheckResult,
  AntiSpoofResult,
  ChallengeResult,
  QualityCheckResult,
  LivenessEngineConfig,
} from '../core/types'

/**
 * Score Aggregator
 * Menggabungkan semua sinyal menjadi score final 0–100
 *
 * Weight:
 * - antiSpoof:  40%   (turun dari 45%)
 * - challenges: 45%   (naik dari 35%) ← user effort lebih dihargai
 * - quality:    15%   (turun dari 20%)
 */

export function aggregateScore(
  antiSpoof: AntiSpoofResult,
  challenges: ChallengeResult[],
  quality: QualityCheckResult,
  config: LivenessEngineConfig,
  sessionId: string
): LivenessCheckResult {
  // Calculate individual scores
  const antiSpoofScore = antiSpoof.isReal ? antiSpoof.score * 100 : Math.min(antiSpoof.score * 100, 40)

  const allChallengesPassed = challenges.length > 0 && challenges.every(c => c.passed)
  const challengeScore = allChallengesPassed
    ? 100
    : challenges.length > 0
      ? (challenges.filter(c => c.passed).length / challenges.length) * 100
      : 0

  const qualityScore = quality.passed ? 100 : Math.min(quality.brightness / 2, 50)

  // Weighted aggregate
  const finalScore =
    antiSpoofScore * 0.40 +
    challengeScore * 0.45 +
    qualityScore * 0.15

  // Determine pass/fail
  const meetsThreshold = finalScore >= config.passScore
  const passed = meetsThreshold && antiSpoof.isReal && allChallengesPassed

  // Determine fail reason if failed
  let failReason = undefined
  if (!passed) {
    if (!antiSpoof.isReal) {
      failReason = 'spoof_detected' as const
    } else if (!allChallengesPassed) {
      failReason = 'challenge_failed' as const
    } else if (!quality.passed) {
      failReason = quality.failReason
    }
  }

  return {
    status: passed ? 'passed' : 'failed',
    score: Math.round(finalScore * 100) / 100, // round to 2 decimals
    antiSpoof,
    challengesPassed: challenges,
    quality,
    failReason,
    sessionId,
    timestamp: Date.now(),
  }
}
