import type { FaceLandmark, FaceBox } from '../core/types'
import { detectScreenArtifacts } from './qualityCheck'

/**
 * Multi-Signal Anti-Spoof Analyzer — v2
 *
 * Four signals, each designed to fail for screen-replay attacks:
 *
 * 1. NORMALIZED MINIMUM DEFORMATION — P05 (40 % weight)
 *    Per frame we normalise landmarks by face scale (inter-eye distance) and
 *    origin (nose bridge), then measure the frame-to-frame RMS displacement.
 *    We use the 5th-percentile ("quietest" moments) of this distribution.
 *    Real faces: even at rest, micro-tremor / breathing keep P05 > threshold.
 *    Screen replay: video codecs quantise sub-pixel motion → P05 ≈ 0.
 *    Crucially this is NOT contaminated by challenge gestures — we look at
 *    the minimum across frames, so gesture peaks don't inflate the signal.
 *
 * 2. rPPG FOREHEAD SIGNAL (25 % weight)
 *    The heartbeat modulates skin colour by ~1–2 % in the green channel at
 *    1–2 Hz.  After screen → webcam double-capture, this signal is
 *    attenuated ≥ 10×.  We apply a 1st-order high-pass filter to the
 *    forehead mean-G and measure the residual standard deviation.
 *
 * 3. LBP TEXTURE ENTROPY (20 % weight)
 *    Real skin has organic, high-entropy Local Binary Pattern histograms.
 *    Phone screens produce periodic pixel-grid patterns with lower entropy.
 *
 * 4. SCREEN ARTIFACT DETECTION — pixel transition analysis (15 % weight)
 *    Phone/monitor screens have periodic high-frequency patterns (pixel
 *    grid, moiré, sub-pixel rendering) visible as rapid R-channel transitions
 *    across horizontal scan lines.  High transition rate → likely screen.
 */

// ── Constants ─────────────────────────────────────────────────────────────────

/** Landmarks used for normalized deformation tracking (stable anatomical pts) */
const DEFORM_LM = [1, 6, 10, 33, 61, 70, 152, 234, 263, 291, 300, 454] as const

/** Index into DEFORM_LM for scale reference (left/right eye corners) */
const EYE_L_DEFORM_IDX = 3   // lm 33
const EYE_R_DEFORM_IDX = 8   // lm 263
/** Index into DEFORM_LM for translation reference (nose bridge) */
const ORIGIN_DEFORM_IDX = 1  // lm 6

/** Raw MediaPipe indices for rPPG ROI */
const FOREHEAD_TOP_LM  = 10
const FOREHEAD_BASE_LM = 151  // just above brows

const MAX_DEFORM_HISTORY   = 180   // 6 s at 30 fps
const MAX_RPPG_HISTORY     = 128
const MAX_TEXTURE_HISTORY  = 15
const MAX_ARTIFACT_HISTORY = 20

// ── Analyzer ──────────────────────────────────────────────────────────────────

export class AntiSpoofAnalyzer {
  private readonly frameDeform: number[] = []
  private readonly rppgHP: number[] = []        // high-pass filtered forehead-G
  private readonly textureScores: number[] = []
  private readonly artifactScores: number[] = [] // screen pixel-transition scores

  private prevNormFrame: number[] | null = null
  private prevRawG = -1
  private frameCount = 0

