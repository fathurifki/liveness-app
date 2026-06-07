// ============================================================================
// Core Types & Interfaces
// ============================================================================

export type LivenessStatus =
  | 'idle'          // belum mulai
  | 'initializing'  // load model MediaPipe
  | 'ready'         // model siap
  | 'detecting'     // deteksi wajah aktif
  | 'challenge'     // user sedang mengerjakan challenge
  | 'processing'    // agregasi score final
  | 'passed'        // lulus verifikasi
  | 'failed'        // gagal

export type FailReason =
  | 'no_face'          // wajah tidak terdeteksi
  | 'multiple_faces'   // lebih dari 1 wajah
  | 'too_dark'         // brightness < minBrightness
  | 'too_bright'       // brightness > maxBrightness
  | 'blurry'           // blurScore < minBlurScore
  | 'too_far'          // face size < minFaceSize
  | 'too_close'        // face size > maxFaceSize
  | 'spoof_detected'   // anti-spoof score di bawah threshold
  | 'challenge_failed' // challenge tidak selesai tepat waktu
  | 'timeout'          // session timeout

export type ChallengeType =
  | 'blink'
  | 'nod_top'     // angguk ke atas saja
  | 'nod_bottom'  // angguk ke bawah saja
  | 'yaw_left'    // menoleh ke kiri saja
  | 'yaw_right'   // menoleh ke kanan saja
  | 'smile'
  | 'open_mouth'
  | 'gaze_target'

// ============================================================================
// Configuration
// ============================================================================

export interface LivenessEngineConfig {
  minBrightness: number           // default: 40  (0-255)
  maxBrightness: number           // default: 220 (0-255)
  minBlurScore: number            // default: 18  (0-255, higher=sharper)
  minFaceSize: number             // default: 0.10 (10% of normalised face area)
  maxFaceSize: number             // default: 0.80 (80% of frame area)
  antiSpoofThreshold: number      // default: 0.45 (0-1)
  challengeCount: number          // default: 2
  challengeTimeoutMs: number      // default: 6000 (ms per challenge)
  passScore: number               // default: 70  (0-100)
  antiSpoofModelUrl?: string      // optional: URL to custom ONNX model
  enabledChallenges: ChallengeType[] // default: all types
}

export const DEFAULT_CONFIG: LivenessEngineConfig = {
  minBrightness: 40,
  maxBrightness: 220,
  minBlurScore: 18,  // Turun dari 30 → 18 untuk mengurangi false rejection pada webcam standar
  minFaceSize: 0.10,
  maxFaceSize: 0.80,
  antiSpoofThreshold: 0.25,  // Turun dari 0.45 → 0.25 karena MiniFASNet terlalu strict
  challengeCount: 2,
  challengeTimeoutMs: 6000,
  passScore: 65,
  enabledChallenges: ['blink', 'nod_top', 'nod_bottom', 'yaw_left', 'yaw_right', 'smile', 'open_mouth'],
}

// ============================================================================
// Face Detection
// ============================================================================

export interface FaceLandmark {
  x: number
  y: number
  z?: number
}

export interface FaceBox {
  x: number
  y: number
  width: number
  height: number
}

export interface FaceDetectionResult {
  detected: boolean
  landmarks: FaceLandmark[]
  boundingBox: FaceBox | null
  confidence?: number
}

// ============================================================================
// Quality Check
// ============================================================================

export interface QualityCheckResult {
  passed: boolean
  brightness: number      // 0-255
  blurScore: number       // 0-255, higher=sharper
  faceSize: number        // 0-1, ratio of face area to frame area
  failReason?: FailReason
}

// ============================================================================
// Anti-Spoof
// ============================================================================

export interface AntiSpoofResult {
  isReal: boolean
  score: number           // 0-1, confidence that face is real
  method: 'heuristic' | 'onnx'
}

// ============================================================================
// Challenge System
// ============================================================================

export interface Challenge {
  type: ChallengeType
  instruction: string
  timeoutMs: number
  startTime?: number
  /** Only present for gaze_target — position in mirrored display space [0,1] */
  gazeTarget?: { x: number; y: number }
}

export interface ChallengeResult {
  type: ChallengeType
  passed: boolean
  duration: number        // ms taken to complete
  attempts?: number
}

// ============================================================================
// Final Result
// ============================================================================

export interface LivenessCheckResult {
  status: 'passed' | 'failed'
  score: number                    // 0-100, aggregate weighted score
  antiSpoof: AntiSpoofResult
  challengesPassed: ChallengeResult[]
  quality: QualityCheckResult
  failReason?: FailReason
  sessionId: string                // unique per session
  timestamp: number                // unix ms
}

// ============================================================================
// Debug / Logger
// ============================================================================

export type DebugLogLevel = 'info' | 'warn' | 'pass' | 'fail'

export interface DebugMetrics {
  // Frame info
  frameCount: number
  fps: number

  // Quality
  brightness: number
  blurScore: number
  faceSize: number
  qualityPassed: boolean

  // EAR (Eye Aspect Ratio)
  earLeft: number
  earRight: number
  earAvg: number

  // MAR (Mouth Aspect Ratio)
  mar: number

  // Smile heuristic
  smileMidY: number
  smileLeftLift: number
  smileRightLift: number
  smileHeuristicPass: boolean

  // ONNX smile
  smileOnnxProb: number | null
  smileOnnxPass: boolean

  // Head pose (landmark heuristic)
  yaw: number
  pitch: number
  // Head pose ONNX (null jika model belum infer frame ini)
  headPoseYawOnnx: number | null
  headPosePitchOnnx: number | null
  headPoseRollOnnx: number | null

  // Nod challenge (2-step: top → bottom)
  nodPhase: string | null
  nodDeltaLm: number | null
  nodDeltaOnnx: number | null
  nodPass: boolean

  // Yaw challenge (2-step: left → right)
  yawPhase: string | null
  yawDeltaLm: number | null
  yawDeltaOnnx: number | null
  yawPass: boolean

  // Anti-spoof
  antiSpoofScore: number | null
  antiSpoofMethod: 'heuristic' | 'onnx'

  // Current challenge
  challengeType: string | null
  challengePassed: boolean
}

// ============================================================================
// Adapter Pattern (for cross-platform support)
// ============================================================================

export interface LivenessAdapter {
  detectFace(frame: ImageData): Promise<FaceDetectionResult>
  getAntiSpoofScore(frame: ImageData): Promise<number>
  isReady(): boolean
  dispose(): void
}
