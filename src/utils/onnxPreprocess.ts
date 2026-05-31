import * as ort from 'onnxruntime-web'

const IMAGENET_MEAN = [0.485, 0.456, 0.406] as const
const IMAGENET_STD = [0.229, 0.224, 0.225] as const

/** RGB CHW tensor with ImageNet normalization (matches Colab training). */
export function canvasToImageNetTensor(
  canvas: OffscreenCanvas,
  width: number,
  height: number,
): ort.Tensor {
  const ctx = canvas.getContext('2d')!
  const { data } = ctx.getImageData(0, 0, width, height)
  const wh = width * height
  const float32 = new Float32Array(3 * wh)

  for (let i = 0; i < wh; i++) {
    const r = data[i * 4] / 255
    const g = data[i * 4 + 1] / 255
    const b = data[i * 4 + 2] / 255
    float32[i] = (r - IMAGENET_MEAN[0]) / IMAGENET_STD[0]
    float32[i + wh] = (g - IMAGENET_MEAN[1]) / IMAGENET_STD[1]
    float32[i + wh * 2] = (b - IMAGENET_MEAN[2]) / IMAGENET_STD[2]
  }

  return new ort.Tensor('float32', float32, [1, 3, height, width])
}

export function softmaxPositiveClass(logits: Float32Array, positiveIndex = 1): number {
  if (logits.length === 0) return 0
  if (logits.length === 1) return 1 / (1 + Math.exp(-logits[0]))

  let max = logits[0]
  for (let i = 1; i < logits.length; i++) {
    if (logits[i] > max) max = logits[i]
  }

  let sum = 0
  const exps = new Float32Array(logits.length)
  for (let i = 0; i < logits.length; i++) {
    exps[i] = Math.exp(logits[i] - max)
    sum += exps[i]
  }

  return exps[positiveIndex] / sum
}
