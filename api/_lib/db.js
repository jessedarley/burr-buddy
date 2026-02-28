import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const dbPath = process.env.BURR_BUDDY_DB_PATH || path.join(process.cwd(), 'data', 'burrbuddy.sqlite')
const dbDir = path.dirname(dbPath)
fs.mkdirSync(dbDir, { recursive: true })

let db

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
  if (!db) {
    db = new DatabaseSync(dbPath)
    initDb(db)
  }
  return db
}

export function insertMessageRecord(record) {
  const database = getDb()
  const statement = database.prepare(`
    INSERT INTO messages (token, senderEmail, senderMessage, emoji, createdAt)
    VALUES (?, ?, ?, ?, ?)
  `)
  statement.run(record.token, record.senderEmail, record.senderMessage, record.emoji, record.createdAt)
}

export function getMessageRecordByToken(token) {
  const database = getDb()
  const statement = database.prepare(`
    SELECT token, senderEmail, senderMessage, emoji, createdAt, receiverReply, repliedAt
    FROM messages
    WHERE token = ?
  `)
  return statement.get(token)
}

export function markReply(token, reply, repliedAt) {
  const database = getDb()
  const statement = database.prepare(`
    UPDATE messages
    SET receiverReply = ?, repliedAt = ?
    WHERE token = ? AND receiverReply IS NULL
  `)
  const result = statement.run(reply, repliedAt, token)
  return result.changes || 0
}