  /**
   * Call once per frame where a face is detected and quality has passed.
   */
  update(
    landmarks: FaceLandmark[],
    imageData: ImageData,
    faceBox: FaceBox | null
  ): void {
    if (landmarks.length < 468) return

    // ── 1. Normalized deformation ──────────────────────────────────────────
    const norm = normalizeFrame(landmarks)
    if (norm !== null && this.prevNormFrame !== null && norm.length === this.prevNormFrame.length) {
      let sumSq = 0
      for (let i = 0; i < norm.length; i++) {
        const d = norm[i] - this.prevNormFrame[i]
        sumSq += d * d
      }
      this.frameDeform.push(Math.sqrt(sumSq / norm.length))
      if (this.frameDeform.length > MAX_DEFORM_HISTORY) this.frameDeform.shift()
    }
    this.prevNormFrame = norm

    // ── 2. rPPG forehead green channel ─────────────────────────────────────
    const rawG = extractForeheadGreen(imageData, landmarks)
    if (rawG > 0 && this.prevRawG > 0) {
      // 1st-order high-pass: y[t] = x[t] − α·x[t−1]  (α=0.92 → cutoff ≈1.2 Hz @30fps)
      this.rppgHP.push(rawG - 0.92 * this.prevRawG)
      if (this.rppgHP.length > MAX_RPPG_HISTORY) this.rppgHP.shift()
    }
    if (rawG > 0) this.prevRawG = rawG

    // ── 3. LBP texture + screen artifacts every 8 frames ──────────────────
    this.frameCount++
    if (this.frameCount % 8 === 0 && faceBox) {
      this.textureScores.push(lbpEntropyScore(imageData, faceBox))
      if (this.textureScores.length > MAX_TEXTURE_HISTORY) this.textureScores.shift()

      // Screen artifact: high transition rate → likely screen → inverted to liveness score
      const artifactRaw = detectScreenArtifacts(imageData)
      // Real face: transition ratio ~0.05–0.12  →  liveness score high
      // Screen HP: transition ratio ~0.15–0.45  →  liveness score low
      // DIPERKETAT: window dipersempit (0.08→0.30) agar HP sudah dapat skor 0 di ~0.30
      this.artifactScores.push(clamp01(1 - (artifactRaw - 0.08) / (0.30 - 0.08)))
      if (this.artifactScores.length > MAX_ARTIFACT_HISTORY) this.artifactScores.shift()
    }
  }

  /** Returns 0–1 composite liveness score. */
  getScore(): number {
    const d = this.deformScore()
    const r = this.rppgScore()
    const t = this.textureScore()
    const a = this.artifactScore()
    return clamp01(d * 0.40 + r * 0.25 + t * 0.20 + a * 0.15)
  }

  reset(): void {
    this.frameDeform.length = 0
    this.rppgHP.length = 0
    this.textureScores.length = 0
    this.artifactScores.length = 0
    this.prevNormFrame = null
    this.prevRawG = -1
    this.frameCount = 0
  }

  // ── Private scoring ────────────────────────────────────────────────────────

  private deformScore(): number {
    if (this.frameDeform.length < 30) return 0.5   // perlu lebih banyak frame

    // Sort and take 5th-percentile (quietest frames)
    const sorted = [...this.frameDeform].sort((a, b) => a - b)
    const p05 = sorted[Math.max(0, Math.floor(sorted.length * 0.05) - 1)]

    // Calibration (normalised-by-inter-eye-distance coords):
    //   Real face at rest : P05 ≈ 0.0004 – 0.003   (micro-tremor / breathing)
    //   Screen on tripod  : P05 ≈ 0.00002 – 0.0001  (codec quantisation noise)
    //   Screen hand-held  : P05 ≈ 0.00005 – 0.0002  (rigid-body hand tremor,
    //                                                  no genuine deformation)
    //
    // DIPERKETAT: lower bound naik 0.00015→0.00020, upper bound turun 0.0009→0.0008
    // sehingga HP hand-held (P05 ~0.0002) hanya dapat skor ~0.
    return clamp01((p05 - 0.00020) / (0.0008 - 0.00020))
  }

  private rppgScore(): number {
    if (this.rppgHP.length < 30) return 0.5

    // Standard deviation of high-pass filtered forehead-G
    const mean = avg(this.rppgHP)
    const std  = Math.sqrt(this.rppgHP.reduce((s, v) => s + (v - mean) ** 2, 0) / this.rppgHP.length)

    // Calibration (G values 0–255, signal after HP filter):
    //   Real skin  : std ≈ 0.8 – 4.0 (heartbeat + micro-expression)
    //   Screen rec : std ≈ 0.05 – 0.6 (signal attenuated by double-capture)
    //
    // DIPERKETAT: lower bound naik 0.15→0.20, upper bound turun 1.2→1.0
    // agar screen recording (std ~0.3-0.5) dapat skor rendah secara konsisten.
    return clamp01((std - 0.20) / (1.0 - 0.20))
  }

  private textureScore(): number {
    if (this.textureScores.length === 0) return 0.5
    return avg(this.textureScores)
  }

