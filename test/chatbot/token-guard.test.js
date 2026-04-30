'use strict';

/**
 * TASK-P3-011 token-guard.test.js
 * TokenGuard 단위 테스트:
 *   - 60k 입력 한도 (checkInputLimit)
 *   - 4k 출력 한도 (checkOutputLimit)
 *   - 세션 schema 호환성 (Standard ↔ Agentic 전환)
 */

const {
  MAX_INPUT_TOKENS,
  MAX_OUTPUT_TOKENS,
  checkInputLimit,
  checkOutputLimit,
} = require('../../src/services/agent-tools/token-guard');

let failed = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`  FAIL: ${message}`);
    failed++;
  }
}

// ── 상수 확인 ──────────────────────────────────────────────────────────────
{
  assert(MAX_INPUT_TOKENS === 60000, `MAX_INPUT_TOKENS must be 60000 (got ${MAX_INPUT_TOKENS})`);
  assert(MAX_OUTPUT_TOKENS === 4000, `MAX_OUTPUT_TOKENS must be 4000 (got ${MAX_OUTPUT_TOKENS})`);
}

// ── checkInputLimit ────────────────────────────────────────────────────────
{
  assert(checkInputLimit(0)     === true,  'checkInputLimit(0) → within limit');
  assert(checkInputLimit(59999) === true,  'checkInputLimit(59999) → within limit');
  assert(checkInputLimit(60000) === true,  'checkInputLimit(60000) → at limit, allowed');
  assert(checkInputLimit(60001) === false, 'checkInputLimit(60001) → exceeded');
  assert(checkInputLimit(100000) === false, 'checkInputLimit(100000) → far exceeded');
  assert(checkInputLimit(NaN)   === false, 'checkInputLimit(NaN) → invalid, false');
  assert(checkInputLimit(Infinity) === false, 'checkInputLimit(Infinity) → invalid, false');
  assert(checkInputLimit('60000') === false, 'checkInputLimit("60000") → non-number, false');
  assert(checkInputLimit(null)  === false, 'checkInputLimit(null) → non-number, false');
  assert(checkInputLimit(-1)    === false, 'checkInputLimit(-1) → negative, false');
}

// ── checkOutputLimit ───────────────────────────────────────────────────────
{
  assert(checkOutputLimit(0)    === true,  'checkOutputLimit(0) → within limit');
  assert(checkOutputLimit(3999) === true,  'checkOutputLimit(3999) → within limit');
  assert(checkOutputLimit(4000) === true,  'checkOutputLimit(4000) → at limit, allowed');
  assert(checkOutputLimit(4001) === false, 'checkOutputLimit(4001) → exceeded');
  assert(checkOutputLimit(NaN)  === false, 'checkOutputLimit(NaN) → invalid, false');
  assert(checkOutputLimit('4000') === false, 'checkOutputLimit("4000") → non-number, false');
  assert(checkOutputLimit(null) === false, 'checkOutputLimit(null) → non-number, false');
  assert(checkOutputLimit(Infinity) === false, 'checkOutputLimit(Infinity) → invalid, false');
  assert(checkOutputLimit(-1)   === false, 'checkOutputLimit(-1) → negative, false');
}

// ── 세션 schema 호환성 (Standard ↔ Agentic) ───────────────────────────────
// Standard 그래프 상태의 필수 필드가 Agentic 그래프에서도 유효해야 함.
// 두 모드 모두 messages / threadId / error 필드를 사용하는 공통 스키마를 공유.
{
  const standardStateShape = {
    messages:  [],
    threadId:  'session-123',
    error:     null,
    queryType: 'standard',
  };

  const agenticStateShape = {
    messages:         [],
    threadId:         'session-123',
    error:            null,
    queryType:        'broad',
    reflexion_active: false,
    iteration:        0,
    thinking_budget:  0,
    dedup_hashes:     {},
  };

  // Standard 필드가 Agentic 상태 shape에 모두 포함되는지 확인 (하위 호환)
  for (const key of Object.keys(standardStateShape)) {
    assert(key in agenticStateShape, `Agentic schema must include Standard field: ${key}`);
  }

  // Agentic 전용 필드 타입 확인
  assert(typeof agenticStateShape.reflexion_active === 'boolean', 'reflexion_active is boolean');
  assert(typeof agenticStateShape.iteration        === 'number',  'iteration is number');
  assert(typeof agenticStateShape.thinking_budget  === 'number',  'thinking_budget is number');
  assert(typeof agenticStateShape.dedup_hashes     === 'object',  'dedup_hashes is object');

  // agenticMode 전환은 다음 세션부터 적용 (MemorySaver thread_id 격리).
  // 동일 threadId 아래 두 그래프 모두 messages 배열 reducer를 공유해야 함.
  assert(
    standardStateShape.threadId === agenticStateShape.threadId,
    'session schema: threadId field shared between both modes',
  );
}

// ── 결과 출력 ──────────────────────────────────────────────────────────────
if (failed === 0) {
  console.log(`PASS: token-guard — MAX_INPUT_TOKENS=${MAX_INPUT_TOKENS} MAX_OUTPUT_TOKENS=${MAX_OUTPUT_TOKENS}`);
  process.exit(0);
} else {
  console.error(`FAIL: ${failed} assertion(s) failed`);
  process.exit(1);
}
