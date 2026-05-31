import type { Challenge, ChallengeType, FaceLandmark } from '../core/types'

// ============================================================================
// Landmark Indices (MediaPipe FaceMesh 468 points)
// ============================================================================

export const LEFT_EYE_INDICES = [33, 160, 158, 133, 153, 144]
export const RIGHT_EYE_INDICES = [362, 385, 387, 263, 373, 380]
const MOUTH_TOP = 13
const MOUTH_BOTTOM = 14
const MOUTH_LEFT = 61
const MOUTH_RIGHT = 291
const NOSE_TIP = 1
const LEFT_CHEEK = 234
const RIGHT_CHEEK = 454

// Iris landmark indices (MediaPipe FaceLandmarker 478-pt model)
// Right iris (camera perspective): 468–472  |  Left iris: 473–477
const RIGHT_IRIS_CENTER = 468
const LEFT_IRIS_CENTER  = 473
// Eye corners used for iris offset normalisation
const RIGHT_EYE_OUTER = 33
const RIGHT_EYE_INNER = 133
const LEFT_EYE_INNER  = 362
const LEFT_EYE_OUTER  = 263

// ============================================================================
// Thresholds
// ============================================================================

const BLINK_THRESHOLD = 0.18        // EAR di bawah ini = kedip
const MOUTH_OPEN_THRESHOLD = 0.28   // MAR di atas ini = buka mulut (turun dari 0.35 → 0.28 agar lebih toleran)
// Smile: sudut mulut harus terangkat relatif terhadap midpoint vertikal mulut.
// Nilai dalam satuan normalized landmark (0–1 range, y bertambah ke bawah).
// Data real dari log: smileLeftLift -0.002 s/d 0.035 saat senyum nyata.
// Diturunkan dari 0.03 → 0.018 agar lebih toleran terhadap variasi wajah.
const SMILE_CORNER_LIFT = 0.018
/** Landmark heuristic — pitch/yaw skala *100 */
export const NOD_STEP_LM = 8
export const YAW_STEP_LM = 8  // turun dari 10 → 8 untuk lebih sensitif
/** ONNX head_pose — radian */
export const NOD_STEP_RAD = 0.08  // ~4.6 degrees (turun dari 0.1)
export const YAW_STEP_RAD = 0.12  // ~6.9 degrees (naik dari 0.08 untuk lebih jelas)

/** Single-direction thresholds — dapat disesuaikan per challenge */
export const NOD_TOP_THRESHOLD = 5                // turun dari 8 → 5 agar tidak terlalu tinggi
export const NOD_BOTTOM_THRESHOLD = NOD_STEP_LM   // default: 8
export const YAW_LEFT_THRESHOLD = YAW_STEP_LM     // default: 8 (turun dari 10)
export const YAW_RIGHT_THRESHOLD = YAW_STEP_LM    // default: 8 (turun dari 10)

// ============================================================================
// Challenge Pool
// ============================================================================

export const CHALLENGE_POOL: Challenge[] = [
  { type: 'blink',       instruction: 'Kedip 2x',          timeoutMs: 6000 },
  { type: 'nod_top',     instruction: 'Angguk ke atas',    timeoutMs: 6000 },
  { type: 'nod_bottom',  instruction: 'Angguk ke bawah',   timeoutMs: 6000 },
  { type: 'yaw_left',    instruction: 'Menoleh ke kiri',   timeoutMs: 6000 },
  { type: 'yaw_right',   instruction: 'Menoleh ke kanan',  timeoutMs: 6000 },
  { type: 'smile',       instruction: 'Senyum',            timeoutMs: 6000 },
  { type: 'open_mouth',  instruction: 'Buka mulut',        timeoutMs: 5000 },
  { type: 'gaze_target', instruction: 'Lihat titik merah', timeoutMs: 7000 },
]

