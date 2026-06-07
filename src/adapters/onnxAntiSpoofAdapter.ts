import * as ort from 'onnxruntime-web'
import type { FaceBox } from '../core/types'
import { OnnxRunQueue } from '../utils/onnxRunQueue'
import { loadModel, getModelUrl } from '../utils/modelDecryptor'

const IMAGENET_MEAN = [0.485, 0.456, 0.406] as const
const IMAGENET_STD = [0.229, 0.224, 0.225] as const

/** Colab-trained binary model (128×128, ImageNet). Official MiniFASNet is 80×80 BGR. */
type PreprocessMode = 'imagenet_rgb' | 'minifasnet_bgr'

/**
 * Model candidates — urutan prioritas:
 * 1. MiniFASNet.onnx  — 80×80 BGR, 2-class [live=0, spoof=1], terbukti berfungsi
 * 2. liveness_model.onnx — 128×128 RGB ImageNet, 2-class [spoof=0, live=1]
 *    (skip jika ada external data file yang hilang)
 */
const MODEL_CANDIDATES = [
  '/models/MiniFASNet.onnx',
  '/models/liveness_model.onnx',
] as const

interface SessionState {
  session: ort.InferenceSession
  inputSize: number
  preprocessMode: PreprocessMode
  inputName: string
  outputName: string
}

/** Single atomic reference — either all fields belong to the active session, or null. */
let activeState: SessionState | null = null
/** Tracks in-flight initAntiSpoofModel() calls so concurrent callers await the same promise. */
let initPromise: Promise<void> | null = null
const antiSpoofQueue = new OnnxRunQueue()

function resolveInputSize(dims: readonly (number | string | bigint | undefined)[]): number {
  const h = dims[2]
  const w = dims[3]
  if (typeof h === 'number' && typeof w === 'number' && h === w && h > 0) {
    return h
  }
  return 80
}

function buildStateFromSession(modelUrl: string, sess: ort.InferenceSession): SessionState {
  const resolvedInputName = sess.inputNames[0] ?? 'input'
  const resolvedOutputName = sess.outputNames[0] ?? 'output'

  const inputIdx = sess.inputNames.indexOf(resolvedInputName)
  const meta = inputIdx >= 0 ? sess.inputMetadata[inputIdx] : undefined
  const dims = meta && meta.isTensor ? meta.shape : []
  const resolvedInputSize = resolveInputSize(dims)

  // Convention yang sudah diverifikasi via inference langsung:
  //   MiniFASNet.onnx  (80×80, BGR)   → output [1,2]: [live=0, spoof=1]  → mode = minifasnet_bgr
  //   liveness_model.onnx (128×128, RGB ImageNet) → output [1,2]: [spoof=0, live=1] → mode = imagenet_rgb
  const isMiniFASNet = modelUrl.includes('MiniFASNet')
  const resolvedPreprocessMode: PreprocessMode =
    isMiniFASNet ? 'minifasnet_bgr'
    : resolvedInputSize === 128 ? 'imagenet_rgb'
    : 'minifasnet_bgr'

  console.log(
    `✅ ONNX anti-spoof loaded (${resolvedInputSize}×${resolvedInputSize}, ${resolvedPreprocessMode}) from ${modelUrl}`,
  )

  return {
    session: sess,
    inputSize: resolvedInputSize,
    preprocessMode: resolvedPreprocessMode,
    inputName: resolvedInputName,
    outputName: resolvedOutputName,
  }
}

/**
 * Load custom Colab model or official MiniFASNet ONNX.
 * Bug fix #4: concurrent callers share the same promise — no duplicate loads.
 * Bug fix #2 (partial): state is committed atomically via SessionState object.
 */
export function initAntiSpoofModel(modelUrl?: string): Promise<void> {
  // Already loaded — return immediately.
  if (activeState) return Promise.resolve()

  // Bug fix #4: if a load is already in-flight, return that same promise
  // instead of starting a second session (which would cause a mismatch).
  if (initPromise) return initPromise

  initPromise = (async () => {
    const candidates = modelUrl ? [modelUrl] : [...MODEL_CANDIDATES]
    let lastError: unknown

    for (const url of candidates) {
      try {
        // Load model (decrypt if encrypted)
        const encryptedUrl = getModelUrl(url, true)
        const modelData = await loadModel(encryptedUrl)

        const sess = await ort.InferenceSession.create(modelData, {
          executionProviders: ['wasm'],
        })
        // Bug fix #2: assign the full state object atomically in one statement.
        // getAntiSpoofScore captures `activeState` once at the top of the call,
        // so it always sees a consistent (session + names + size) bundle.
        activeState = buildStateFromSession(url, sess)
        return
      } catch (error) {
        lastError = error
      }
    }

    console.error('Failed to load ONNX model:', lastError)
    throw lastError
  })().finally(() => {
    // Clear the in-flight promise so a future disposeOnnxModel() + reinit works.
    initPromise = null
  })

  return initPromise
}

/**
 * @returns Score 0–1 (1 = live, 0 = spoof)
 */
