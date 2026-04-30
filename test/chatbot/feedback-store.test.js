'use strict';

/**
 * TASK-P3-005: feedback-store.test.js
 * Run: node test/chatbot/feedback-store.test.js
 * Expected stdout: sqlite OK
 *
 * DoD: SQLite CRUD 단위 테스트 통과
 * 케이스: 정상 기록 / null 선택 필드 / 다중 레코드 / backendType 확인 /
 *         JSON fallback 시뮬레이션 / null sessionId 가드 / record() 실패 방어
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

let failed = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`  FAIL: ${message}`);
    failed++;
  }
}

function ok(message) {
  console.log(`  ok: ${message}`);
}

// Redirect DB to a temp dir so tests don't pollute data/
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'feedback-test-'));
process.env.FEEDBACK_DATA_DIR = tmpDir;

function loadFreshStore() {
  const key = require.resolve('../../src/services/chatbot/feedback-store');
  delete require.cache[key];
  return require('../../src/services/chatbot/feedback-store');
}

// ---- Test 1: Basic record ----
{
  const { FeedbackStore } = loadFreshStore();
  const store = new FeedbackStore({});
  try {
    store.record({
      sessionId: 'sess-001',
      turnId: 'turn-001',
      rating: 5,
      comment: 'Great answer',
      toolSequence: ['search_documents', 'query_document'],
      answerLengthTokens: 120,
    });
    ok('record() with full fields does not throw');
  } catch (e) {
    assert(false, `record() threw: ${e.message}`);
  }
  store.close();
}

// ---- Test 2: Null optional fields ----
{
  const { FeedbackStore } = loadFreshStore();
  const store = new FeedbackStore({});
  try {
    store.record({
      sessionId: 'sess-002',
      turnId: 'turn-002',
      rating: null,
      comment: null,
      toolSequence: null,
      answerLengthTokens: null,
    });
    ok('record() with null optionals does not throw');
  } catch (e) {
    assert(false, `record() with nulls threw: ${e.message}`);
  }
  store.close();
}

// ---- Test 3: Multiple records ----
{
  const { FeedbackStore } = loadFreshStore();
  const store = new FeedbackStore({});
  try {
    for (let i = 0; i < 5; i++) {
      store.record({
        sessionId: `sess-multi-${i}`,
        turnId: `turn-${i}`,
        rating: i % 2 === 0 ? 1 : 5,
        comment: `comment ${i}`,
        toolSequence: ['list_documents'],
        answerLengthTokens: 50 + i * 10,
      });
    }
    ok('5 consecutive records succeed');
  } catch (e) {
    assert(false, `multiple records threw: ${e.message}`);
  }
  store.close();
}

// ---- Test 4: backendType is known ----
{
  const { FeedbackStore } = loadFreshStore();
  const store = new FeedbackStore({});
  const bt = store.backendType;
  assert(bt === 'sqlite' || bt === 'json', `backendType is valid: got '${bt}'`);
  ok(`backendType = '${bt}'`);
  store.close();
}

// ---- Test 5: JSON fallback backend (simulate better-sqlite3 unavailable) ----
{
  const Module = require('module');
  const origLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'better-sqlite3') throw new Error('simulated unavailable');
    return origLoad.apply(this, arguments);
  };

  const { FeedbackStore: FeedbackStoreFallback } = loadFreshStore();
  const store = new FeedbackStoreFallback({});
  assert(store.backendType === 'json', 'fallback backendType is json');

  try {
    store.record({
      sessionId: 'sess-fallback',
      turnId: 'turn-fallback',
      rating: 3,
      comment: 'fallback test',
      toolSequence: ['smart_search'],
      answerLengthTokens: 80,
    });
    ok('JSON fallback record() succeeds');
  } catch (e) {
    assert(false, `JSON fallback record() threw: ${e.message}`);
  }
  store.close();

  // Verify JSONL file was written to tmpDir (not real data/)
  const jsonlPath = path.join(tmpDir, 'feedback.jsonl');
  assert(fs.existsSync(jsonlPath), 'JSONL file created in tmpDir');
  const line = fs.readFileSync(jsonlPath, 'utf8').trim().split('\n')[0];
  const parsed = JSON.parse(line);
  assert(parsed.toolSequence === '["smart_search"]', 'toolSequence serialized as JSON string in fallback');
  ok('JSON fallback writes to tmpDir and serializes toolSequence correctly');

  Module._load = origLoad;
}

// ---- Test 6: null/empty sessionId guard ----
{
  const { FeedbackStore } = loadFreshStore();
  let warnCalled = false;
  const mockLogger = { warn: () => { warnCalled = true; } };
  const store = new FeedbackStore({ logger: mockLogger });

  store.record({ sessionId: '', turnId: 'turn-x' });
  assert(warnCalled, 'empty sessionId triggers logger.warn');
  ok('empty sessionId guard fires warn');

  warnCalled = false;
  store.record({ sessionId: null, turnId: 'turn-x' });
  assert(warnCalled, 'null sessionId triggers logger.warn');
  ok('null sessionId guard fires warn');
  store.close();
}

// ---- Test 7: record() runtime failure is caught (best-effort) ----
{
  const { FeedbackStore } = loadFreshStore();
  let warnCalled = false;
  const mockLogger = { warn: (msg) => { warnCalled = true; } };
  const store = new FeedbackStore({ logger: mockLogger });

  // Force backend to throw on record
  store._backend.record = () => { throw new Error('forced write failure'); };

  let threw = false;
  try {
    store.record({ sessionId: 'sess-x', turnId: 'turn-x' });
  } catch (_) {
    threw = true;
  }
  assert(!threw, 'record() does not propagate backend error to caller');
  assert(warnCalled, 'record() failure logs warn');
  ok('record() runtime failure is absorbed (best-effort)');
  store.close();
}

// ---- Cleanup ----
try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
delete process.env.FEEDBACK_DATA_DIR;

// ---- Summary ----
if (failed === 0) {
  console.log('sqlite OK');
  process.exit(0);
} else {
  console.error(`${failed} test(s) failed`);
  process.exit(1);
}
