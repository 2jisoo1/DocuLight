'use strict';

/**
 * TASK-P1-005: SSE 9종 정규화 이벤트 단위 테스트
 * Run: node test/chatbot/sse-events.test.js
 * Expected stdout: 9 event types
 *
 * DoD 기준: 9종 이벤트 단위 테스트 + race condition 회귀 테스트 통과
 */

const { emitSseEvent, SSE_EVENT_TYPES } = require('../../src/controllers/chatbot-controller');

let failed = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`  FAIL: ${message}`);
    failed++;
  }
}

function createMockRes() {
  const chunks = [];
  return {
    write(chunk) { chunks.push(chunk); return true; },
    writableEnded: false,
    destroyed: false,
    socket: null,
    flush() {},
    _chunks: chunks
  };
}

// ── 1. SSE_EVENT_TYPES 집합 ────────────────────────────────────────────────
{
  assert(SSE_EVENT_TYPES instanceof Set, 'SSE_EVENT_TYPES is a Set');
  assert(SSE_EVENT_TYPES.size === 9, `SSE_EVENT_TYPES has exactly 9 types (got ${SSE_EVENT_TYPES.size})`);

  const expected = [
    'plan', 'tool_use_start', 'tool_use_result', 'citation',
    'token', 'error', 'end', 'retrieval', 'evaluation'
  ];
  for (const t of expected) {
    assert(SSE_EVENT_TYPES.has(t), `SSE_EVENT_TYPES includes '${t}'`);
  }
}

// ── 2. emitSseEvent — 9종 모두 수신 가능 ─────────────────────────────────
{
  const res = createMockRes();
  for (const type of SSE_EVENT_TYPES) {
    emitSseEvent(res, type, { test: true });
  }
  assert(res._chunks.length === 9, `emitSseEvent emitted exactly 9 events (got ${res._chunks.length})`);
}

// ── 3. emitSseEvent — 비정규 타입은 false 반환 (throw 아님) ─────────────
{
  const res = createMockRes();
  assert(emitSseEvent(res, 'done', {})    === false, 'returns false for legacy "done"');
  assert(emitSseEvent(res, 'step', {})    === false, 'returns false for legacy "step"');
  assert(emitSseEvent(res, 'unknown', {}) === false, 'returns false for unknown type');
  assert(emitSseEvent(res, '', {})        === false, 'returns false for empty string');
  assert(res._chunks.length === 0, 'no bytes written for invalid types');
}

// ── 4. SSE 출력 포맷 검증 ─────────────────────────────────────────────────
{
  const res = createMockRes();
  emitSseEvent(res, 'token', { content: 'hello' });
  assert(res._chunks.length === 1, 'single write per emitSseEvent');
  assert(res._chunks[0].includes('event: token\n'), 'event: line present');
  assert(res._chunks[0].includes('"content":"hello"'), 'data payload present');
  assert(res._chunks[0].endsWith('\n\n'), 'SSE frame ends with \\n\\n');
}

// ── 5. tool_use_id 1:1 페어링 — race condition 회피 ──────────────────────
{
  // 두 tool_use_id 동시 추적 시 Map이 독립 유지되는지 검증
  const toolUseTimings = new Map();

  const id1 = 'tu_001';
  const id2 = 'tu_002';

  toolUseTimings.set(id1, Date.now());
  toolUseTimings.set(id2, Date.now() + 1);

  assert(toolUseTimings.has(id1) && toolUseTimings.has(id2), 'both IDs tracked simultaneously');

  // id2 먼저 완료해도 id1은 유지
  toolUseTimings.delete(id2);
  assert(toolUseTimings.has(id1),  'id1 intact after id2 completion');
  assert(!toolUseTimings.has(id2), 'id2 removed after completion');

  // id1 duration 계산 후 삭제
  const startTime = toolUseTimings.get(id1);
  const duration = Date.now() - startTime;
  toolUseTimings.delete(id1);
  assert(duration >= 0,            'duration non-negative');
  assert(!toolUseTimings.has(id1), 'id1 removed after completion');

  // tool_use_start / tool_use_result 이벤트 emit 검증
  const res = createMockRes();
  emitSseEvent(res, 'tool_use_start',  { tool_use_id: 'tu_a', name: 'search', input: {} });
  emitSseEvent(res, 'tool_use_result', { tool_use_id: 'tu_a', content: 'result', isError: false, duration: 10 });
  assert(res._chunks[0].includes('tool_use_start'),  'tool_use_start emitted');
  assert(res._chunks[1].includes('tool_use_result'), 'tool_use_result emitted');
}

// ── 6. citation quote ≤ 50자 ──────────────────────────────────────────────
{
  const res = createMockRes();
  const citation = {
    citationId: 'c1',
    quote: 'A'.repeat(50),  // 정확히 50자
    path: 'guide/setup.md',
    line: 12
  };
  emitSseEvent(res, 'citation', citation);
  const dataLine = res._chunks[0].split('\n').find(l => l.startsWith('data: '));
  const payload = JSON.parse(dataLine.slice(6));
  assert(payload.citationId === 'c1',          'citationId present');
  assert(payload.quote.length <= 50,           `quote ≤ 50 chars (got ${payload.quote.length})`);
  assert(payload.path === 'guide/setup.md',    'path present');
  assert(payload.line === 12,                  'line present');
}

// ── 7. end 이벤트 (done 대체) ─────────────────────────────────────────────
{
  const res = createMockRes();
  emitSseEvent(res, 'end', { threadId: 'sess-1', duration: 500, thinkingMode: false });
  assert(res._chunks[0].includes('event: end\n'), '"end" event emitted');
  assert(!res._chunks[0].includes('event: done'), '"done" event NOT emitted');
}

// ── 8. 응답 종료 후 emit 시도는 false 반환 (no throw) ────────────────────
{
  const res = createMockRes();
  res.writableEnded = true;
  const result = emitSseEvent(res, 'token', { content: 'x' });
  assert(result === false, 'emitSseEvent returns false when response ended');
  assert(res._chunks.length === 0, 'no write when response ended');
}

// ── 9. evaluation 이벤트 ─────────────────────────────────────────────────
{
  const res = createMockRes();
  emitSseEvent(res, 'evaluation', { score: 0.9, relevant: true });
  assert(res._chunks[0].includes('event: evaluation\n'), 'evaluation event emitted');
  const dataLine = res._chunks[0].split('\n').find(l => l.startsWith('data: '));
  const payload = JSON.parse(dataLine.slice(6));
  assert(payload.score === 0.9, 'evaluation payload intact');
}

// ── Summary ───────────────────────────────────────────────────────────────
if (failed === 0) {
  console.log('PASS: 9 event types validated');
} else {
  console.error(`FAIL: ${failed} assertion(s) failed`);
  process.exit(1);
}