  private artifactScore(): number {
    if (this.artifactScores.length === 0) return 0.5
    return avg(this.artifactScores)
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Normalise landmarks by face scale and origin so the result is invariant to
 * head translation and distance from camera.
 * Scale = inter-eye distance.  Origin = nose bridge (lm 6).
 */
function normalizeFrame(landmarks: FaceLandmark[]): number[] | null {
  const origin = landmarks[DEFORM_LM[ORIGIN_DEFORM_IDX]]
  const eyeL   = landmarks[DEFORM_LM[EYE_L_DEFORM_IDX]]
  const eyeR   = landmarks[DEFORM_LM[EYE_R_DEFORM_IDX]]

  const scale = Math.sqrt(
    (eyeR.x - eyeL.x) ** 2 + (eyeR.y - eyeL.y) ** 2
  )
  if (scale < 1e-6) return null

  return (DEFORM_LM as readonly number[]).flatMap(i => [
    (landmarks[i].x - origin.x) / scale,
    (landmarks[i].y - origin.y) / scale,
  ])
}

/**
 * Extract mean green channel intensity from the forehead region.
 * Uses landmark positions so the ROI tracks the face regardless of movement.
 */
function extractForeheadGreen(
  imageData: ImageData,
  landmarks: FaceLandmark[]
): number {
  const { width, height, data } = imageData

  const top  = landmarks[FOREHEAD_TOP_LM]
  const base = landmarks[FOREHEAD_BASE_LM]

  const halfW = 0.08 // half-width of ROI in normalised units

  const x0 = clampPx((top.x - halfW) * width,  0, width  - 1)
  const y0 = clampPx(top.y            * height, 0, height - 1)
  const x1 = clampPx((top.x + halfW) * width,  1, width)
  const y1 = clampPx(base.y           * height, 1, height)

  if (x1 <= x0 || y1 <= y0) return -1

  let sumG = 0, count = 0
  // Sample every 2 pixels for performance
  for (let py = y0; py < y1; py += 2) {
    for (let px = x0; px < x1; px += 2) {
      sumG += data[(py * width + px) * 4 + 1]  // green channel
      count++
    }
  }
  return count > 0 ? sumG / count : -1
}

/**
 * LBP Shannon entropy on the left-cheek skin region.
 * Higher = more organic/irregular texture (real skin).
 * Lower  = more periodic/uniform texture (screen pixel grid).
 */
function lbpEntropyScore(imageData: ImageData, faceBox: FaceBox): number {
  const { width, height, data } = imageData

  const x0 = clampPx((faceBox.x + faceBox.width * 0.05) * width,  1, width  - 2)
  const y0 = clampPx((faceBox.y + faceBox.height * 0.35) * height, 1, height - 2)
  const x1 = clampPx((faceBox.x + faceBox.width * 0.40) * width,  2, width  - 1)
  const y1 = clampPx((faceBox.y + faceBox.height * 0.65) * height, 2, height - 1)

  const cw = x1 - x0
  const ch = y1 - y0
  if (cw < 6 || ch < 6) return 0.5

  const gray = new Uint8Array(cw * ch)
  for (let cy = 0; cy < ch; cy++) {
    for (let cx = 0; cx < cw; cx++) {
      const si = ((y0 + cy) * width + (x0 + cx)) * 4
      gray[cy * cw + cx] = Math.round(
        0.299 * data[si] + 0.587 * data[si + 1] + 0.114 * data[si + 2]
      )
    }
  }

  const hist = new Uint32Array(256)
  for (let cy = 1; cy < ch - 1; cy++) {
    for (let cx = 1; cx < cw - 1; cx++) {
      const c = gray[cy * cw + cx]
      let lbp = 0
      if (gray[(cy - 1) * cw + (cx - 1)] >= c) lbp |= 0x01
      if (gray[(cy - 1) * cw +  cx]      >= c) lbp |= 0x02
      if (gray[(cy - 1) * cw + (cx + 1)] >= c) lbp |= 0x04
      if (gray[ cy      * cw + (cx + 1)] >= c) lbp |= 0x08
      if (gray[(cy + 1) * cw + (cx + 1)] >= c) lbp |= 0x10
      if (gray[(cy + 1) * cw +  cx]      >= c) lbp |= 0x20
      if (gray[(cy + 1) * cw + (cx - 1)] >= c) lbp |= 0x40
      if (gray[ cy      * cw + (cx - 1)] >= c) lbp |= 0x80
      hist[lbp]++
    }
  }

  const total = (cw - 2) * (ch - 2)
  let H = 0
  for (const count of hist) {
    if (count > 0) {
      const p = count / total
      H -= p * Math.log2(p)
    }
  }

  // Max entropy = log₂(256) = 8.  Real skin ≈ 5–7.5.  Screen ≈ 2.5–5.
  return clamp01((H - 3.5) / (6.0 - 3.5))
}

// ── Micro-helpers ─────────────────────────────────────────────────────────────

function avg(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v))
}

function clampPx(v: number, min: number, max: number): number {
  return Math.round(Math.min(max, Math.max(min, v)))
}
