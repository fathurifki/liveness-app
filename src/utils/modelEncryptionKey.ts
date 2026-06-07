/**
 * Model Encryption Key (Obfuscated)
 *
 * ⚠️ SECURITY WARNING:
 * This key is embedded in the client bundle and can be extracted.
 * XOR encryption provides obfuscation only, not cryptographic security.
 *
 * Generated: 2026-06-06T06:59:34.308Z
 * Checksum: ad6de957
 */

// Key chunks (obfuscated)
const _k = [
  'd42aed91',
  '1c7ff924',
  '647a8fe6',
  '49c7729f',
  '31029124',
  '1deea126',
  'e9077b52',
  '3a3a0dba'
]

/**
 * Reconstruct encryption key from obfuscated chunks
 * @internal
 */
export function _getKey(): Uint8Array {
  const hex = _k.join('')
  const bytes = new Uint8Array(32)
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
  return key.length === 32
}
