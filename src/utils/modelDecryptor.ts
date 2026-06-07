/**
 * ONNX Model Decryption Utility
 *
 * Provides runtime decryption for encrypted ONNX models before loading into
 * ONNX Runtime Web. Uses XOR cipher with key embedded in the bundle.
 *
 * ⚠️ SECURITY WARNING:
 * This is client-side obfuscation, not true encryption. The key is embedded
 * in the JavaScript bundle and can be extracted by determined attackers.
 * Use this to raise the bar for casual extraction, not for cryptographic security.
 */

import { _getKey, _verifyKey } from './modelEncryptionKey'

let packCache: Record<string, Uint8Array> | null = null
let fetchPackPromise: Promise<void> | null = null

function xorDecrypt(data: Uint8Array, key: Uint8Array): Uint8Array {
  const result = new Uint8Array(data.length)
  for (let i = 0; i < data.length; i++) {
    result[i] = data[i] ^ key[i % key.length]
  }
  return result
}

export function isEncryptedModel(url: string): boolean {
  return url.endsWith('.enc.onnx')
}

async function ensurePackLoaded() {
  if (packCache) return
  if (fetchPackPromise) return fetchPackPromise

  fetchPackPromise = (async () => {
    if (!_verifyKey()) throw new Error('Key integrity check failed')

    const response = await fetch('/models/models.pack.enc')
    if (!response.ok) throw new Error(`Failed to fetch models pack`)

    const encryptedData = new Uint8Array(await response.arrayBuffer())
    const decryptedData = xorDecrypt(encryptedData, _getKey())

    const headerLenView = new DataView(decryptedData.buffer, decryptedData.byteOffset, 4)
    const headerLen = headerLenView.getUint32(0, true)

    const headerBytes = decryptedData.subarray(4, 4 + headerLen)
    const headerStr = new TextDecoder('utf-8').decode(headerBytes)
    const header = JSON.parse(headerStr)

    const payloadOffset = 4 + headerLen
    const cache: Record<string, Uint8Array> = {}

    for (const [filename, info] of Object.entries(header) as [string, {offset: number, size: number}][]) {
      const start = payloadOffset + info.offset
      cache[filename] = decryptedData.slice(start, start + info.size)
    }

    packCache = cache
  })().finally(() => {
    fetchPackPromise = null
  })

  return fetchPackPromise
}

export async function fetchAndDecryptModel(url: string): Promise<ArrayBuffer> {
  await ensurePackLoaded()

  const filename = url.split('/').pop()?.replace('.enc.onnx', '.onnx')
  if (!filename || !packCache || !packCache[filename]) {
    throw new Error(`Model ${filename} not found in encrypted pack`)
  }

  return packCache[filename].buffer
}

export async function loadModel(url: string): Promise<string | ArrayBuffer> {
  if (isEncryptedModel(url)) {
    return fetchAndDecryptModel(url)
  }
  return url
}

export function getModelUrl(originalUrl: string, useEncrypted = true): string {
  if (!useEncrypted) return originalUrl
  if (originalUrl.endsWith('.onnx') && !originalUrl.endsWith('.enc.onnx')) {
    return originalUrl.replace(/\.onnx$/, '.enc.onnx')
  }
  return originalUrl
}
