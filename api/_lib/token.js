import crypto from 'node:crypto'

const BASE62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
const LETTERS = 'abcdefghijklmnopqrstuvwxyz'

export function generateRandomBase62Token(length = 16) {
  const chars = []
  while (chars.length < length) {
    const bytes = crypto.randomBytes(length)
    for (const value of bytes) {
      if (value < 248) {
        chars.push(BASE62[value % 62])
        if (chars.length === length) break
      }
    }
  }
  return chars.join('')
}

function randomChars(alphabet, length) {
  const chars = []
  while (chars.length < length) {
    const bytes = crypto.randomBytes(length)
    for (const value of bytes) {
      if (value < Math.floor(256 / alphabet.length) * alphabet.length) {
        chars.push(alphabet[value % alphabet.length])
        if (chars.length === length) break
      }
    }
  }
  return chars.join('')
}

export function generateFriendlyToken(length = 6) {
  return randomChars(LETTERS, length)
}