/** Normalisasi tipe lama (nod/yaw/shake) ke challenge eksplisit. */
export function normalizeChallengeType(type: string): ChallengeType | null {
  const map: Record<string, ChallengeType> = {
    blink: 'blink',
    nod: 'nod_top',
    nod_up: 'nod_top',
    nod_top: 'nod_top',
    nod_down: 'nod_bottom',
    nod_bottom: 'nod_bottom',
    yaw: 'yaw_left',
    shake: 'yaw_left',
    yaw_left: 'yaw_left',
    yaw_right: 'yaw_right',
    smile: 'smile',
    open_mouth: 'open_mouth',
    gaze_target: 'gaze_target',
  }
  return map[type] ?? null
}

/** Expand legacy `nod` / `yaw` menjadi dua challenge terpisah di pengaturan. */
export function normalizeEnabledChallenges(types: string[]): ChallengeType[] {
  const out: ChallengeType[] = []
  for (const raw of types) {
    if (raw === 'nod') {
      out.push('nod_top', 'nod_bottom')
      continue
    }
    if (raw === 'yaw' || raw === 'shake') {
      out.push('yaw_left', 'yaw_right')
      continue
    }
    const t = normalizeChallengeType(raw)
    if (t && !out.includes(t)) out.push(t)
  }
  return out.length > 0 ? out : CHALLENGE_POOL.map((c) => c.type)
}

export function isPoseChallenge(type: ChallengeType): boolean {
  return (
    type === 'nod_top' ||
    type === 'nod_bottom' ||
    type === 'yaw_left' ||
    type === 'yaw_right'
  )
}

/** Four possible gaze-target positions in mirrored display space [0,1] */
const GAZE_TARGET_POSITIONS = [
  { x: 0.12, y: 0.18, label: 'kiri atas' },
  { x: 0.88, y: 0.18, label: 'kanan atas' },
  { x: 0.12, y: 0.82, label: 'kiri bawah' },
  { x: 0.88, y: 0.82, label: 'kanan bawah' },
]

/**
 * Generate random challenges for session
 * @param count   - how many challenges to pick
 * @param enabled - which challenge types are allowed (defaults to all)
 * @param timeoutMs - override timeout per challenge in ms
 */
export function generateChallenges(
  count: number,
  enabled?: ChallengeType[],
  timeoutMs?: number
): Challenge[] {
  const normalized = enabled ? normalizeEnabledChallenges(enabled as string[]) : undefined
  const pool =
    normalized && normalized.length > 0
      ? CHALLENGE_POOL.filter((c) => normalized.includes(c.type))
      : CHALLENGE_POOL

  const shuffled = [...pool].sort(() => Math.random() - 0.5)
  const selected = shuffled.slice(0, Math.min(count, pool.length))

  return selected.map(c => {
    const base = timeoutMs ? { ...c, timeoutMs } : { ...c }

    if (base.type === 'gaze_target') {
      const pos = GAZE_TARGET_POSITIONS[Math.floor(Math.random() * GAZE_TARGET_POSITIONS.length)]
      return {
        ...base,
        instruction: `Lihat titik merah di ${pos.label}`,
        gazeTarget: { x: pos.x, y: pos.y },
      }
    }

    return base
  })
}

// ============================================================================
// Geometric Calculations
// ============================================================================

function euclideanDistance(p1: FaceLandmark, p2: FaceLandmark): number {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2))
}

/**
 * Eye Aspect Ratio (EAR)
 * EAR = (|p2-p6| + |p3-p5|) / (2 * |p1-p4|)
 */
export function calculateEAR(eyeIndices: number[], landmarks: FaceLandmark[]): number {
  const [p1, p2, p3, p4, p5, p6] = eyeIndices.map(i => landmarks[i])

  const vertical1 = euclideanDistance(p2, p6)
  const vertical2 = euclideanDistance(p3, p5)
  const horizontal = euclideanDistance(p1, p4)

  return (vertical1 + vertical2) / (2 * horizontal)
}

/**
 * Mouth Aspect Ratio (MAR)
 * MAR = |mouth_top - mouth_bottom| / |mouth_left - mouth_right|
 */