export async function getAntiSpoofScore(
  imageData: ImageData,
  faceBox?: FaceBox | null,
): Promise<number> {
  if (!activeState) {
    console.warn('ONNX model not initialized, returning default score')
    return 0.5
  }

  return antiSpoofQueue.enqueue(async () => {
    const state = activeState
    if (!state) return 0.5

    try {
      const tensor = preprocessImage(
        imageData,
        state.inputSize,
        state.inputSize,
        state.preprocessMode,
        faceBox ?? undefined,
      )

      const results = await state.session.run({ [state.inputName]: tensor })

      const outputTensor = results[state.outputName] ?? results[state.session.outputNames[0]]
      if (!outputTensor) {
        console.error('ONNX inference error: output tensor not found', Object.keys(results))
        return 0.5
      }

      const logits = outputTensor.data as Float32Array
      return logitsToLiveProbability(logits, state.preprocessMode)
    } catch (error) {
      console.error('ONNX inference error:', error)
      return 0.5
    }
  })
}

function preprocessImage(
  imageData: ImageData,
  targetW: number,
  targetH: number,
  mode: PreprocessMode,
  faceBox?: FaceBox,
): ort.Tensor {
  const srcCanvas = new OffscreenCanvas(imageData.width, imageData.height)
  const srcCtx = srcCanvas.getContext('2d')!
  srcCtx.putImageData(imageData, 0, 0)

  const dst = new OffscreenCanvas(targetW, targetH)
  const ctx = dst.getContext('2d')!

  if (faceBox) {
    const pad = 0.2
    const imgW = imageData.width
    const imgH = imageData.height

    const sx = Math.max(0, (faceBox.x - faceBox.width * pad) * imgW)
    const sy = Math.max(0, (faceBox.y - faceBox.height * pad) * imgH)
    const sw = Math.min(imgW - sx, faceBox.width * (1 + 2 * pad) * imgW)
    const sh = Math.min(imgH - sy, faceBox.height * (1 + 2 * pad) * imgH)

    ctx.drawImage(srcCanvas, sx, sy, sw, sh, 0, 0, targetW, targetH)
  } else {
    ctx.drawImage(srcCanvas, 0, 0, targetW, targetH)
  }

  const resized = ctx.getImageData(0, 0, targetW, targetH)
  const wh = targetW * targetH
  const float32 = new Float32Array(3 * wh)

  for (let i = 0; i < wh; i++) {
    const r = resized.data[i * 4] / 255
    const g = resized.data[i * 4 + 1] / 255
    const b = resized.data[i * 4 + 2] / 255

    if (mode === 'imagenet_rgb') {
      float32[i] = (r - IMAGENET_MEAN[0]) / IMAGENET_STD[0]
      float32[i + wh] = (g - IMAGENET_MEAN[1]) / IMAGENET_STD[1]
      float32[i + wh * 2] = (b - IMAGENET_MEAN[2]) / IMAGENET_STD[2]
    } else {
      float32[i] = b
      float32[i + wh] = g
      float32[i + wh * 2] = r
    }
  }

  return new ort.Tensor('float32', float32, [1, 3, targetH, targetW])
}

/**
 * Map logits → P(live)
 *
 * Model output conventions:
 *   n=1  → single sigmoid logit; P(live) = sigmoid(logit)
 *   n=2  → [spoof, live];  P(live) = softmax[1]
 *   n=3  → MiniFASNet 3-class [live, spoof, unknown];  P(live) = softmax[0]
 *            OR [spoof, live, unknown];  heuristic: pick max-scoring non-last
 *
 * MiniFASNet official convention: class 0 = live, class 1 = spoof, class 2 = unknown.
 * Our Colab binary model: class 0 = spoof, class 1 = live (matches CrossEntropy target).
 *
 * We disambiguate by checking the `preprocessMode` stored on the session.
 * Since this function doesn't have direct access, we rely on the already-resolved
 * `preprocessMode` to pick the correct index:
 *   - 'imagenet_rgb' (Colab binary): n=2 → live=1
 *   - 'minifasnet_bgr' (MiniFASNet): n=3 → live=0
 *
 * For safety we export a variant that takes the mode explicitly.
 */
function logitsToLiveProbability(logits: Float32Array, mode: PreprocessMode = 'imagenet_rgb'): number {
  const n = logits.length
  if (n === 0) return 0.5

  if (n === 1) {
    // single sigmoid — higher = more live
    return 1 / (1 + Math.exp(-logits[0]))
  }

  // Stable softmax
  let max = logits[0]
  for (let i = 1; i < n; i++) {
    if (logits[i] > max) max = logits[i]
  }

  let sum = 0
  const exps = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    exps[i] = Math.exp(logits[i] - max)
    sum += exps[i]
  }

  if (n === 2) {
    // Disambiguate by preprocessMode:
    //   'minifasnet_bgr' → [live=0, spoof=1]  (MiniFASNet official)
    //   'imagenet_rgb'   → [spoof=0, live=1]  (Colab binary)
    return mode === 'minifasnet_bgr' ? exps[0] / sum : exps[1] / sum
  }

  if (n === 3) {
    if (mode === 'minifasnet_bgr') {
      // Official MiniFASNet: [live=0, spoof=1, unknown=2]
      return exps[0] / sum
    }
    // Fallback 3-class with imagenet_rgb: assume [spoof=0, live=1, unknown=2]
    return exps[1] / sum
  }

  // n > 3: assume index 1 = live (most common convention)
  return exps[1] / sum
}

export function isOnnxReady(): boolean {
  return activeState !== null
}

export async function disposeOnnxModel(): Promise<void> {
  await antiSpoofQueue.drain()
  const state = activeState
  activeState = null
  if (state) {
    await state.session.release()
  }
}
