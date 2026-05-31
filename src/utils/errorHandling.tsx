import React, { Component, ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void
}

interface State {
  hasError: boolean
  error: Error | null
}

/**
 * Error Boundary component for catching and handling errors in the liveness detection flow
 *
 * @example
 * ```tsx
 * <LivenessErrorBoundary
 *   onError={(error) => console.error('Liveness error:', error)}
 *   fallback={<div>Something went wrong. Please refresh.</div>}
 * >
 *   <LivenessCamera />
 * </LivenessErrorBoundary>
 * ```
 */
export class LivenessErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('LivenessErrorBoundary caught error:', error, errorInfo)
    this.props.onError?.(error, errorInfo)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-gray-800 rounded-2xl p-8 text-center">
            <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-red-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-white mb-2">
              Something went wrong
            </h2>
            <p className="text-gray-400 text-sm mb-6">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
            <button
              onClick={this.handleReset}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

/**
 * Hook for handling errors in functional components
 */
export function useErrorHandler() {
  const [error, setError] = React.useState<Error | null>(null)

  const handleError = React.useCallback((err: Error) => {
    console.error('Error caught:', err)
    setError(err)
  }, [])

  const clearError = React.useCallback(() => {
    setError(null)
  }, [])

  return { error, handleError, clearError }
}

/**
 * Common error types in liveness detection
 */
export enum LivenessErrorType {
  CAMERA_ACCESS_DENIED = 'CAMERA_ACCESS_DENIED',
  CAMERA_NOT_FOUND = 'CAMERA_NOT_FOUND',
  MODEL_LOAD_FAILED = 'MODEL_LOAD_FAILED',
  WEBGL_NOT_SUPPORTED = 'WEBGL_NOT_SUPPORTED',
  WASM_NOT_SUPPORTED = 'WASM_NOT_SUPPORTED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

/**
 * Custom error class for liveness detection
 */
export class LivenessError extends Error {
  type: LivenessErrorType
  originalError?: Error

  constructor(type: LivenessErrorType, message: string, originalError?: Error) {
    super(message)
    this.name = 'LivenessError'
    this.type = type
    this.originalError = originalError
  }
}

/**
 * Get user-friendly error message
 */
export function getErrorMessage(error: Error | LivenessError): string {
  if (error instanceof LivenessError) {
    switch (error.type) {
      case LivenessErrorType.CAMERA_ACCESS_DENIED:
        return 'Camera access denied. Please allow camera access in your browser settings.'
      case LivenessErrorType.CAMERA_NOT_FOUND:
        return 'No camera found. Please connect a camera and try again.'
      case LivenessErrorType.MODEL_LOAD_FAILED:
        return 'Failed to load detection models. Please check your internet connection.'
      case LivenessErrorType.WEBGL_NOT_SUPPORTED:
        return 'WebGL is not supported in your browser. Please use a modern browser.'
      case LivenessErrorType.WASM_NOT_SUPPORTED:
        return 'WebAssembly is not supported in your browser. Please use a modern browser.'
      case LivenessErrorType.NETWORK_ERROR:
        return 'Network error. Please check your internet connection.'
      default:
        return error.message || 'An unexpected error occurred.'
    }
  }

  return error.message || 'An unexpected error occurred.'
}

/**
 * Retry utility with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error | null = null

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error as Error
      if (i < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, i)
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }
  }

  throw lastError
}