function calculateMAR(landmarks: FaceLandmark[]): number {
  const top = landmarks[MOUTH_TOP]
  const bottom = landmarks[MOUTH_BOTTOM]
  const left = landmarks[MOUTH_LEFT]
  const right = landmarks[MOUTH_RIGHT]

  const vertical = euclideanDistance(top, bottom)
  const horizontal = euclideanDistance(left, right)

  return vertical / horizontal
}

/**
 * Head Pose (Yaw/Pitch)
 */
export function calculateHeadPose(landmarks: FaceLandmark[]): { yaw: number; pitch: number } {
  const nose = landmarks[NOSE_TIP]
  const leftCheek = landmarks[LEFT_CHEEK]
  const rightCheek = landmarks[RIGHT_CHEEK]

  const midCheek = {
    x: (leftCheek.x + rightCheek.x) / 2,
    y: (leftCheek.y + rightCheek.y) / 2,
  }

  const yaw = (nose.x - midCheek.x) * 100   // geleng kiri/kanan
  const pitch = (nose.y - midCheek.y) * 100 // angguk atas/bawah

  return { yaw, pitch }
}

// ============================================================================
// Challenge Detectors
// ============================================================================

/**
 * Blink Detection
 * Deteksi 2x kedip berturut-turut
 */
export function detectBlink(landmarks: FaceLandmark[], state: { blinkCount: number; lastBlink: number }): boolean {
  const leftEAR = calculateEAR(LEFT_EYE_INDICES, landmarks)
  const rightEAR = calculateEAR(RIGHT_EYE_INDICES, landmarks)
  const avgEAR = (leftEAR + rightEAR) / 2

  const now = Date.now()

  if (avgEAR < BLINK_THRESHOLD) {
    // Mata tertutup
    if (now - state.lastBlink > 200) { // debounce 200ms
      state.blinkCount++
      state.lastBlink = now
    }
  }

  return state.blinkCount >= 2
}

export type NodChallengePhase = 'top' | 'bottom' | 'done'
export type YawChallengePhase = 'left' | 'right' | 'done'

export type NodChallengeState = {
  baselinePitch: number | null
  phase: NodChallengePhase
}

export type YawChallengeState = {
  baselineYaw: number | null
  phase: YawChallengePhase
  yawHistory: number[]  // untuk temporal smoothing
  smoothedYaw: number | null
}

export function createNodState(): NodChallengeState {
  return { baselinePitch: null, phase: 'top' }
}

export function createYawState(): YawChallengeState {
  return { baselineYaw: null, phase: 'left', yawHistory: [], smoothedYaw: null }
}

export function getNodInstruction(phase: NodChallengePhase): string {
  if (phase === 'top') return 'Angguk ke atas'
  if (phase === 'bottom') return 'Angguk ke bawah'
  return 'Selesai'
}

export function getYawInstruction(phase: YawChallengePhase): string {
  if (phase === 'left') return 'Menoleh ke kiri'
  if (phase === 'right') return 'Menoleh ke kanan'
  return 'Selesai'
}

/** Langkah 1: pitch turun dari baseline (angguk atas). Langkah 2: pitch naik (angguk bawah). */
export function stepNodPitch(
  pitch: number,
  state: NodChallengeState,
  threshold: number,
): void {
  if (state.baselinePitch === null) {
    state.baselinePitch = pitch
    return
  }
  const delta = pitch - state.baselinePitch
  if (state.phase === 'top' && delta <= -threshold) {
    state.phase = 'bottom'
  } else if (state.phase === 'bottom' && delta >= threshold) {
    state.phase = 'done'
  }
}

/** Langkah 1: yaw kiri, lalu yaw kanan. */
export function stepYawAngle(
  yaw: number,
  state: YawChallengeState,
  threshold: number,
): void {
  // Temporal smoothing: simpan 5 frame terakhir
  state.yawHistory.push(yaw)
  if (state.yawHistory.length > 5) {
    state.yawHistory.shift()
  }

  // Hitung median untuk mengurangi noise (lebih robust dari mean)
  const sorted = [...state.yawHistory].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const smoothedYaw = sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]

  state.smoothedYaw = smoothedYaw

  if (state.baselineYaw === null) {
    state.baselineYaw = smoothedYaw
    return
  }
  const delta = smoothedYaw - state.baselineYaw
  if (state.phase === 'left' && delta <= -threshold) {
    state.phase = 'right'
  } else if (state.phase === 'right' && delta >= threshold) {
    state.phase = 'done'
  }
}

