/**
 * Serializes onnxruntime-web session.run() calls.
 * Concurrent runs on the same InferenceSession throw "Session already started" / "Session mismatch".
 */
export class OnnxRunQueue {
  private tail: Promise<unknown> = Promise.resolve()

  enqueue<T>(task: () => Promise<T>): Promise<T> {
    let resolve: (value: T) => void
    let reject: (error: unknown) => void

    const promise = new Promise<T>((res, rej) => {
      resolve = res
      reject = rej
    })

    this.tail = this.tail.then(
      async () => {
        try {
          const result = await task()
          resolve(result)
        } catch (error) {
          reject(error)
        }
      },
      async () => {
        try {
          const result = await task()
          resolve(result)
        } catch (error) {
          reject(error)
        }
      }
    )

    return promise
  }

  async drain(): Promise<void> {
    await this.tail
  }
}
