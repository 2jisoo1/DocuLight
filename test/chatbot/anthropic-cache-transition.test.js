'use strict';

/**
 * TASK-P1-007: Anthropic 캐시 전환 테스트
 * Run: node test/chatbot/anthropic-cache-transition.test.js
 * Expected stdout: cache_read_input_tokens=0.*breakpoint recalculated
 */

const { AnthropicFeatures } = require('../../src/services/chatbot/anthropic-features');

let failed = 0;

function assert(cond, msg) {
  if (!cond) {
    console.error(`  FAIL: ${msg}`);
    failed++;
  }
}

// ── 1. cache miss → breakpoint 재계산 ─────────────────────────────────────────
{
  const af = new AnthropicFeatures({ initialCacheBreakpoint: 0 });
  const result = af.handleCacheUsage({ cache_read_input_tokens: 0, input_tokens: 1000 });
  assert(result.recalculated === true, 'recalculated=true on cache miss');
  assert(result.reason === 'cache_miss', 'reason=cache_miss');
  assert(result.oldBreakpoint === 0, 'oldBreakpoint=0');
  assert(result.newBreakpoint === 900, `newBreakpoint=900 (90% of 1000), got ${result.newBreakpoint}`);
  assert(af.getCacheBreakpoint() === 900, 'getCacheBreakpoint() updated');
  console.log(
    `  ✓ cache_read_input_tokens=0: breakpoint recalculated from ${result.oldBreakpoint} to ${result.newBreakpoint}`
  );
}

// ── 2. cache hit → breakpoint 재계산 없음 ─────────────────────────────────────
{
  const af = new AnthropicFeatures({ initialCacheBreakpoint: 500 });
  const result = af.handleCacheUsage({ cache_read_input_tokens: 350, input_tokens: 1000 });
  assert(result.recalculated === false, 'recalculated=false on cache hit');
  assert(af.getCacheBreakpoint() === 500, 'breakpoint unchanged on cache hit');
}

// ── 3. input_tokens=0 이면 재계산 없음 ───────────────────────────────────────
{
  const af = new AnthropicFeatures({ initialCacheBreakpoint: 200 });
  const result = af.handleCacheUsage({ cache_read_input_tokens: 0, input_tokens: 0 });
  assert(result.recalculated === false, 'no recalculation when input_tokens=0');
  assert(af.getCacheBreakpoint() === 200, 'breakpoint unchanged');
}

// ── 4. 연속 캐시 미스 시 breakpoint 누적 갱신 ────────────────────────────────
{
  const af = new AnthropicFeatures({ initialCacheBreakpoint: 0 });
  af.handleCacheUsage({ cache_read_input_tokens: 0, input_tokens: 1000 });
  assert(af.getCacheBreakpoint() === 900, 'breakpoint=900 after 1st miss');

  af.handleCacheUsage({ cache_read_input_tokens: 0, input_tokens: 2000 });
  assert(af.getCacheBreakpoint() === 1800, 'breakpoint=1800 after 2nd miss');
}

// ── 5. 인자 생략 시 안전 처리 ────────────────────────────────────────────────
{
  const af = new AnthropicFeatures();
  const result = af.handleCacheUsage();
  assert(result.recalculated === false, 'no recalculation on empty call');
  assert(af.getCacheBreakpoint() === 0, 'breakpoint stays 0');
}

// ── 6. cache_read_input_tokens 부재(undefined) 처리 ──────────────────────────
{
  const af = new AnthropicFeatures({ initialCacheBreakpoint: 100 });
  const result = af.handleCacheUsage({ input_tokens: 500 });
  assert(result.recalculated === true, 'undefined cache_read → treated as 0 → recalculated');
  assert(af.getCacheBreakpoint() === 450, `breakpoint=450 (90% of 500), got ${af.getCacheBreakpoint()}`);
  console.log(
    `  ✓ cache_read_input_tokens=0 (undefined): breakpoint recalculated to ${af.getCacheBreakpoint()}`
  );
}

// ── 결과 출력 ─────────────────────────────────────────────────────────────────
if (failed === 0) {
  console.log('cache transition: all breakpoint recalculation tests passed');
  process.exit(0);
} else {
  console.error(`${failed} test(s) FAILED`);
  process.exit(1);
}
