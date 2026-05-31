import * as ort from 'onnxruntime-web'
import type { FaceBox } from '../core/types'
import { drawFaceBoxPatch } from '../utils/landmarkCrop'
import { canvasToImageNetTensor } from '../utils/onnxPreprocess'
import { OnnxRunQueue } from '../utils/onnxRunQueue'
import {
  stepNodPitch,
  stepYawAngle,
  NOD_STEP_RAD,
  YAW_STEP_RAD,
  type NodChallengeState,
  type YawChallengeState,
} from '../utils/challengeDetector'

const HEAD_POSE_MODEL_URL = '/models/head_pose_model.onnx'
const INPUT_SIZE = 224

export type HeadPoseAngles = {
  yaw: number
  pitch: number
  roll: number
}

let headPoseSession: ort.InferenceSession | null = null
let initPromise: Promise<void> | null = null
const headPoseQueue = new OnnxRunQueue()

export function initHeadPoseModel(): Promise<void> {
  if (headPoseSession) return Promise.resolve()
  if (initPromise) return initPromise

  initPromise = (async () => {
    try {
      headPoseSession = await ort.InferenceSession.create(HEAD_POSE_MODEL_URL, {
        executionProviders: ['wasm'],
      })
      console.log('✅ head_pose_model.onnx loaded (nod / yaw challenges)')
    } catch (error) {
      console.info('head_pose_model.onnx not loaded — using landmark nod/yaw', error)
    }
  })().finally(() => {
    initPromise = null
  })

  return initPromise
}

export function isHeadPoseReady(): boolean {
  return headPoseSession !== null
}

export async function getHeadPoseAngles(
  imageData: ImageData,
  faceBox: FaceBox,
): Promise<HeadPoseAngles | null> {
  if (!headPoseSession) return null

  return headPoseQueue.enqueue(async () => {
    const session = headPoseSession
    if (!session) return null

    try {
      const canvas = drawFaceBoxPatch(imageData, faceBox, INPUT_SIZE)
      const tensor = canvasToImageNetTensor(canvas, INPUT_SIZE, INPUT_SIZE)
      const inputName = session.inputNames[0] ?? 'input'
      const outputName = session.outputNames[0] ?? 'output'
      const result = await session.run({ [inputName]: tensor })
      const output = result[outputName] ?? result[session.outputNames[0]]
      if (!output) return null

      const data = output.data as Float32Array
      return {
        yaw: data[0] ?? 0,
        pitch: data[1] ?? 0,
        roll: data[2] ?? 0,
      }
    } catch (error) {
      console.error('head_pose inference error:', error)
      return null
    }
  })
}

export function updateNodFromHeadPose(state: NodChallengeState, angles: HeadPoseAngles): void {
  stepNodPitch(angles.pitch, state, NOD_STEP_RAD)
}

export function updateYawFromHeadPose(state: YawChallengeState, angles: HeadPoseAngles): void {
  stepYawAngle(angles.yaw, state, YAW_STEP_RAD)
}

export async function disposeHeadPoseModel(): Promise<void> {
  await headPoseQueue.drain()
  if (headPoseSession) {
    await headPoseSession.release()
    headPoseSession = null
  }
}
