import { useRef, useCallback, useState, useEffect } from 'react'
import type {
  LivenessStatus,
  LivenessEngineConfig,
  LivenessCheckResult,
  Challenge,
  ChallengeType,
  ChallengeResult,
  AntiSpoofResult,
  QualityCheckResult,
  FaceLandmark,
  DebugMetrics,
  DebugLogLevel,
} from '../core/types'
import { DEFAULT_CONFIG } from '../core/types'
import { initFaceLandmarker, detectFace, isReady, dispose } from '../adapters/mediapipeAdapter'
import { runQualityCheck, getQualityWarningMessage } from '../utils/qualityCheck'
import { AntiSpoofAnalyzer } from '../utils/antiSpoof'
import {
  initAntiSpoofModel,
  getAntiSpoofScore,
  isOnnxReady,
  disposeOnnxModel,
} from '../adapters/onnxAntiSpoofAdapter'
import {
  initChallengeModels,
  getEyeOpenProbability,
  getSmileProbability,
  isEyeStateReady,
  isSmileDetectReady,
  createBlinkOnnxState,
  updateBlinkFromEyeOnnx,
  disposeChallengeModels,
  type BlinkOnnxState,
} from '../adapters/onnxChallengeAdapter'
import {
  initHeadPoseModel,
  getHeadPoseAngles,
  isHeadPoseReady,
  disposeHeadPoseModel,
} from '../adapters/onnxHeadPoseAdapter'
import {
  generateChallenges,
  detectBlink,
  detectNodTop,
  detectNodBottom,
  detectYawLeft,
  detectYawRight,
  detectSmile,
  createNodState,
  createYawState,
  getPitchDelta,
  getYawDelta,
  isPoseChallenge,
  type NodChallengeState,
  type YawChallengeState,
  detectOpenMouth,
  detectGazeTarget,
  computeSmileMetrics,
  calculateEAR,
  calculateHeadPose,
  LEFT_EYE_INDICES,
  RIGHT_EYE_INDICES,
  NOD_STEP_RAD,
  NOD_TOP_THRESHOLD,
  NOD_BOTTOM_THRESHOLD,
  YAW_STEP_RAD,
  YAW_LEFT_THRESHOLD,
  YAW_RIGHT_THRESHOLD,
} from '../utils/challengeDetector'
import { aggregateScore } from '../utils/scoreAggregator'
import { nanoid } from '../utils/nanoid'

// ── Detection-based progress computation ──────────────────────────────────
// Landmark indices (mirroring challengeDetector.ts — not exported from there)
const MOUTH_TOP = 13
const MOUTH_BOTTOM = 14
const MOUTH_LEFT = 61
const MOUTH_RIGHT = 291
const MOUTH_OPEN_THRESHOLD = 0.28
const SMILE_CORNER_LIFT = 0.018

/**
 * Compute 0-100 detection progress for the current challenge based on
 * actual face measurements, NOT elapsed time. This prevents progress
 * from advancing when the user isn't performing the required action.
 */
