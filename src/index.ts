/**
 * Face Liveness SDK
 *
 * Production-ready liveness detection SDK using MediaPipe FaceMesh + ONNX models
 *
 * @packageDocumentation
 */

// ============================================================================
// Core Types & Interfaces
// ============================================================================

export type {
  LivenessStatus,
  FailReason,
  ChallengeType,
  LivenessEngineConfig,
  FaceLandmark,
  FaceBox,
  FaceDetectionResult,
  QualityCheckResult,
  AntiSpoofResult,
  Challenge,
  ChallengeResult,
  LivenessCheckResult,
  DebugMetrics,
  LivenessAdapter,
} from './core/types'

export { DEFAULT_CONFIG } from './core/types'

// ============================================================================
// Main Hook
// ============================================================================

export { useLiveness } from './hooks/useLiveness'
export type { UseLivenessOptions, UseLivenessReturn } from './hooks/useLiveness'

// ============================================================================
// UI Components
// ============================================================================

export { LivenessCamera } from './components/LivenessCamera'
export { LivenessCameraModern } from './components/LivenessCameraModern'
export type { LivenessCameraProps } from './components/LivenessCameraModern'

// ============================================================================
// Utilities (Advanced Usage)
// ============================================================================

export { runQualityCheck, getQualityWarningMessage } from './utils/qualityCheck'
export { aggregateScore } from './utils/scoreAggregator'
export { generateChallenges } from './utils/challengeDetector'

// Error Handling
export {
  LivenessErrorBoundary,
  useErrorHandler,
  LivenessError,
  LivenessErrorType,
  getErrorMessage,
  retryWithBackoff,
} from './utils/errorHandling'

// Performance & Optimization
export {
  loadMediaPipe,
  loadAntiSpoofModel,
  loadChallengeModels,
  preloadAllModels,
  areModelsLoaded,
  PerformanceMonitor,
  FPSCounter,
  getMemoryUsage,
  checkWebGLSupport,
  checkWASMSupport,
  getSystemCapabilities,
  getOptimalVideoConstraints,
} from './utils/performance'

// ============================================================================
// Adapters (Advanced Usage)
// ============================================================================

export {
  initFaceLandmarker,
  detectFace,
  isReady as isMediaPipeReady,
  dispose as disposeMediaPipe,
} from './adapters/mediapipeAdapter'

export {
  initAntiSpoofModel,
  getAntiSpoofScore,
  isOnnxReady as isAntiSpoofReady,
  disposeOnnxModel as disposeAntiSpoof,
} from './adapters/onnxAntiSpoofAdapter'

// ============================================================================
// Version
// ============================================================================

export const VERSION = '1.0.0'
