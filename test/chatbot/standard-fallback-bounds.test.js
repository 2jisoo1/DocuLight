'use strict';

/**
 * TASK-P1-014: Standard 그래프 폴백 경계 테스트
 * Run: node test/chatbot/standard-fallback-bounds.test.js
 * Expected stdout: retrievalCount=5.*wallclock<15s
 */

const {
  getStandardFallbackBounds,
  STANDARD_FALLBACK_RETRIEVAL_COUNT,
  STANDARD_FALLBACK_WALL_CLOCK_LIMIT_MS,
} = require('../../src/services/chatbot/llm-fallback');

let failed = 0;

function assert(cond, msg) {
  if (!cond) {
    console.error(`  FAIL: ${msg}`);
    failed++;
  }
}

// ── 1. 상수 검증 ────────────────────────────────────────────────────────────
{
  assert(STANDARD_FALLBACK_RETRIEVAL_COUNT === 5,
    `STANDARD_FALLBACK_RETRIEVAL_COUNT must be 5, got ${STANDARD_FALLBACK_RETRIEVAL_COUNT}`);
  assert(STANDARD_FALLBACK_WALL_CLOCK_LIMIT_MS === 15000,
    `STANDARD_FALLBACK_WALL_CLOCK_LIMIT_MS must be 15000, got ${STANDARD_FALLBACK_WALL_CLOCK_LIMIT_MS}`);
  console.log(`  ✓ constants: retrievalCount=${STANDARD_FALLBACK_RETRIEVAL_COUNT}, limit=${STANDARD_FALLBACK_WALL_CLOCK_LIMIT_MS}ms`);
}

// ── 2. retrievalCount 항상 5 ─────────────────────────────────────────────────
{
  for (const ms of [0, 1000, 14999, 15000, 30000, 45000]) {
    const bounds = getStandardFallbackBounds(ms);
    assert(bounds.retrievalCount === 5,
      `retrievalCount must be 5 for remainingMs=${ms}, got ${bounds.retrievalCount}`);
  }
  console.log('  ✓ retrievalCount=5 for all remaining wallclock values');
}

// ── 3. 잔여 < 15s → immediateRefusal=true ──────────────────────────────────
{
  const bounds0 = getStandardFallbackBounds(0);
  assert(bounds0.immediateRefusal === true, 'immediateRefusal=true when remaining=0ms');

  const bounds1 = getStandardFallbackBounds(14999);
  assert(bounds1.immediateRefusal === true, 'immediateRefusal=true when remaining=14999ms');

  console.log('  ✓ immediateRefusal=true when wallclock<15s');
}

// ── 4. 잔여 ≥ 15s → immediateRefusal=false ─────────────────────────────────
{
  const bounds15 = getStandardFallbackBounds(15000);
  assert(bounds15.immediateRefusal === false, 'immediateRefusal=false when remaining=15000ms (exact boundary)');

  const bounds30 = getStandardFallbackBounds(30000);
  assert(bounds30.immediateRefusal === false, 'immediateRefusal=false when remaining=30000ms');

  console.log('  ✓ immediateRefusal=false when wallclock>=15s');
}

// ── 5. 반환 형태 검증 ─────────────────────────────────────────────────────
{
  const bounds = getStandardFallbackBounds(10000);
  assert(typeof bounds.retrievalCount === 'number', 'retrievalCount must be number');
  assert(typeof bounds.immediateRefusal === 'boolean', 'immediateRefusal must be boolean');
  console.log('  ✓ return shape { retrievalCount: number, immediateRefusal: boolean }');
}

// ── 결과 출력 ─────────────────────────────────────────────────────────────
if (failed === 0) {
  console.log(`standard fallback bounds OK: retrievalCount=5 wallclock<15s immediateRefusal verified`);
  process.exit(0);
} else {
  console.error(`${failed} test(s) FAILED`);
  process.exit(1);
}
