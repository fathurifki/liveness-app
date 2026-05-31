import { FaceLandmarker, FilesetResolver, FaceLandmarkerResult } from '@mediapipe/tasks-vision'
import type { FaceDetectionResult, FaceBox, FaceLandmark } from '../core/types'

/**
 * MediaPipe Adapter
 * Wrapper untuk @mediapipe/tasks-vision FaceLandmarker
 */

let faceLandmarker: FaceLandmarker | null = null
let isInitialized = false

/**
 * Initialize MediaPipe FaceLandmarker
 * Load model dari CDN (MediaPipe WASM + model task file)
 */
export async function initFaceLandmarker(): Promise<void> {
  if (isInitialized && faceLandmarker) {
    return
  }

  try {
    // WASM served locally from public/mediapipe/wasm/ — no CDN version mismatch
    const vision = await FilesetResolver.forVisionTasks('/mediapipe/wasm')

    faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
        delegate: 'GPU', // fallback otomatis ke CPU jika WebGL tidak tersedia
      },
      runningMode: 'VIDEO', // optimal untuk stream
      numFaces: 1, // hanya deteksi 1 wajah
      minFaceDetectionConfidence: 0.5,
      minFacePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    })

    isInitialized = true
  } catch (error) {
    console.error('Failed to initialize FaceLandmarker:', error)
    throw error
  }
}

/**
 * Detect face from video element
 * Returns 468 facial landmarks (FaceMesh v2)
 */
export function detectFace(
  video: HTMLVideoElement,
  timestamp: number
): FaceDetectionResult {
  // readyState >= 2 (HAVE_CURRENT_DATA) means the video has decoded at least one frame
  if (!faceLandmarker || !isInitialized || video.readyState < 2 || video.videoWidth === 0) {
    return {
      detected: false,
      landmarks: [],
      boundingBox: null,
    }
  }

  try {
    const result: FaceLandmarkerResult = faceLandmarker.detectForVideo(video, timestamp)

    if (!result.faceLandmarks || result.faceLandmarks.length === 0) {
      return {
        detected: false,
        landmarks: [],
        boundingBox: null,
      }
    }

    // Get first face (numFaces: 1)
    const landmarks: FaceLandmark[] = result.faceLandmarks[0].map(lm => ({
      x: lm.x,
      y: lm.y,
      z: lm.z,
    }))

    // Calculate bounding box manually (MediaPipe Tasks Vision tidak return bbox langsung)
    const boundingBox = calculateBoundingBox(landmarks)

    return {
      detected: true,
      landmarks,
      boundingBox,
      confidence: 1.0, // MediaPipe tidak expose per-face confidence di Tasks Vision
    }
  } catch (error) {
    console.error('Face detection error:', error)
    return {
      detected: false,
      landmarks: [],
      boundingBox: null,
    }
  }
}

/**
 * Calculate bounding box from landmarks
 */
function calculateBoundingBox(landmarks: FaceLandmark[]): FaceBox {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const lm of landmarks) {
    if (lm.x < minX) minX = lm.x
    if (lm.y < minY) minY = lm.y
    if (lm.x > maxX) maxX = lm.x
    if (lm.y > maxY) maxY = lm.y
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  }
}

/**
 * Check if model is ready
 */
export function isReady(): boolean {
  return isInitialized && faceLandmarker !== null
}

/**
 * Cleanup resources
 */
export function dispose(): void {
  if (faceLandmarker) {
    faceLandmarker.close()
    faceLandmarker = null
    isInitialized = false
  }
}
