/**
 * Lazy loading utilities for heavy dependencies
 *
 * This module provides lazy loading for MediaPipe and ONNX models
 * to improve initial bundle size and loading performance.
 */

/**
 * Lazy load MediaPipe FaceLandmarker
 */
export async function loadMediaPipe() {
  const { initFaceLandmarker } = await import('../adapters/mediapipeAdapter')
  return initFaceLandmarker()
}

/**
 * Lazy load ONNX Anti-Spoof model
 */
export async function loadAntiSpoofModel() {
  const { initAntiSpoofModel } = await import('../adapters/onnxAntiSpoofAdapter')
  return initAntiSpoofModel()
}

/**
 * Lazy load ONNX Challenge models (eye state, smile detection)
 */
export async function loadChallengeModels() {
  const { initChallengeModels } = await import('../adapters/onnxChallengeAdapter')
  return initChallengeModels()
}

/**
 * Preload all models in parallel for faster initialization
 */
export async function preloadAllModels() {
  return Promise.all([
    loadMediaPipe(),
    loadAntiSpoofModel(),
    loadChallengeModels(),
  ])
}

/**
 * Check if models are already loaded
 * Note: This function is disabled in bundled SDK mode
 */
export function areModelsLoaded(): boolean {
  // Disabled in bundled mode - always return false
  return false
}

/**
 * Performance monitoring utilities
 */
export class PerformanceMonitor {
  private marks: Map<string, number> = new Map()
  private measures: Map<string, number[]> = new Map()

  /**
   * Start timing an operation
   */
  mark(name: string) {
    this.marks.set(name, performance.now())
  }

  /**
   * End timing and record duration
   */
  measure(name: string): number {
    const start = this.marks.get(name)
    if (!start) {
      console.warn(`No mark found for: ${name}`)
      return 0
    }

    const duration = performance.now() - start

    if (!this.measures.has(name)) {
      this.measures.set(name, [])
    }
    this.measures.get(name)!.push(duration)

    this.marks.delete(name)
    return duration
  }

  /**
   * Get average duration for an operation
   */
  getAverage(name: string): number {
    const durations = this.measures.get(name)
    if (!durations || durations.length === 0) return 0

    return durations.reduce((a, b) => a + b, 0) / durations.length
  }

  /**
   * Get all measurements
   */
  getAll(): Record<string, { count: number; average: number; total: number }> {
    const result: Record<string, { count: number; average: number; total: number }> = {}

    this.measures.forEach((durations, name) => {
      const total = durations.reduce((a, b) => a + b, 0)
      result[name] = {
        count: durations.length,
        average: total / durations.length,
        total,
      }
    })

    return result
  }

  /**
   * Clear all measurements
   */
  clear() {
    this.marks.clear()
    this.measures.clear()
  }
}

/**
 * FPS counter for monitoring frame rate
 */
export class FPSCounter {
  private frames: number[] = []
  private lastTime: number = performance.now()

  /**
   * Record a frame
   */
  tick() {
    const now = performance.now()
    const delta = now - this.lastTime
    this.lastTime = now

    this.frames.push(delta)

    // Keep only last 60 frames
    if (this.frames.length > 60) {
      this.frames.shift()
    }
  }

  /**
   * Get current FPS
   */
  getFPS(): number {
    if (this.frames.length === 0) return 0

    const avgDelta = this.frames.reduce((a, b) => a + b, 0) / this.frames.length
    return Math.round(1000 / avgDelta)
  }

  /**
   * Reset counter
   */
  reset() {
    this.frames = []
    this.lastTime = performance.now()
  }
}

/**
 * Memory usage monitor
 */
export function getMemoryUsage(): {
  used: number
  total: number
  percentage: number
} | null {
  if ('memory' in performance && (performance as any).memory) {
    const memory = (performance as any).memory
    return {
      used: Math.round(memory.usedJSHeapSize / 1024 / 1024),
      total: Math.round(memory.totalJSHeapSize / 1024 / 1024),
      percentage: Math.round((memory.usedJSHeapSize / memory.totalJSHeapSize) * 100),
    }
  }
  return null
}

/**
 * Check if WebGL is available and working
 */
export function checkWebGLSupport(): {
  supported: boolean
  version: string | null
  renderer: string | null
} {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')

    if (!gl) {
      return { supported: false, version: null, renderer: null }
    }

    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info')
    const renderer = debugInfo
      ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
      : 'Unknown'

    return {
      supported: true,
      version: gl instanceof WebGL2RenderingContext ? 'WebGL 2.0' : 'WebGL 1.0',
      renderer,
    }
  } catch {
    return { supported: false, version: null, renderer: null }
  }
}

/**
 * Check if WebAssembly is supported
 */
export function checkWASMSupport(): boolean {
  try {
    if (typeof WebAssembly === 'object' &&
        typeof WebAssembly.instantiate === 'function') {
      const module = new WebAssembly.Module(
        Uint8Array.of(0x0, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00)
      )
      return module instanceof WebAssembly.Module
    }
  } catch {
    return false
  }
  return false
}

/**
 * Get system capabilities
 */
export function getSystemCapabilities() {
  return {
    webgl: checkWebGLSupport(),
    wasm: checkWASMSupport(),
    memory: getMemoryUsage(),
    cores: navigator.hardwareConcurrency || 1,
    platform: navigator.platform,
    userAgent: navigator.userAgent,
  }
}

/**
 * Optimize video stream settings based on device capabilities
 */
export function getOptimalVideoConstraints(): MediaStreamConstraints {
  const capabilities = getSystemCapabilities()

  // Lower resolution for low-end devices
  const isLowEnd = capabilities.cores <= 2 ||
                   (capabilities.memory && capabilities.memory.total < 2048)

  return {
    video: {
      width: { ideal: isLowEnd ? 480 : 640 },
      height: { ideal: isLowEnd ? 640 : 480 },
      frameRate: { ideal: isLowEnd ? 24 : 30 },
      facingMode: 'user',
    },
    audio: false,
  }
}
