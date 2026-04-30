'use strict';

/**
 * TASK-P3-005: 피드백 SQLite 저장소
 * better-sqlite3 prebuilt 미지원 환경(arm64, musl)에서는
 * JSON Lines 파일 fallback으로 자동 전환.
 */

const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.FEEDBACK_DATA_DIR
  ? path.resolve(process.env.FEEDBACK_DATA_DIR)
  : path.resolve(__dirname, '../../../data');

const DB_PATH = path.join(DATA_DIR, 'feedback.sqlite');
const JSON_PATH = path.join(DATA_DIR, 'feedback.jsonl');

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS feedback (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id   TEXT    NOT NULL,
    turn_id      TEXT    NOT NULL,
    rating       INTEGER,
    comment      TEXT,
    tool_sequence TEXT,
    answer_length_tokens INTEGER,
    created_at   TEXT    NOT NULL
  )
`;

const INSERT_SQL = `
  INSERT INTO feedback
    (session_id, turn_id, rating, comment, tool_sequence, answer_length_tokens, created_at)
  VALUES
    (?, ?, ?, ?, ?, ?, ?)
`;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function serializeToolSequence(toolSequence) {
  return toolSequence != null ? JSON.stringify(toolSequence) : null;
}

/** SQLite backend using better-sqlite3 */
class SqliteBackend {
  get type() { return 'sqlite'; }

  constructor(db) {
    this._db = db;
    this._insert = db.prepare(INSERT_SQL);
  }

  record({ sessionId, turnId, rating, comment, toolSequence, answerLengthTokens }) {
    this._insert.run(
      String(sessionId),
      String(turnId),
      rating != null ? Number(rating) : null,
      comment != null ? String(comment) : null,
      serializeToolSequence(toolSequence),
      answerLengthTokens != null ? Number(answerLengthTokens) : null,
      new Date().toISOString()
    );
  }

  close() {
    this._db.close();
  }
}

/** JSON Lines fallback for unsupported platforms (arm64, musl) */
class JsonFallbackBackend {
  get type() { return 'json'; }

  record({ sessionId, turnId, rating, comment, toolSequence, answerLengthTokens }) {
    const row = JSON.stringify({
      sessionId: String(sessionId),
      turnId: String(turnId),
      rating: rating != null ? Number(rating) : null,
      comment: comment != null ? String(comment) : null,
      toolSequence: serializeToolSequence(toolSequence),
      answerLengthTokens: answerLengthTokens != null ? Number(answerLengthTokens) : null,
      createdAt: new Date().toISOString(),
    });
    fs.appendFileSync(JSON_PATH, row + '\n', 'utf8');
  }

  close() {}
}

function createBackend(logger) {
  ensureDataDir();
  try {
    const Database = require('better-sqlite3');
    const db = new Database(DB_PATH);
    db.exec(CREATE_TABLE_SQL);
    return new SqliteBackend(db);
  } catch (err) {
    if (logger) {
      logger.warn('[feedback-store] better-sqlite3 unavailable, using JSON fallback', {
        reason: err.message,
        platform: process.platform,
        arch: process.arch,
      });
    }
    return new JsonFallbackBackend();
  }
}

class FeedbackStore {
  constructor({ logger } = {}) {
    this._logger = logger || null;
    this._backend = createBackend(logger);
  }

  /**
   * @param {{ sessionId: string, turnId: string, rating?: number,
   *           comment?: string, toolSequence?: string[],
   *           answerLengthTokens?: number }} entry
   */
  record(entry) {
    if (!entry || !entry.sessionId || !entry.turnId) {
      if (this._logger) {
        this._logger.warn('[feedback-store] record() called with missing sessionId or turnId');
      }
      return;
    }
    try {
      this._backend.record(entry);
    } catch (err) {
      if (this._logger) {
        this._logger.warn('[feedback-store] record() failed', { reason: err.message });
      }
    }
  }

  close() {
    this._backend.close();
  }

  /** 'sqlite' | 'json' */
  get backendType() {
    return this._backend.type;
  }
}

module.exports = { FeedbackStore };
