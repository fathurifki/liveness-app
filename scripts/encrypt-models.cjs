#!/usr/bin/env node

/**
 * ONNX Model Encryption Script (Single Pack)
 *
 * Packs and encrypts all .onnx files in public/models into a single models.pack.enc file
 * using XOR cipher with an obfuscated key.
 */

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

// Configuration
const MODELS_DIR = path.join(__dirname, '../public/models')
const KEY_LENGTH = 32 // 256 bits

function generateKey() {
  return crypto.randomBytes(KEY_LENGTH)
}

function xorCipher(data, key) {
  const result = Buffer.alloc(data.length)
  for (let i = 0; i < data.length; i++) {
    result[i] = data[i] ^ key[i % key.length]
  }
  return result
}

function obfuscateKey(key) {
  const hex = key.toString('hex')
  const chunks = []
  for (let i = 0; i < hex.length; i += 8) {
    chunks.push(hex.slice(i, i + 8))
  }
  return {
    chunks,
    length: key.length,
    checksum: crypto.createHash('sha256').update(key).digest('hex').slice(0, 8)
  }
}

function encryptModels() {
  console.log('🔐 ONNX Model Encryption Tool (Single Pack)\n')

  if (!fs.existsSync(MODELS_DIR)) {
    console.error(`❌ Models directory not found: ${MODELS_DIR}`)
    process.exit(1)
  }

  const key = generateKey()
  console.log(`✅ Generated ${KEY_LENGTH}-byte encryption key`)

  const files = fs.readdirSync(MODELS_DIR)
    .filter(f => f.endsWith('.onnx') && !f.endsWith('.enc.onnx'))

  if (files.length === 0) {
    console.log('⚠️  No .onnx files found to pack')
    return
  }

  console.log(`\n📦 Packing ${files.length} model(s)...\n`)

  const modelFiles = files.map(filename => ({
    name: filename,
    content: fs.readFileSync(path.join(MODELS_DIR, filename))
  }))

  const headerObj = {}
  let currentOffset = 0
  for (const file of modelFiles) {
    headerObj[file.name] = { offset: currentOffset, size: file.content.length }
    currentOffset += file.content.length
    console.log(`  ✅ ${file.name} (${(file.content.length / 1024).toFixed(2)} KB)`)
  }

  const headerJson = JSON.stringify(headerObj)
  const headerBuffer = Buffer.from(headerJson, 'utf-8')

  const headerLengthBuffer = Buffer.alloc(4)
  headerLengthBuffer.writeUInt32LE(headerBuffer.length, 0)

  const packedBuffer = Buffer.concat([headerLengthBuffer, headerBuffer, ...modelFiles.map(m => m.content)])

  console.log(`\n🔒 Encrypting pack (${(packedBuffer.length / 1024 / 1024).toFixed(2)} MB)...`)
  const encryptedBuffer = xorCipher(packedBuffer, key)

  const PACK_FILE = path.join(MODELS_DIR, 'models.pack.enc')
  fs.writeFileSync(PACK_FILE, encryptedBuffer)

  // Generate key configuration
  const obfuscated = obfuscateKey(key)
  const keyConfig = {
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    key: obfuscated,
    files: Object.keys(headerObj)
  }

  const keyConfigPath = path.join(__dirname, 'model-encryption-key.json')
  fs.writeFileSync(keyConfigPath, JSON.stringify(keyConfig, null, 2))

  const tsKeyPath = path.join(__dirname, '../src/utils/modelEncryptionKey.ts')
  const tsContent = generateTypeScriptKey(obfuscated)
  fs.writeFileSync(tsKeyPath, tsContent)

  // Delete old .enc.onnx files
  const oldFiles = fs.readdirSync(MODELS_DIR).filter(f => f.endsWith('.enc.onnx') && f !== 'models.pack.enc')
  for (const old of oldFiles) {
    fs.unlinkSync(path.join(MODELS_DIR, old))
  }

  console.log(`\n🔑 Key saved to: ${path.basename(keyConfigPath)}`)
  console.log(`📦 Pack saved to: models.pack.enc`)
  console.log(`📝 TypeScript key generated: ${path.relative(process.cwd(), tsKeyPath)}`)
  console.log(`\n✅ Packing & Encryption complete!`)
}

function generateTypeScriptKey(obfuscated) {
  return `/**
 * Model Encryption Key (Obfuscated)
 *
 * ⚠️ SECURITY WARNING:
 * This key is embedded in the client bundle and can be extracted.
 * XOR encryption provides obfuscation only, not cryptographic security.
 *
 * Generated: ${new Date().toISOString()}
 * Checksum: ${obfuscated.checksum}
 */

// Key chunks (obfuscated)
const _k = [
${obfuscated.chunks.map(chunk => `  '${chunk}'`).join(',\n')}
]

/**
 * Reconstruct encryption key from obfuscated chunks
 * @internal
 */
export function _getKey(): Uint8Array {
  const hex = _k.join('')
  const bytes = new Uint8Array(${obfuscated.length})
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

/**
 * Verify key integrity
 * @internal
 */
export function _verifyKey(): boolean {
  const key = _getKey()
  return key.length === ${obfuscated.length}
}
`
}

try {
  encryptModels()
} catch (error) {
  console.error('❌ Encryption failed:', error.message)
  process.exit(1)
}
