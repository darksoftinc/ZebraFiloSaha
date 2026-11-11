import { safeStorage } from 'electron'
import { Buffer } from 'node:buffer'

const ENC_PREFIX = 'enc:'
const PLAIN_PREFIX = 'plain:'

export function encryptSecret(value: string): string {
  if (!value) return ''
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return ENC_PREFIX + safeStorage.encryptString(value).toString('base64')
    }
  } catch {
    // DPAPI kullanılamıyorsa geri dönüş.
  }
  return PLAIN_PREFIX + Buffer.from(value, 'utf8').toString('base64')
}

export function decryptSecret(value: string | null | undefined): string {
  if (!value) return ''
  if (value.startsWith(ENC_PREFIX)) {
    try {
      return safeStorage.decryptString(Buffer.from(value.slice(ENC_PREFIX.length), 'base64'))
    } catch {
      return ''
    }
  }
  if (value.startsWith(PLAIN_PREFIX)) {
    return Buffer.from(value.slice(PLAIN_PREFIX.length), 'base64').toString('utf8')
  }
  return value
}
