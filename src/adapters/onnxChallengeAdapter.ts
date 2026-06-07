import * as ort from 'onnxruntime-web'
import type { FaceLandmark } from '../core/types'
import { drawDualEyePatch, drawMouthPatch } from '../utils/landmarkCrop'
import { canvasToImageNetTensor, softmaxPositiveClass } from '../utils/onnxPreprocess'
import { OnnxRunQueue } from '../utils/onnxRunQueue'
import { loadModel, getModelUrl } from '../utils/modelDecryptor'

const SMILE_MODEL_URL = '/models/smile_detect.onnx'

// eye_state.onnx disabled — model underfit (selalu predict "open"), gunakan EAR heuristic
// const EYE_MODEL_URL = '/models/eye_state.onnx'

const EYE_W = 64
const EYE_H = 32
const SMILE_W = 96
const SMILE_H = 48

let eyeSession: ort.InferenceSession | null = null
let smileSession: ort.InferenceSession | null = null
let initPromise: Promise<void> | null = null

const eyeQueue = new OnnxRunQueue()
const smileQueue = new OnnxRunQueue()

export type BlinkOnnxState = {
  blinkCount: number
  lastBlink: number
  wasOpen: boolean
}

export async function initChallengeModels(): Promise<void> {
  if (eyeSession && smileSession) return Promise.resolve()
  if (initPromise) return initPromise

  initPromise = (async () => {
    const opts = { executionProviders: ['wasm'] as const }

    // eye_state.onnx: hasil inspeksi menunjukkan model selalu predict "open"
    // (P[0] > 0.93 untuk semua input termasuk dark/negative) → model underfit.
    // Disable ONNX blink detection, gunakan EAR landmark heuristic saja.
    // Uncomment baris di bawah jika model sudah diretrain dan validated.
    //
    // if (!eyeSession) {
    //   try {
    //     eyeSession = await ort.InferenceSession.create(EYE_MODEL_URL, opts)
    //     console.log('✅ eye_state.onnx loaded (blink challenge)')
    //   } catch (error) {
    //     console.info('eye_state.onnx not loaded — using landmark blink', error)
    //   }
    // }
    console.info('eye_state.onnx disabled — model underfit (always predicts open), using EAR heuristic')

    if (!smileSession) {
      try {
        // Load model (decrypt if encrypted)
        const encryptedUrl = getModelUrl(SMILE_MODEL_URL, true)
        const modelData = await loadModel(encryptedUrl)

        smileSession = await ort.InferenceSession.create(modelData, opts)
        console.log('✅ smile_detect.onnx loaded (smile challenge)')
      } catch (error) {
        console.info('smile_detect.onnx not loaded — using landmark smile', error)
      }
    }
  })().finally(() => {
    initPromise = null
  })

  return initPromise
}

export function isEyeStateReady(): boolean {
  return eyeSession !== null
}

export function isSmileDetectReady(): boolean {
  return smileSession !== null
}

export async function getEyeOpenProbability(
  imageData: ImageData,
  landmarks: FaceLandmark[],
): Promise<number> {
  if (!eyeSession) return 1

  return eyeQueue.enqueue(async () => {
    const session = eyeSession
    if (!session) return 1

    try {
      const canvas = drawDualEyePatch(imageData, landmarks, EYE_W, EYE_H)
      const tensor = canvasToImageNetTensor(canvas, EYE_W, EYE_H)
      const inputName = session.inputNames[0] ?? 'input'
      const outputName = session.outputNames[0] ?? 'output'
      const result = await session.run({ [inputName]: tensor })
      const output = result[outputName] ?? result[session.outputNames[0]]
      if (!output) return 1
      // eye_state.onnx: class_0 = open (prob tinggi saat mata terbuka)
      // class_1 = closed → P(open) = softmax[0]
      return softmaxPositiveClass(output.data as Float32Array, 0)
    } catch (error) {
      console.error('eye_state inference error:', error)
      return 1
    }
  })
}

export async function getSmileProbability(
  imageData: ImageData,
  landmarks: FaceLandmark[],
): Promise<number> {
  if (!smileSession) return 0

  return smileQueue.enqueue(async () => {
    const session = smileSession
    if (!session) return 0

    try {
      const canvas = drawMouthPatch(imageData, landmarks, SMILE_W, SMILE_H)
      const tensor = canvasToImageNetTensor(canvas, SMILE_W, SMILE_H)
      const inputName = session.inputNames[0] ?? 'input'
      const outputName = session.outputNames[0] ?? 'output'
      const result = await session.run({ [inputName]: tensor })
      const output = result[outputName] ?? result[session.outputNames[0]]
      if (!output) return 0
      return softmaxPositiveClass(output.data as Float32Array, 1)
    } catch (error) {
      console.error('smile_detect inference error:', error)
      return 0
    }
  })
}

export function updateBlinkFromEyeOnnx(state: BlinkOnnxState, probOpen: number): void {
  // 0.30 → lebih toleran terhadap mata setengah tertutup saat berkedip natural
  // Terlalu tinggi (0.45) menyebabkan kedip biasa sudah terhitung "closed" terus-menerus
  const closed = probOpen < 0.30
  const now = Date.now()

  if (closed && state.wasOpen && now - state.lastBlink > 250) {
    state.blinkCount++
    state.lastBlink = now
  }

  state.wasOpen = !closed
}

export function createBlinkOnnxState(): BlinkOnnxState {
  return { blinkCount: 0, lastBlink: 0, wasOpen: true }
}

export async function disposeChallengeModels(): Promise<void> {
  await Promise.all([eyeQueue.drain(), smileQueue.drain()])

  if (eyeSession) {
    await eyeSession.release()
    eyeSession = null
  }
  if (smileSession) {
    await smileSession.release()
    smileSession = null
  }
}