function computeDetectionProgress(
  type: Challenge['type'],
  landmarks: FaceLandmark[],
  challengeState: Record<string, unknown>,
  nodState: NodChallengeState,
  yawState: YawChallengeState,
  headPoseAngles: { yaw: number; pitch: number; roll: number } | null,
  blinkOnnxState: BlinkOnnxState,
  smileOnnxState: boolean,
): number {
  switch (type) {
    case 'blink': {
      const s = challengeState?.blink as { blinkCount: number; lastBlink: number } | undefined
      const hBlink = s?.blinkCount ?? 0
      const oBlink = blinkOnnxState?.blinkCount ?? 0
      const total = Math.max(hBlink, oBlink)
      return Math.min(Math.round((total / 2) * 100), 100)
    }

    case 'nod_top':
    case 'nod_bottom': {
      const pitch =
        headPoseAngles?.pitch !== undefined
          ? headPoseAngles.pitch * 100
          : calculateHeadPose(landmarks).pitch
      const delta = getPitchDelta(pitch, nodState)
      if (delta === null) return 0
      const useOnnx = headPoseAngles?.pitch !== undefined
      const threshold = useOnnx ? NOD_STEP_RAD * 100 : (type === 'nod_top' ? NOD_TOP_THRESHOLD : NOD_BOTTOM_THRESHOLD)
      const ratio = Math.abs(delta) / threshold
      return Math.max(0, Math.min(Math.round(ratio * 100), 100))
    }

    case 'yaw_left':
    case 'yaw_right': {
      const yaw =
        headPoseAngles?.yaw !== undefined
          ? headPoseAngles.yaw * 100
          : calculateHeadPose(landmarks).yaw
      const delta = getYawDelta(yaw, yawState)
      if (delta === null) return 0
      const useOnnx = headPoseAngles?.yaw !== undefined
      const threshold = useOnnx ? YAW_STEP_RAD * 100 : (type === 'yaw_left' ? YAW_LEFT_THRESHOLD : YAW_RIGHT_THRESHOLD)
      const ratio = Math.abs(delta) / threshold
      return Math.max(0, Math.min(Math.round(ratio * 100), 100))
    }

    case 'smile': {
      // ONNX model says smiling → instant 100%
      if (smileOnnxState) return 100

      // Heuristic: corner lift vs threshold
      const isMouthOpen = (() => {
        const top = landmarks[MOUTH_TOP]
        const bottom = landmarks[MOUTH_BOTTOM]
        const left = landmarks[MOUTH_LEFT]
        const right = landmarks[MOUTH_RIGHT]
        if (!top || !bottom || !left || !right) return false
        const vertical = Math.abs(top.y - bottom.y)
        const horizontal = Math.abs(left.x - right.x)
        if (horizontal < 1e-5) return false
        return vertical / horizontal > MOUTH_OPEN_THRESHOLD
      })()
      if (isMouthOpen) return 0 // open mouth ≠ smile

      const metrics = computeSmileMetrics(landmarks)
      const lift = Math.max(0, metrics.leftLift, metrics.rightLift)
      const ratio = lift / SMILE_CORNER_LIFT
      return Math.max(0, Math.min(Math.round(ratio * 100), 100))
    }

    case 'open_mouth': {
      const top = landmarks[MOUTH_TOP]
      const bottom = landmarks[MOUTH_BOTTOM]
      const left = landmarks[MOUTH_LEFT]
      const right = landmarks[MOUTH_RIGHT]
      if (!top || !bottom || !left || !right) return 0
      const vertical = Math.abs(top.y - bottom.y)
      const horizontal = Math.abs(left.x - right.x)
      if (horizontal < 1e-5) return 0
      const mar = vertical / horizontal
      const ratio = mar / MOUTH_OPEN_THRESHOLD
      return Math.max(0, Math.min(Math.round(ratio * 100), 100))
    }

    case 'gaze_target':
      // Gaze is a single-step detection, show partial progress
      // to indicate system is processing, but never goes above 50
      // so it cannot "complete" without actual detection.
      return landmarks.length > 0 ? 45 : 0

    default:
      return 0
  }
}

/**
 * Options for the useLiveness hook
 */
export interface UseLivenessOptions {
  /** Partial configuration to override default settings */
  config?: Partial<LivenessEngineConfig>
  /** Callback invoked when verification completes (passed or failed) */
  onResult?: (result: LivenessCheckResult) => void
  /** Called every frame with debug metrics. Only active when debug=true. */
  onDebug?: (metrics: DebugMetrics) => void
  /** Called for nod/yaw (and other) timeline events in the Log tab */
  onDebugLog?: (message: string, level?: DebugLogLevel) => void
  /** Enable debug metrics collection (default: false) */
  debug?: boolean
  /** Called when a challenge is completed - provides challenge type and video element for screenshot */
  onChallengeComplete?: (challengeType: ChallengeType, videoElement: HTMLVideoElement) => void
}

/**
 * Return type for the useLiveness hook
 */
export interface UseLivenessReturn {
  /** Current status of the liveness detection process */
  status: LivenessStatus
  /** Ref to attach to the video element */
  videoRef: React.RefObject<HTMLVideoElement>
  /** Ref to attach to the canvas element (should be hidden) */
  canvasRef: React.RefObject<HTMLCanvasElement>
  /** Current active challenge, null if no challenge is active */
  currentChallenge: Challenge | null
  /** Progress of current challenge (0-100) */
  challengeProgress: number
  /** Number of completed challenges */
  completedChallenges: number
  /** Total number of challenges */
  totalChallenges: number
  /** Warning message about quality issues, null if no issues */
  qualityWarning: string | null
  /** Start the liveness detection process */
  start: () => Promise<void>
  /** Reset the state and prepare for a new verification */
  reset: () => void
  /** Callback when a challenge is completed - provides video element for screenshot */
  onChallengeComplete?: (challengeType: ChallengeType, videoElement: HTMLVideoElement) => void
}