export function isNodComplete(state: NodChallengeState): boolean {
  return state.phase === 'done'
}

export function isYawComplete(state: YawChallengeState): boolean {
  return state.phase === 'done'
}

export function getPitchDelta(pitch: number, state: NodChallengeState): number | null {
  if (state.baselinePitch === null) return null
  return pitch - state.baselinePitch
}

export function getYawDelta(yaw: number, state: YawChallengeState): number | null {
  if (state.baselineYaw === null) return null
  return yaw - state.baselineYaw
}

export function detectNod(landmarks: FaceLandmark[], state: NodChallengeState): boolean {
  const { pitch } = calculateHeadPose(landmarks)
  stepNodPitch(pitch, state, NOD_STEP_LM)
  return isNodComplete(state)
}

export function detectYaw(landmarks: FaceLandmark[], state: YawChallengeState): boolean {
  const { yaw } = calculateHeadPose(landmarks)
  stepYawAngle(yaw, state, YAW_STEP_LM)
  return isYawComplete(state)
}

/**
 * Single-direction Nod Detection (up or down only)
 *
 * @param landmarks - face landmarks untuk fallback calculation
 * @param state - nod challenge state
 * @param onnxPitch - optional ONNX pitch angle dalam radian (lebih akurat)
 */
export function detectNodTop(
  landmarks: FaceLandmark[],
  state: NodChallengeState,
  onnxPitch?: number
): boolean {
  // Prioritaskan ONNX jika tersedia, fallback ke landmark
  const pitch = onnxPitch !== undefined
    ? onnxPitch * 100  // konversi radian ke skala yang sama dengan landmark
    : calculateHeadPose(landmarks).pitch

  if (state.baselinePitch === null) {
    state.baselinePitch = pitch
    return false
  }
  const delta = pitch - state.baselinePitch

  // Threshold berbeda untuk ONNX vs landmark
  const threshold = onnxPitch !== undefined
    ? NOD_STEP_RAD * 100  // ONNX threshold dalam skala 100
    : NOD_TOP_THRESHOLD   // Landmark threshold

  // Angguk ke atas = pitch turun (delta negatif)
  return delta <= -threshold
}

export function detectNodBottom(
  landmarks: FaceLandmark[],
  state: NodChallengeState,
  onnxPitch?: number
): boolean {
  // Prioritaskan ONNX jika tersedia, fallback ke landmark
  const pitch = onnxPitch !== undefined
    ? onnxPitch * 100  // konversi radian ke skala yang sama dengan landmark
    : calculateHeadPose(landmarks).pitch

  if (state.baselinePitch === null) {
    state.baselinePitch = pitch
    return false
  }
  const delta = pitch - state.baselinePitch

  // Threshold berbeda untuk ONNX vs landmark
  const threshold = onnxPitch !== undefined
    ? NOD_STEP_RAD * 100  // ONNX threshold dalam skala 100
    : NOD_BOTTOM_THRESHOLD // Landmark threshold

  // Angguk ke bawah = pitch naik (delta positif)
  return delta >= threshold
}

/**
 * Single-direction Yaw Detection (left or right only)
 * Menggunakan temporal smoothing untuk mengurangi noise
 *
 * @param landmarks - face landmarks untuk fallback calculation
 * @param state - yaw challenge state
 * @param onnxYaw - optional ONNX yaw angle dalam radian (lebih akurat)
 */
