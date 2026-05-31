import type { FaceBox, FaceLandmark } from '../core/types'

const LEFT_EYE_INDICES = [33, 160, 158, 133, 153, 144, 157, 173]
const RIGHT_EYE_INDICES = [362, 385, 387, 263, 373, 380, 386, 398]
const MOUTH_INDICES = [61, 291, 13, 14, 78, 308, 82, 312, 87, 317]

export function getLandmarkBounds(
  landmarks: FaceLandmark[],
  indices: number[],
  imageW: number,
  imageH: number,
  padRatio = 0.35,
): { x: number; y: number; w: number; h: number } {
  const pts = indices.map((i) => landmarks[i]).filter(Boolean)
  if (pts.length === 0) {
    return { x: 0, y: 0, w: imageW, h: imageH }
  }

  let minX = pts[0].x
  let maxX = pts[0].x
  let minY = pts[0].y
  let maxY = pts[0].y

  for (const p of pts) {
    minX = Math.min(minX, p.x)
    maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y)
    maxY = Math.max(maxY, p.y)
  }

  const boxW = (maxX - minX) * imageW
  const boxH = (maxY - minY) * imageH
  const padW = boxW * padRatio
  const padH = boxH * padRatio

  const x = Math.max(0, minX * imageW - padW)
  const y = Math.max(0, minY * imageH - padH)
  const w = Math.min(imageW - x, boxW + padW * 2)
  const h = Math.min(imageH - y, boxH + padH * 2)

  return { x, y, w, h }
}

/**
 * eye_state.onnx expects [1, 3, 32, 64] — left eye 32×32 + right eye 32×32 side by side.
 */
export function drawDualEyePatch(
  imageData: ImageData,
  landmarks: FaceLandmark[],
  outW = 64,
  outH = 32,
): OffscreenCanvas {
  const src = new OffscreenCanvas(imageData.width, imageData.height)
  const srcCtx = src.getContext('2d')!
  srcCtx.putImageData(imageData, 0, 0)

  const dst = new OffscreenCanvas(outW, outH)
  const dstCtx = dst.getContext('2d')!
  dstCtx.fillStyle = '#000'
  dstCtx.fillRect(0, 0, outW, outH)

  const halfW = outW / 2
  const regions = [
    { indices: LEFT_EYE_INDICES, dx: 0 },
    { indices: RIGHT_EYE_INDICES, dx: halfW },
  ]

  for (const { indices, dx } of regions) {
    const { x, y, w, h } = getLandmarkBounds(
      landmarks,
      indices,
      imageData.width,
      imageData.height,
      0.45,
    )
    dstCtx.drawImage(src, x, y, w, h, dx, 0, halfW, outH)
  }

  return dst
}

/**
 * smile_detect.onnx expects [1, 3, 48, 96].
 */
export function drawMouthPatch(
  imageData: ImageData,
  landmarks: FaceLandmark[],
  outW = 96,
  outH = 48,
): OffscreenCanvas {
  const src = new OffscreenCanvas(imageData.width, imageData.height)
  const srcCtx = src.getContext('2d')!
  srcCtx.putImageData(imageData, 0, 0)

  const { x, y, w, h } = getLandmarkBounds(
    landmarks,
    MOUTH_INDICES,
    imageData.width,
    imageData.height,
    0.5,
  )

  const dst = new OffscreenCanvas(outW, outH)
  const dstCtx = dst.getContext('2d')!
  dstCtx.drawImage(src, x, y, w, h, 0, 0, outW, outH)
  return dst
}

/** head_pose_model.onnx — crop wajah ke 224×224 (ImageNet). */
export function drawFaceBoxPatch(
  imageData: ImageData,
  faceBox: FaceBox,
  outSize = 224,
  padRatio = 0.15,
): OffscreenCanvas {
  const src = new OffscreenCanvas(imageData.width, imageData.height)
  const srcCtx = src.getContext('2d')!
  srcCtx.putImageData(imageData, 0, 0)

  const imgW = imageData.width
  const imgH = imageData.height
  const sx = Math.max(0, (faceBox.x - faceBox.width * padRatio) * imgW)
  const sy = Math.max(0, (faceBox.y - faceBox.height * padRatio) * imgH)
  const sw = Math.min(imgW - sx, faceBox.width * (1 + 2 * padRatio) * imgW)
  const sh = Math.min(imgH - sy, faceBox.height * (1 + 2 * padRatio) * imgH)

  const dst = new OffscreenCanvas(outSize, outSize)
  const dstCtx = dst.getContext('2d')!
  dstCtx.drawImage(src, sx, sy, sw, sh, 0, 0, outSize, outSize)
  return dst
}