/**
 * Main hook for face liveness detection
 *
 * This hook orchestrates the entire liveness detection flow:
 * 1. Initializes MediaPipe FaceLandmarker and ONNX models
 * 2. Starts camera stream
 * 3. Runs quality checks (brightness, blur, face size)
 * 4. Performs anti-spoof detection
 * 5. Executes random challenges (blink, nod, smile, etc.)
 * 6. Aggregates scores and returns final result
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { status, videoRef, canvasRef, start, reset } = useLiveness({
 *     config: { challengeCount: 2, passScore: 70 },
 *     onResult: (result) => {
 *       if (result.status === 'passed') {
 *         console.log('Verification passed!', result)
 *       }
 *     }
 *   })
 *
 *   return (
 *     <div>
 *       <video ref={videoRef} />
 *       <canvas ref={canvasRef} className="hidden" />
 *       {status === 'idle' && <button onClick={start}>Start</button>}
 *       {status === 'passed' && <button onClick={reset}>Try Again</button>}
 *     </div>
 *   )
 * }
 * ```
 *
 * @param options - Configuration options for the hook
 * @returns Object containing status, refs, and control functions
 */
export function useLiveness(options: UseLivenessOptions = {}): UseLivenessReturn {
  const config: LivenessEngineConfig = { ...DEFAULT_CONFIG, ...options.config }

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafIdRef = useRef<number | null>(null)
  const sessionIdRef = useRef<string>(nanoid())

  // State
  const [status, setStatus] = useState<LivenessStatus>('idle')
  const [currentChallenge, setCurrentChallenge] = useState<Challenge | null>(null)
  const [challengeProgress, setChallengeProgress] = useState<number>(0)
  const [completedChallenges, setCompletedChallenges] = useState<number>(0)
  const [totalChallenges, setTotalChallenges] = useState<number>(0)
  const [qualityWarning, setQualityWarning] = useState<string | null>(null)

  // Mutable state (useRef untuk menghindari stale closure di RAF loop)
  const challengesRef = useRef<Challenge[]>([])
  const challengeResultsRef = useRef<ChallengeResult[]>([])
  const currentChallengeIndexRef = useRef<number>(0)
  const antiSpoofRef = useRef<AntiSpoofAnalyzer>(new AntiSpoofAnalyzer())
  const qualityResultRef = useRef<QualityCheckResult | null>(null)
  // Latest ONNX score (updated asynchronously every N frames)
  const onnxScoreRef = useRef<number | null>(null)
  const onnxFrameCountRef = useRef<number>(0)
  const antiSpoofInferBusyRef = useRef(false)
  const eyeInferBusyRef = useRef(false)
  const smileInferBusyRef = useRef(false)
  const headPoseInferBusyRef = useRef(false)

  // Challenge state (per-challenge detector state)
  const challengeStateRef = useRef<Record<string, unknown>>({})
  const blinkOnnxRef = useRef<BlinkOnnxState>(createBlinkOnnxState())
  const smileOnnxRef = useRef(false)
  const nodChallengeRef = useRef<NodChallengeState>(createNodState())
  const yawChallengeRef = useRef<YawChallengeState>(createYawState())
  const headPoseAnglesRef = useRef<{ yaw: number; pitch: number; roll: number } | null>(null)
  const challengeFrameRef = useRef(0)
  /** Jumlah frame berkualitas (quality.passed) yang sudah diproses sejak sesi dimulai.
   *  Finalize tidak boleh dipanggil sebelum mencapai MIN_QUALITY_FRAMES. */
  const qualityFrameCountRef = useRef(0)
  const MIN_QUALITY_FRAMES = 60

  // Smile ONNX threshold: model range P[smile] ≈ 0.33–0.61 (random baseline ~0.41)
  // Diturunkan dari 0.48 → 0.38 karena real smile sering hanya 0.40-0.47
  // Threshold 0.38 → tepat di bawah P50, sehingga senyum nyata lebih mudah lolos
  const SMILE_ONNX_THRESHOLD = 0.38

  // Debug refs
  const debugRef = useRef<boolean>(options.debug ?? false)
  const onDebugRef = useRef(options.onDebug)
  const onDebugLogRef = useRef(options.onDebugLog)
  const frameCountRef = useRef(0)
  const lastLoggedNodPhaseRef = useRef<string | null>(null)
  const lastLoggedYawPhaseRef = useRef<string | null>(null)
  const poseLogFrameRef = useRef(0)
  const fpsTimestampsRef = useRef<number[]>([])
  const smileOnnxProbRef = useRef<number | null>(null)

  useEffect(() => {
    debugRef.current = options.debug ?? false
    onDebugRef.current = options.onDebug
    onDebugLogRef.current = options.onDebugLog
  }, [options.debug, options.onDebug, options.onDebugLog])

  const emitDebugLog = useCallback((message: string, level: DebugLogLevel = 'info') => {
    if (debugRef.current && onDebugLogRef.current) {
      onDebugLogRef.current(message, level)
    }
  }, [])

  const logNodYawProgress = useCallback(
    (
      challengeType: Challenge['type'] | null,
      pitch: number,
      yaw: number,
      onnxAngles: { yaw: number; pitch: number; roll: number } | null,
      passed: boolean,
    ) => {
      if (!challengeType || !isPoseChallenge(challengeType)) return

      poseLogFrameRef.current++

      if (challengeType === 'nod_top' || challengeType === 'nod_bottom') {
        const deltaLm = getPitchDelta(pitch, nodChallengeRef.current)
        const deltaOnnx = onnxAngles
          ? getPitchDelta(onnxAngles.pitch, nodChallengeRef.current)
          : null
        const label = challengeType === 'nod_top' ? 'atas' : 'bawah'

        if (poseLogFrameRef.current % 12 === 0) {
          emitDebugLog(
            `↕️ Nod ${label} pitch LM:${pitch.toFixed(1)} Δ${deltaLm !== null ? deltaLm.toFixed(2) : '…'} | ONNX Δ${deltaOnnx !== null ? deltaOnnx.toFixed(3) : 'N/A'} | lulus:${passed ? 'YA' : 'tidak'}`,
          )
        }
        return
      }

      const deltaLm = getYawDelta(yaw, yawChallengeRef.current)
      const deltaOnnx = onnxAngles ? getYawDelta(onnxAngles.yaw, yawChallengeRef.current) : null
      const label = challengeType === 'yaw_left' ? 'kiri' : 'kanan'

      if (poseLogFrameRef.current % 12 === 0) {
        emitDebugLog(
          `↔️ Yaw ${label} yaw LM:${yaw.toFixed(1)} Δ${deltaLm !== null ? deltaLm.toFixed(2) : '…'} | ONNX Δ${deltaOnnx !== null ? deltaOnnx.toFixed(3) : 'N/A'} | lulus:${passed ? 'YA' : 'tidak'}`,
        )
      }
    },
    [emitDebugLog],
  )

  const resetPoseDebugLog = useCallback(() => {
    lastLoggedNodPhaseRef.current = null
    lastLoggedYawPhaseRef.current = null
    poseLogFrameRef.current = 0
  }, [])


  const onChallengeTypeStarted = useCallback((type: Challenge['type']) => {
    if (type === 'nod_top') {
      resetPoseDebugLog()
      emitDebugLog('🎯 Challenge — angguk ke atas', 'info')
    } else if (type === 'nod_bottom') {
      resetPoseDebugLog()
      emitDebugLog('🎯 Challenge — angguk ke bawah', 'info')
    } else if (type === 'yaw_left') {
      resetPoseDebugLog()
      emitDebugLog('🎯 Challenge — menoleh ke kiri', 'info')
    } else if (type === 'yaw_right') {
      resetPoseDebugLog()
      emitDebugLog('🎯 Challenge — menoleh ke kanan', 'info')
    } else if (type === 'open_mouth') {
      emitDebugLog('🎯 Challenge — buka mulut (threshold MAR > 0.28)', 'info')
    }
  }, [emitDebugLog, resetPoseDebugLog])

  /**
   * Check current challenge
   */
  const checkChallenge = useCallback((landmarks: FaceLandmark[]): boolean => {
    const challenge = challengesRef.current[currentChallengeIndexRef.current]
    if (!challenge) return false

    const state = challengeStateRef.current

    switch (challenge.type) {
      case 'blink': {
        if (!state.blink) {
          state.blink = { blinkCount: 0, lastBlink: 0 }
        }
        const heuristicPass = detectBlink(
          landmarks,
          state.blink as { blinkCount: number; lastBlink: number },
        )
        const onnxPass = isEyeStateReady() && blinkOnnxRef.current.blinkCount >= 2
        return heuristicPass || onnxPass
      }

      case 'nod_top': {
        const onnxPitch = headPoseAnglesRef.current?.pitch
        return detectNodTop(landmarks, nodChallengeRef.current, onnxPitch)
      }

      case 'nod_bottom': {
        const onnxPitch = headPoseAnglesRef.current?.pitch
        return detectNodBottom(landmarks, nodChallengeRef.current, onnxPitch)
      }

      case 'yaw_left': {
        const onnxYaw = headPoseAnglesRef.current?.yaw
        return detectYawLeft(landmarks, yawChallengeRef.current, onnxYaw)
      }

      case 'yaw_right': {
        const onnxYaw = headPoseAnglesRef.current?.yaw
        return detectYawRight(landmarks, yawChallengeRef.current, onnxYaw)
      }

      case 'smile':
        return detectSmile(landmarks) || (isSmileDetectReady() && smileOnnxRef.current)

      case 'open_mouth':
        return detectOpenMouth(landmarks)

      case 'gaze_target': {
        const { x, y } = challenge.gazeTarget ?? { x: 0.5, y: 0.5 }
        return detectGazeTarget(landmarks, x, y)
      }

      default:
        return false
    }
  }, [])

  /**
   * Finalize liveness check
   * Guard: tidak diizinkan sebelum MIN_QUALITY_FRAMES frame berkualitas terkumpul.
   * Jika terlalu dini (misal HP di-scan cepat), loop tetap berjalan.
   */
  const finalize = useCallback(() => {
    if (qualityFrameCountRef.current < MIN_QUALITY_FRAMES) {
      // Belum cukup data — lanjutkan loop, jangan finalize dulu
      return
    }

    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current)
      rafIdRef.current = null
    }

    setStatus('processing')

    // Blend ONNX + heuristic (50/50) sehingga heuristic tetap berkontribusi
    // jika ONNX belum ready, pakai heuristic saja
    const heuristicScore = antiSpoofRef.current.getScore()
    const useOnnx = isOnnxReady() && onnxScoreRef.current !== null
    const spoofScore = useOnnx
      ? onnxScoreRef.current! * 0.8 + heuristicScore * 0.2
      : heuristicScore

    const antiSpoof: AntiSpoofResult = {
      isReal: spoofScore >= config.antiSpoofThreshold,
      score: spoofScore,
      method: useOnnx ? 'onnx' : 'heuristic',
    }

    // Aggregate final score
    const result = aggregateScore(
      antiSpoof,
      challengeResultsRef.current,
      qualityResultRef.current || { passed: false, brightness: 0, blurScore: 0, faceSize: 0 },
      config,
      sessionIdRef.current
    )

    setStatus(result.status)

    // Stop animation loop
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current)
      rafIdRef.current = null
    }

    // Callback
    if (options.onResult) {
      options.onResult(result)
    }
  }, [config, options])

  /**
   * RAF Detection Loop
   */
  const runDetectionLoop = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current

    if (!video || !canvas || !isReady()) {
      rafIdRef.current = requestAnimationFrame(runDetectionLoop)
      return
    }

    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) {
      rafIdRef.current = requestAnimationFrame(runDetectionLoop)
      return
    }

    // Detect face
    const timestamp = performance.now()
    const faceResult = detectFace(video, timestamp)

    if (!faceResult.detected) {
      setQualityWarning('Wajah tidak terdeteksi')
      rafIdRef.current = requestAnimationFrame(runDetectionLoop)
      return
    }

    // Get frame as ImageData
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    ctx.drawImage(video, 0, 0)
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)

    // Quality check — relax minFaceSize during nod/yaw challenges
    const currentChallenge = challengesRef.current[currentChallengeIndexRef.current]
    const isHeadMovementChallenge =
      currentChallenge?.type !== undefined && isPoseChallenge(currentChallenge.type)
    const adjustedConfig = isHeadMovementChallenge
      ? { ...config, minFaceSize: config.minFaceSize * 0.5 } // 50% of normal threshold (0.10 → 0.05)
      : config

    const quality = runQualityCheck(imageData, faceResult.boundingBox, adjustedConfig)
    qualityResultRef.current = quality

    // During head movement challenges, allow processing even if quality check fails due to face size
    const allowProcessing = quality.passed ||
      (isHeadMovementChallenge && quality.failReason === 'too_far')

    if (!allowProcessing) {
      setQualityWarning(getQualityWarningMessage(quality))
      rafIdRef.current = requestAnimationFrame(runDetectionLoop)
      return
    }

    // Show warning but continue processing during head movement
    if (!quality.passed && isHeadMovementChallenge) {
      setQualityWarning(null) // Don't show "too far" warning during head movement
    } else {
      setQualityWarning(null)
    }

    setQualityWarning(null)

    // Increment quality frame counter (dipakai sebagai guard minimum sebelum finalize)
    qualityFrameCountRef.current++

    // Feed frame into multi-signal anti-spoof analyzer
    antiSpoofRef.current.update(faceResult.landmarks, imageData, faceResult.boundingBox)

    // ONNX inference (async, fire-and-forget every 15 frames) — crop ke wajah dulu
    onnxFrameCountRef.current++
    if (
      isOnnxReady() &&
      onnxFrameCountRef.current % 15 === 0 &&
      !antiSpoofInferBusyRef.current
    ) {
      antiSpoofInferBusyRef.current = true
      getAntiSpoofScore(imageData, faceResult.boundingBox)
        .then((score) => {
          onnxScoreRef.current = score
        })
        .catch(() => {})
        .finally(() => {
          antiSpoofInferBusyRef.current = false
        })
    }

    // Challenge check
    const currentIndex = currentChallengeIndexRef.current
    const challenge = challengesRef.current[currentIndex]

    if (challenge) {
      challengeFrameRef.current++
      // Run head pose detection more frequently (every 3 frames instead of 6) for nod/yaw
      const isHeadPoseChallenge = isPoseChallenge(challenge.type)
      const shouldRunInference = isHeadPoseChallenge
        ? challengeFrameRef.current % 3 === 0
        : challengeFrameRef.current % 6 === 0

      if (shouldRunInference) {
        if (challenge.type === 'blink' && isEyeStateReady() && !eyeInferBusyRef.current) {
          eyeInferBusyRef.current = true
          getEyeOpenProbability(imageData, faceResult.landmarks)
            .then((probOpen) => {
              updateBlinkFromEyeOnnx(blinkOnnxRef.current, probOpen)
            })
            .finally(() => {
              eyeInferBusyRef.current = false
            })
        }
        if (challenge.type === 'smile' && isSmileDetectReady() && !smileInferBusyRef.current) {
          smileInferBusyRef.current = true
          getSmileProbability(imageData, faceResult.landmarks)
            .then((prob) => {
              smileOnnxProbRef.current = prob
              smileOnnxRef.current = prob >= SMILE_ONNX_THRESHOLD
            })
            .finally(() => {
              smileInferBusyRef.current = false
            })
        }
        if (isHeadPoseChallenge && isHeadPoseReady() && !headPoseInferBusyRef.current && faceResult.boundingBox) {
          headPoseInferBusyRef.current = true
          getHeadPoseAngles(imageData, faceResult.boundingBox)
            .then((angles) => {
              if (angles) headPoseAnglesRef.current = angles
            })
            .finally(() => {
              headPoseInferBusyRef.current = false
            })
        }
      }
      setStatus('challenge')

      // Update progress — based on actual detection, NOT elapsed time
      if (challenge.startTime) {
        const elapsed = Date.now() - challenge.startTime
        // Compute detection-based progress (0-100) from actual face measurements
        const detectionProgress = computeDetectionProgress(
          challenge.type,
          faceResult.landmarks,
          challengeStateRef.current,
          nodChallengeRef.current,
          yawChallengeRef.current,
          headPoseAnglesRef.current,
          blinkOnnxRef.current,
          smileOnnxRef.current,
        )
        setChallengeProgress(Math.max(0, detectionProgress))

        // Timeout check
        if (elapsed > challenge.timeoutMs) {
          const { pitch: timeoutPitch, yaw: timeoutYaw } = calculateHeadPose(faceResult.landmarks)
          if (challenge.type === 'nod_top' || challenge.type === 'nod_bottom') {
            emitDebugLog(
              `⏱️ Nod ${challenge.type === 'nod_top' ? 'atas' : 'bawah'} TIMEOUT — ΔLM:${getPitchDelta(timeoutPitch, nodChallengeRef.current)?.toFixed(2) ?? '—'}`,
              'fail',
            )
          } else if (challenge.type === 'yaw_left' || challenge.type === 'yaw_right') {
            emitDebugLog(
              `⏱️ Yaw ${challenge.type === 'yaw_left' ? 'kiri' : 'kanan'} TIMEOUT — ΔLM:${getYawDelta(timeoutYaw, yawChallengeRef.current)?.toFixed(2) ?? '—'}`,
              'fail',
            )
          }
          challengeResultsRef.current.push({
            type: challenge.type,
            passed: false,
            duration: elapsed,
          })

          // Move to next or finalize
          if (currentIndex < challengesRef.current.length - 1) {
            currentChallengeIndexRef.current++
            const nextChallenge = challengesRef.current[currentChallengeIndexRef.current]
            nextChallenge.startTime = Date.now()
            setCurrentChallenge(nextChallenge)
            setChallengeProgress(0)
            challengeStateRef.current = {}
            blinkOnnxRef.current = createBlinkOnnxState()
            smileOnnxRef.current = false
            nodChallengeRef.current = createNodState()
            yawChallengeRef.current = createYawState()
            headPoseAnglesRef.current = null
            challengeFrameRef.current = 0
            resetPoseDebugLog()
            onChallengeTypeStarted(nextChallenge.type)
          } else {
            // Finalize hanya jika sudah cukup frame — jika belum, loop terus berjalan
            finalize()
            // Jika finalize() return early (belum cukup frame), RAF akan lanjut di bawah
            if (qualityFrameCountRef.current < MIN_QUALITY_FRAMES) {
              rafIdRef.current = requestAnimationFrame(runDetectionLoop)
            }
            return
          }
        }
      } else {
        // Start challenge timer
        challenge.startTime = Date.now()
        setCurrentChallenge(challenge)
        blinkOnnxRef.current = createBlinkOnnxState()
        smileOnnxRef.current = false
        nodChallengeRef.current = createNodState()
        yawChallengeRef.current = createYawState()
        headPoseAnglesRef.current = null
        challengeFrameRef.current = 0
        resetPoseDebugLog()
        onChallengeTypeStarted(challenge.type)
      }

      // Check if challenge passed
      const passed = checkChallenge(faceResult.landmarks)

      if (passed) {
        const duration = Date.now() - (challenge.startTime || Date.now())
        if (challenge.type === 'nod_top') {
          emitDebugLog(`✅ Nod atas PASSED (${duration}ms)`, 'pass')
        } else if (challenge.type === 'nod_bottom') {
          emitDebugLog(`✅ Nod bawah PASSED (${duration}ms)`, 'pass')
        } else if (challenge.type === 'yaw_left') {
          emitDebugLog(`✅ Yaw kiri PASSED (${duration}ms)`, 'pass')
        } else if (challenge.type === 'yaw_right') {
          emitDebugLog(`✅ Yaw kanan PASSED (${duration}ms)`, 'pass')
        }
        challengeResultsRef.current.push({
          type: challenge.type,
          passed: true,
          duration,
        })

        // Increment completed challenges counter
        setCompletedChallenges(prev => prev + 1)

        // Notify parent component for screenshot capture
        if (options.onChallengeComplete && videoRef.current) {
          options.onChallengeComplete(challenge.type, videoRef.current)
        }

        // Move to next or finalize
        if (currentIndex < challengesRef.current.length - 1) {
          currentChallengeIndexRef.current++
          const nextChallenge = challengesRef.current[currentChallengeIndexRef.current]
          nextChallenge.startTime = Date.now()
          setCurrentChallenge(nextChallenge)
          setChallengeProgress(0)
          challengeStateRef.current = {}
          blinkOnnxRef.current = createBlinkOnnxState()
          smileOnnxRef.current = false
          nodChallengeRef.current = createNodState()
          yawChallengeRef.current = createYawState()
          headPoseAnglesRef.current = null
          challengeFrameRef.current = 0
          resetPoseDebugLog()
          onChallengeTypeStarted(nextChallenge.type)
        } else {
          // Finalize hanya jika sudah cukup frame
          finalize()
          if (qualityFrameCountRef.current < MIN_QUALITY_FRAMES) {
            rafIdRef.current = requestAnimationFrame(runDetectionLoop)
          }
          return
        }
      }
    }

    // ── Debug metrics ────────────────────────────────────────────────────────
    if (debugRef.current && onDebugRef.current) {
      frameCountRef.current++
      const now = performance.now()
      fpsTimestampsRef.current.push(now)
      fpsTimestampsRef.current = fpsTimestampsRef.current.filter(t => now - t < 1000)
      const fps = fpsTimestampsRef.current.length

      const lm = faceResult.landmarks
      const earL = calculateEAR(LEFT_EYE_INDICES, lm)
      const earR = calculateEAR(RIGHT_EYE_INDICES, lm)
      const { yaw, pitch } = calculateHeadPose(lm)
      const smileM = computeSmileMetrics(lm)
      const currentChallenge2 = challengesRef.current[currentChallengeIndexRef.current]
      const challengePassed = currentChallenge2 ? checkChallenge(lm) : false

      const poseType = currentChallenge2?.type
      const isNodPose = poseType === 'nod_top' || poseType === 'nod_bottom'
      const isYawPose = poseType === 'yaw_left' || poseType === 'yaw_right'
      const nodDeltaLm = isNodPose ? getPitchDelta(pitch, nodChallengeRef.current) : null
      const yawDeltaLm = isYawPose ? getYawDelta(yaw, yawChallengeRef.current) : null
      const onnxAngles = headPoseAnglesRef.current
      const nodDeltaOnnx =
        isNodPose && onnxAngles
          ? getPitchDelta(onnxAngles.pitch, nodChallengeRef.current)
          : null
      const yawDeltaOnnx =
        isYawPose && onnxAngles
          ? getYawDelta(onnxAngles.yaw, yawChallengeRef.current)
          : null

      onDebugRef.current({
        frameCount: frameCountRef.current,
        fps,
        brightness: quality.brightness,
        blurScore: quality.blurScore,
        faceSize: quality.faceSize,
        qualityPassed: quality.passed,
        earLeft: earL,
        earRight: earR,
        earAvg: (earL + earR) / 2,
        mar: smileM.mar,
        smileMidY: smileM.midY,
        smileLeftLift: smileM.leftLift,
        smileRightLift: smileM.rightLift,
        smileHeuristicPass: smileM.passed,
        smileOnnxProb: smileOnnxProbRef.current,
        smileOnnxPass: smileOnnxRef.current,
        yaw,
        pitch,
        headPoseYawOnnx: headPoseAnglesRef.current?.yaw ?? null,
        headPosePitchOnnx: headPoseAnglesRef.current?.pitch ?? null,
        headPoseRollOnnx: headPoseAnglesRef.current?.roll ?? null,
        nodPhase: isNodPose ? (poseType === 'nod_top' ? 'top' : 'bottom') : null,
        nodDeltaLm,
        nodDeltaOnnx,
        nodPass: isNodPose ? challengePassed : false,
        yawPhase: isYawPose ? (poseType === 'yaw_left' ? 'left' : 'right') : null,
        yawDeltaLm,
        yawDeltaOnnx,
        yawPass: isYawPose ? challengePassed : false,
        antiSpoofScore: isOnnxReady() && onnxScoreRef.current !== null
          ? onnxScoreRef.current! * 0.8 + antiSpoofRef.current.getScore() * 0.2
          : antiSpoofRef.current.getScore(),
        antiSpoofMethod: isOnnxReady() && onnxScoreRef.current !== null ? 'onnx' : 'heuristic',
        challengeType: currentChallenge2?.type ?? null,
        challengePassed,
      })

      if (currentChallenge2 && isPoseChallenge(currentChallenge2.type)) {
        logNodYawProgress(
          currentChallenge2.type,
          pitch,
          yaw,
          headPoseAnglesRef.current,
          challengePassed,
        )
      }

      // Log open_mouth progress
      if (currentChallenge2?.type === 'open_mouth' && challengeFrameRef.current % 12 === 0) {
        emitDebugLog(
          `👄 Open Mouth MAR:${smileM.mar.toFixed(3)} | threshold:0.28 | lulus:${challengePassed ? 'YA' : 'tidak'}`,
        )
      }
    }

    rafIdRef.current = requestAnimationFrame(runDetectionLoop)
  }, [config, checkChallenge, finalize, logNodYawProgress, emitDebugLog, onChallengeTypeStarted, resetPoseDebugLog])

  /**
   * Start liveness check
   */
  const start = useCallback(async () => {
    try {
      setStatus('initializing')

      // Initialize MediaPipe
      await initFaceLandmarker()

      // Attempt ONNX model load (non-blocking — falls back to heuristic if absent)
      initAntiSpoofModel(config.antiSpoofModelUrl).catch(() => {
        console.info('ONNX anti-spoof model not found — using heuristic anti-spoof')
      })
      initChallengeModels().catch(() => {
        console.info('ONNX challenge models not found — using landmark detectors')
      })
      initHeadPoseModel().catch(() => {
        console.info('head_pose_model not loaded — using landmark nod/yaw')
      })

      // Request camera access
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
        },
      })

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }

      // Generate challenges from enabled types with configured timeout
      challengesRef.current = generateChallenges(
        config.challengeCount,
        config.enabledChallenges,
        config.challengeTimeoutMs
      )
      challengeResultsRef.current = []
      currentChallengeIndexRef.current = 0
      setCompletedChallenges(0)
      setTotalChallenges(challengesRef.current.length)
      antiSpoofRef.current.reset()
      onnxScoreRef.current = null
      onnxFrameCountRef.current = 0
      challengeStateRef.current = {}
      blinkOnnxRef.current = createBlinkOnnxState()
      smileOnnxRef.current = false
      nodChallengeRef.current = createNodState()
      yawChallengeRef.current = createYawState()
      headPoseAnglesRef.current = null
      challengeFrameRef.current = 0
      resetPoseDebugLog()
      qualityFrameCountRef.current = 0  // reset quality frame counter
      sessionIdRef.current = nanoid()

      setStatus('ready')

      // Start detection loop
      rafIdRef.current = requestAnimationFrame(runDetectionLoop)
    } catch (error) {
      console.error('Failed to start liveness check:', error)
      setStatus('failed')
    }
  }, [config.challengeCount, runDetectionLoop])

  /**
   * Stop liveness check
   */
  const stop = useCallback(() => {
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current)
      rafIdRef.current = null
    }

    // Stop camera
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream
      stream.getTracks().forEach(track => track.stop())
      videoRef.current.srcObject = null
    }

    setStatus('idle')
  }, [])

  /**
   * Reset to initial state
   */
  const reset = useCallback(() => {
    stop()
    setCurrentChallenge(null)
    setChallengeProgress(0)
    setCompletedChallenges(0)
    setTotalChallenges(0)
    setQualityWarning(null)
    challengesRef.current = []
    challengeResultsRef.current = []
    currentChallengeIndexRef.current = 0
    antiSpoofRef.current.reset()
    onnxScoreRef.current = null
    onnxFrameCountRef.current = 0
    challengeStateRef.current = {}
    qualityFrameCountRef.current = 0
    sessionIdRef.current = nanoid()
  }, [stop])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stop()
      dispose()
      disposeOnnxModel().catch(() => {})
      disposeChallengeModels().catch(() => {})
      disposeHeadPoseModel().catch(() => {})
    }
  }, [stop])

  return {
    status,
    videoRef,
    canvasRef,
    currentChallenge,
    challengeProgress,
    completedChallenges,
    totalChallenges,
    qualityWarning,
    start,
    reset,
  }
}
