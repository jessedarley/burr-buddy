import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
let DatabaseSync
try {
  ;({ DatabaseSync } = require('node:sqlite'))
} catch {
  DatabaseSync = null
}

let db
let usingMemoryStore = false
const memoryStore = new Map()

function getDbPath() {
  if (process.env.BURR_BUDDY_DB_PATH) return process.env.BURR_BUDDY_DB_PATH
  if (process.env.VERCEL) return path.join(os.tmpdir(), 'burrbuddy.sqlite')
  return path.join(process.cwd(), 'data', 'burrbuddy.sqlite')
}

function enableMemoryStore() {
  usingMemoryStore = true
}

function initDb(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      token TEXT PRIMARY KEY,
      senderEmail TEXT NOT NULL,
      senderMessage TEXT NOT NULL,
      emoji TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      receiverReply TEXT,
      repliedAt TEXT
    )
  `)
}

export function getDb() {
  if (usingMemoryStore) return null
  if (!db) {
    if (!DatabaseSync) {
      enableMemoryStore()
      return null
    }
    const dbPath = getDbPath()
    const dbDir = path.dirname(dbPath)
    try {
      fs.mkdirSync(dbDir, { recursive: true })
      db = new DatabaseSync(dbPath)
      initDb(db)
    } catch {
      enableMemoryStore()
      return null
    }
  }
  return db
}

export function insertMessageRecord(record) {
  const database = getDb()
  if (!database) {
    memoryStore.set(record.token, {
      token: record.token,
      senderEmail: record.senderEmail,
      senderMessage: record.senderMessage,
      emoji: record.emoji,
      createdAt: record.createdAt,
      receiverReply: null,
      repliedAt: null,
    })
    return
  }
  const statement = database.prepare(`
    INSERT INTO messages (token, senderEmail, senderMessage, emoji, createdAt)
    VALUES (?, ?, ?, ?, ?)
  `)
  statement.run(record.token, record.senderEmail, record.senderMessage, record.emoji, record.createdAt)
}

export function getMessageRecordByToken(token) {
  const database = getDb()
  if (!database) {
    return memoryStore.get(token) || null
  }
  const statement = database.prepare(`
    SELECT token, senderEmail, senderMessage, emoji, createdAt, receiverReply, repliedAt
    FROM messages
    WHERE token = ?
  `)
  return statement.get(token)
}

export function markReply(token, reply, repliedAt) {
  const database = getDb()
  if (!database) {
    const existing = memoryStore.get(token)
    if (!existing || existing.receiverReply) return 0
    memoryStore.set(token, {
      ...existing,
      receiverReply: reply,
      repliedAt,
    })
    return 1
  }
  const statement = database.prepare(`
    UPDATE messages
    SET receiverReply = ?, repliedAt = ?
    WHERE token = ? AND receiverReply IS NULL
  `)
  const result = statement.run(reply, repliedAt, token)
  return result.changes || 0
}
