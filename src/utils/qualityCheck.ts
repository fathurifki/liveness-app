import type { QualityCheckResult, LivenessEngineConfig, FaceBox } from '../core/types'

/**
 * Brightness Analysis
 * Menggunakan luminance formula ITU-R BT.601: L = 0.299*R + 0.587*G + 0.114*B
 * Sample setiap 4 pixel untuk efisiensi
 */
function calculateBrightness(imageData: ImageData): number {
  const data = imageData.data
  const pixelCount = imageData.width * imageData.height
  let sum = 0

  // Sample setiap 4 pixel untuk performa
  for (let i = 0; i < data.length; i += 16) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    sum += 0.299 * r + 0.587 * g + 0.114 * b
  }

  return sum / (pixelCount / 4)
}

/**
 * Blur Detection (Laplacian Variance) — runs only on face ROI
 * Kernel: [ 0,  1, 0,
 *           1, -4, 1,
 *           0,  1, 0 ]
 * Gambar tajam = variance tinggi, blur = variance rendah
 *
 * Evaluating the full frame causes bokeh/out-of-focus backgrounds to lower
 * the score even when the face itself is sharp. Cropping to the face region
 * first gives an accurate reading.
 * Pixels are sampled every 2 steps for performance.
 */
function calculateBlurScore(
  imageData: ImageData,
  faceBox: FaceBox | null
): number {
  const { width, height, data } = imageData

  // Derive face crop in pixel coords (landmarks are normalised 0-1)
  let x0 = 0, y0 = 0, x1 = width, y1 = height
  if (faceBox) {
    // Add 20% padding so we include forehead/chin edges
    const padX = faceBox.width * 0.2
    const padY = faceBox.height * 0.2
    x0 = Math.max(0, Math.floor((faceBox.x - padX) * width))
    y0 = Math.max(0, Math.floor((faceBox.y - padY) * height))
    x1 = Math.min(width - 1, Math.ceil((faceBox.x + faceBox.width + padX) * width))
    y1 = Math.min(height - 1, Math.ceil((faceBox.y + faceBox.height + padY) * height))
  }

  const cropW = x1 - x0
  const cropH = y1 - y0

  // Build grayscale buffer for the crop region
  const gray = new Float32Array(cropW * cropH)
  for (let cy = 0; cy < cropH; cy++) {
    for (let cx = 0; cx < cropW; cx++) {
      const si = ((y0 + cy) * width + (x0 + cx)) * 4
      gray[cy * cropW + cx] = 0.299 * data[si] + 0.587 * data[si + 1] + 0.114 * data[si + 2]
    }
  }

  // Apply Laplacian kernel, sample every 2 pixels for performance
  let sum = 0
  let sumSq = 0
  let count = 0
  const step = 2
  for (let cy = step; cy < cropH - step; cy += step) {
    for (let cx = step; cx < cropW - step; cx += step) {
      const idx = cy * cropW + cx
      const val =
        -4 * gray[idx] +
        gray[idx - 1] +
        gray[idx + 1] +
        gray[idx - cropW] +
        gray[idx + cropW]
      sum += val
      sumSq += val * val
      count++
    }
  }

  if (count === 0) return 255

  const mean = sum / count
  const variance = sumSq / count - mean * mean

  // Scale so that a typical sharp webcam face scores ~100-200
  return Math.min(255, Math.sqrt(Math.max(0, variance)) * 4)
}

/**
 * Face Size Check
 * faceBox coords are normalised 0-1 (from MediaPipe landmarks), so
 * faceSize = faceBox.width * faceBox.height is already the area ratio (0-1).
 * Dividing by frameWidth*frameHeight would give near-zero — do NOT do that.
 * Ideal: 0.10–0.80
 */
function calculateFaceSize(faceBox: FaceBox | null): number {
  if (!faceBox) return 0
  return faceBox.width * faceBox.height
}

/**
 * Main Quality Check Function
 */
export function runQualityCheck(
  imageData: ImageData,
  faceBox: FaceBox | null,
  config: LivenessEngineConfig
): QualityCheckResult {
  const brightness = calculateBrightness(imageData)
  const blurScore = calculateBlurScore(imageData, faceBox)
  const faceSize = calculateFaceSize(faceBox)

  // Check brightness
  if (brightness < config.minBrightness) {
    return {
      passed: false,
      brightness,
      blurScore,
      faceSize,
      failReason: 'too_dark',
    }
  }

  if (brightness > config.maxBrightness) {
    return {
      passed: false,
      brightness,
      blurScore,
      faceSize,
      failReason: 'too_bright',
    }
  }

  // Check blur
  if (blurScore < config.minBlurScore) {
    return {
      passed: false,
      brightness,
      blurScore,
      faceSize,
      failReason: 'blurry',
    }
  }

  // Check face size
  if (faceBox && faceSize < config.minFaceSize) {
    return {
      passed: false,
      brightness,
      blurScore,
      faceSize,
      failReason: 'too_far',
    }
  }

  if (faceBox && faceSize > config.maxFaceSize) {
    return {
      passed: false,
      brightness,
      blurScore,
      faceSize,
      failReason: 'too_close',
    }
  }

  return {
    passed: true,
    brightness,
    blurScore,
    faceSize,
  }
}

/**
 * Screen Artifact Detection via horizontal pixel transition analysis.
 *
 * Phone/monitor screens have periodic high-frequency patterns (pixel grid,
 * sub-pixel colour rendering, moiré with camera sensor) that manifest as
 * rapid R/G-channel transitions across a scan line.
 *
 * Returns 0–1:  high → likely screen replay,  low → likely real face / scene.
 *
 * DIPERKUAT:
 * - Cek 3 channel (R, G, B) bukan hanya R — moiré lebih terlihat di multi-channel
 * - Threshold transisi turun 30→20 DN (pixel grid lebih halus di HP modern)
 * - Sample row naik 10→16 untuk stabilitas statistik
 */
export function detectScreenArtifacts(imageData: ImageData): number {
  const { data, width, height } = imageData

  let periodicScore = 0
  const sampleRows = 16

  for (let row = 0; row < sampleRows; row++) {
    const y = Math.floor((row / sampleRows) * height)
    let prevR = 0, prevG = 0, prevB = 0
    let transitions = 0

    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4
      const r = data[idx]
      const g = data[idx + 1]
      const b = data[idx + 2]

      // Hitung transisi pada semua 3 channel — lebih robust terhadap HP modern
      if (Math.abs(r - prevR) > 20) transitions++
      if (Math.abs(g - prevG) > 20) transitions++
      if (Math.abs(b - prevB) > 20) transitions++

      prevR = r
      prevG = g
      prevB = b
    }

    // Normalise per-pixel (3 channel × width kemungkinan transisi)
    periodicScore += transitions / (width * 3)
  }

  return periodicScore / sampleRows
}

/**
 * Get user-friendly warning message in Indonesian
 */
export function getQualityWarningMessage(result: QualityCheckResult): string | null {
  if (result.passed) return null

  switch (result.failReason) {
    case 'too_dark':
      return 'Ruangan terlalu gelap'
    case 'too_bright':
      return 'Cahaya terlalu terang'
    case 'blurry':
      return 'Gambar buram, bersihkan kamera'
    case 'too_far':
      return 'Wajah terlalu jauh'
    case 'too_close':
      return 'Wajah terlalu dekat'
    default:
      return 'Kualitas gambar tidak memenuhi syarat'
  }
}