export function detectYawLeft(
  landmarks: FaceLandmark[],
  state: YawChallengeState,
  onnxYaw?: number
): boolean {
  // Prioritaskan ONNX jika tersedia, fallback ke landmark
  const yaw = onnxYaw !== undefined
    ? onnxYaw * 100  // konversi radian ke skala yang sama dengan landmark
    : calculateHeadPose(landmarks).yaw

  // Temporal smoothing
  state.yawHistory.push(yaw)
  if (state.yawHistory.length > 5) {
    state.yawHistory.shift()
  }

  // Median filter
  const sorted = [...state.yawHistory].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const smoothedYaw = sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]

  state.smoothedYaw = smoothedYaw

  if (state.baselineYaw === null) {
    state.baselineYaw = smoothedYaw
    return false
  }

  const delta = smoothedYaw - state.baselineYaw

  // Threshold berbeda untuk ONNX vs landmark
  const threshold = onnxYaw !== undefined
    ? YAW_STEP_RAD * 100  // ONNX threshold dalam skala 100
    : YAW_LEFT_THRESHOLD   // Landmark threshold

  // Menoleh ke kiri = yaw turun (delta negatif)
  return delta <= -threshold
}

export function detectYawRight(
  landmarks: FaceLandmark[],
  state: YawChallengeState,
  onnxYaw?: number
): boolean {
  // Prioritaskan ONNX jika tersedia, fallback ke landmark
  const yaw = onnxYaw !== undefined
    ? onnxYaw * 100  // konversi radian ke skala yang sama dengan landmark
    : calculateHeadPose(landmarks).yaw

  // Temporal smoothing
  state.yawHistory.push(yaw)
  if (state.yawHistory.length > 5) {
    state.yawHistory.shift()
  }

  // Median filter
  const sorted = [...state.yawHistory].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const smoothedYaw = sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]

  state.smoothedYaw = smoothedYaw

  if (state.baselineYaw === null) {
    state.baselineYaw = smoothedYaw
    return false
  }

  const delta = smoothedYaw - state.baselineYaw

  // Threshold berbeda untuk ONNX vs landmark
  const threshold = onnxYaw !== undefined
    ? YAW_STEP_RAD * 100  // ONNX threshold dalam skala 100
    : YAW_RIGHT_THRESHOLD  // Landmark threshold

  // Menoleh ke kanan = yaw naik (delta positif)
  return delta >= threshold
}

/** @deprecated use detectNodTop */
export const detectNodUp = detectNodTop
/** @deprecated use detectNodBottom */
export const detectNodDown = detectNodBottom

/**
 * Smile Detection
 *
 * Strategi: hitung "corner lift" — seberapa jauh sudut mulut terangkat
 * relatif terhadap MIDPOINT vertikal antara MOUTH_TOP dan MOUTH_BOTTOM.
 *
 * Koordinat MediaPipe: y bertambah ke BAWAH.
 * - midY = (top.y + bottom.y) / 2  → titik tengah vertikal mulut
 * - corner lift = midY - corner.y   → positif berarti corner LEBIH TINGGI dari midpoint
 *
 * Wajah netral : corner.y ≈ midY   → lift ≈ 0
 * Senyum       : corner terangkat   → lift > SMILE_CORNER_LIFT (0.03)
 *
 * Guard: MAR tidak boleh > MOUTH_OPEN_THRESHOLD (itu open_mouth, bukan smile).
 */
export function detectSmile(landmarks: FaceLandmark[]): boolean {
  const mar = calculateMAR(landmarks)
  if (mar > MOUTH_OPEN_THRESHOLD) return false

  const top    = landmarks[MOUTH_TOP]    // idx 13 — tengah bibir atas
  const bottom = landmarks[MOUTH_BOTTOM] // idx 14 — tengah bibir bawah
  const left   = landmarks[MOUTH_LEFT]   // idx 61 — sudut mulut kiri
  const right  = landmarks[MOUTH_RIGHT]  // idx 291 — sudut mulut kanan

  // Midpoint vertikal mulut (dalam normalized coords)
  const midY = (top.y + bottom.y) / 2

  // Lift positif = sudut mulut lebih tinggi dari midpoint = senyum
  const leftLift  = midY - left.y
  const rightLift = midY - right.y

  return leftLift > SMILE_CORNER_LIFT && rightLift > SMILE_CORNER_LIFT
}

/**
 * Compute smile metrics for debugging (tanpa threshold check).
 * Return raw values yang bisa ditampilkan di DebugOverlay.
 */
