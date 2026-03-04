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
let postgresClient = null
let postgresInitPromise = null

function getPostgresUrl() {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    ''
  ).trim()
}

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

function getDb() {
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

function toRecord(row) {
  if (!row) return null
  return {
    token: row.token,
    senderEmail: row.senderEmail,
    senderMessage: row.senderMessage,
    emoji: row.emoji,
    createdAt: row.createdAt,
    receiverReply: row.receiverReply,
    repliedAt: row.repliedAt,
  }
}

async function getPostgresClient() {
  const postgresUrl = getPostgresUrl()
  if (!postgresUrl) return null
  if (postgresClient) return postgresClient
  if (postgresInitPromise) return postgresInitPromise

  postgresInitPromise = import('postgres')
    .then(async ({ default: postgres }) => {
      const client = postgres(postgresUrl, {
        max: 1,
        prepare: false,
        ssl: process.env.NODE_ENV === 'production' ? 'require' : undefined,
      })
      await client`
        CREATE TABLE IF NOT EXISTS messages (
          "token" TEXT PRIMARY KEY,
          "senderEmail" TEXT NOT NULL,
          "senderMessage" TEXT NOT NULL,
          "emoji" TEXT NOT NULL,
          "createdAt" TEXT NOT NULL,
          "receiverReply" TEXT,
          "repliedAt" TEXT
        )
      `
      postgresClient = client
      return postgresClient
    })
    .catch(() => null)

  return postgresInitPromise
}

export async function insertMessageRecord(record) {
  const pg = await getPostgresClient()
  if (pg) {
    await pg`
      INSERT INTO messages ("token", "senderEmail", "senderMessage", "emoji", "createdAt")
      VALUES (${record.token}, ${record.senderEmail}, ${record.senderMessage}, ${record.emoji}, ${record.createdAt})
    `
    return
  }

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

export async function getMessageRecordByToken(token) {
  const pg = await getPostgresClient()
  if (pg) {
    const rows = await pg`
      SELECT "token", "senderEmail", "senderMessage", "emoji", "createdAt", "receiverReply", "repliedAt"
      FROM messages
      WHERE "token" = ${token}
      LIMIT 1
    `
    return toRecord(rows[0])
  }

  const database = getDb()
  if (!database) {
    return memoryStore.get(token) || null
  }
  const statement = database.prepare(`
    SELECT token, senderEmail, senderMessage, emoji, createdAt, receiverReply, repliedAt
    FROM messages
    WHERE token = ?
  `)
  return toRecord(statement.get(token))
}

export async function markReply(token, reply, repliedAt) {
  const pg = await getPostgresClient()
  if (pg) {
    const rows = await pg`
      UPDATE messages
      SET
        "receiverReply" = CASE
          WHEN "receiverReply" IS NULL OR "receiverReply" = '' THEN ${reply}
          ELSE "receiverReply" || E'\n' || ${reply}
        END,
        "repliedAt" = ${repliedAt}
      WHERE "token" = ${token}
      RETURNING "token"
    `
    return rows.length
  }

  const database = getDb()
  if (!database) {
    const existing = memoryStore.get(token)
    if (!existing) return 0
    memoryStore.set(token, {
      ...existing,
      receiverReply:
        !existing.receiverReply || !`${existing.receiverReply}`.trim()
          ? reply
          : `${existing.receiverReply}\n${reply}`,
      repliedAt,
    })
    return 1
  }
  const statement = database.prepare(`
    UPDATE messages
    SET
      receiverReply = CASE
        WHEN receiverReply IS NULL OR receiverReply = '' THEN ?
        ELSE receiverReply || char(10) || ?
      END,
      repliedAt = ?
    WHERE token = ?
  `)
  const result = statement.run(reply, reply, repliedAt, token)
  return result.changes || 0
}

export async function clearReplies(token) {
  const pg = await getPostgresClient()
  if (pg) {
    const rows = await pg`
      UPDATE messages
      SET
        "senderEmail" = '',
        "senderMessage" = '',
        "receiverReply" = NULL,
        "repliedAt" = NULL
      WHERE "token" = ${token}
      RETURNING "token"
    `
    return rows.length
  }

  const database = getDb()
  if (!database) {
    const existing = memoryStore.get(token)
    if (!existing) return 0
    memoryStore.set(token, {
      ...existing,
      senderEmail: '',
      senderMessage: '',
      receiverReply: null,
      repliedAt: null,
    })
    return 1
  }
  const statement = database.prepare(`
    UPDATE messages
    SET
      senderEmail = '',
      senderMessage = '',
      receiverReply = NULL,
      repliedAt = NULL
    WHERE token = ?
  `)
  const result = statement.run(token)
  return result.changes || 0
}