export function computeSmileMetrics(landmarks: FaceLandmark[]): {
  mar: number
  midY: number
  leftLift: number
  rightLift: number
  passed: boolean
} {
  const mar    = calculateMAR(landmarks)
  const top    = landmarks[MOUTH_TOP]
  const bottom = landmarks[MOUTH_BOTTOM]
  const left   = landmarks[MOUTH_LEFT]
  const right  = landmarks[MOUTH_RIGHT]
  const midY   = (top.y + bottom.y) / 2
  const leftLift  = midY - left.y
  const rightLift = midY - right.y
  return {
    mar,
    midY,
    leftLift,
    rightLift,
    passed: mar <= MOUTH_OPEN_THRESHOLD && leftLift > SMILE_CORNER_LIFT && rightLift > SMILE_CORNER_LIFT,
  }
}

/**
 * Open Mouth Detection
 */
export function detectOpenMouth(landmarks: FaceLandmark[]): boolean {
  const mar = calculateMAR(landmarks)
  return mar > MOUTH_OPEN_THRESHOLD
}

// ── Iris / Gaze ───────────────────────────────────────────────────────────────

/**
 * Compute normalised iris offset for both eyes.
 * x > 0 = iris right in landmark (camera) space = user looks display-left (mirror).
 * y > 0 = iris down.
 * Returns null when iris landmarks are absent (< 478 points).
 */
function computeIrisOffset(landmarks: FaceLandmark[]): { x: number; y: number } | null {
  if (landmarks.length < 478) return null

  const computeEye = (
    irisIdx: number,
    outerIdx: number,
    innerIdx: number,
  ) => {
    const iris   = landmarks[irisIdx]
    const outer  = landmarks[outerIdx]
    const inner  = landmarks[innerIdx]
    const cx     = (outer.x + inner.x) / 2
    const cy     = (outer.y + inner.y) / 2
    const width  = Math.abs(outer.x - inner.x)
    if (width < 1e-5) return null
    return { x: (iris.x - cx) / width, y: (iris.y - cy) / width }
  }

  const right = computeEye(RIGHT_IRIS_CENTER, RIGHT_EYE_OUTER, RIGHT_EYE_INNER)
  const left  = computeEye(LEFT_IRIS_CENTER,  LEFT_EYE_OUTER,  LEFT_EYE_INNER)

  if (!right && !left) return null
  if (!right) return left
  if (!left)  return right
  return { x: (right.x + left.x) / 2, y: (right.y + left.y) / 2 }
}

/**
 * Gaze Target Detection
 *
 * @param landmarks    - current face landmarks (needs 478 for iris)
 * @param targetDispX  - target X in mirrored display space [0,1]
 * @param targetDispY  - target Y in mirrored display space [0,1]
 *
 * Coordinate mapping:
 *   Display is mirrored → display-x = 1 - landmark-x
 *   If target is at display-left (small x), in landmark space it is at large x
 *   → user must look right in landmark space → iris x > eye center x (positive offset)
 */
export function detectGazeTarget(
  landmarks: FaceLandmark[],
  targetDispX: number,
  targetDispY: number,
): boolean {
  const iris = computeIrisOffset(landmarks)
  if (!iris) return false

  // Convert target from display coords to expected iris offset direction
  const nose = landmarks[NOSE_TIP]
  // Target in landmark space
  const tLmX = 1 - targetDispX  // mirror X
  const tLmY = targetDispY

  // Direction from nose to target in landmark space
  const dx = tLmX - nose.x
  const dy = tLmY - nose.y
  const dist = Math.sqrt(dx * dx + dy * dy)
  if (dist < 0.05) return false   // target too close to center

  // Unit vector toward target in landmark space
  const ux = dx / dist
  const uy = dy / dist

  // Dot product: positive = iris pointing toward target
  // Iris offset range ~[-0.5, 0.5] for horizontal, smaller for vertical
  const dot = iris.x * ux + iris.y * uy
  return dot > 0.12   // threshold: ~12 % of eye width in correct direction
}
