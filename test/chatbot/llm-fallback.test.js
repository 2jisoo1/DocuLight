'use strict';

/**
 * TASK-P1-014: llm-fallback 신설 + 재시도 3회 테스트
 * Run: node test/chatbot/llm-fallback.test.js
 * Expected stdout: 3 retries
 */

const {
  createLLMWithFallback,
  MAX_RETRIES,
} = require('../../src/services/chatbot/llm-fallback');

let failed = 0;
const NO_DELAY = [0, 0, 0];

function assert(cond, msg) {
  if (!cond) {
    console.error(`  FAIL: ${msg}`);
    failed++;
  }
}

function makeLLM(failTimes, response) {
  let callCount = 0;
  return {
    invoke: async () => {
      callCount++;
      if (callCount <= failTimes) throw new Error(`fail attempt ${callCount}`);
      return response !== undefined ? response : 'ok';
    },
    getCallCount: () => callCount,
  };
}

(async () => {
  // ── 1. MAX_RETRIES 상수 검증 ───────────────────────────────────────────────
  assert(MAX_RETRIES === 3, `MAX_RETRIES must be 3, got ${MAX_RETRIES}`);
  console.log(`  ✓ MAX_RETRIES=${MAX_RETRIES}`);

  // ── 2. 첫 번째 시도 성공 ──────────────────────────────────────────────────
  {
    const llm = makeLLM(0, 'success');
    const chain = createLLMWithFallback(llm, [], { retries: 3, backoffDelays: NO_DELAY });
    const result = await chain.invoke('hello');
    assert(result === 'success', `expected 'success', got '${result}'`);
    assert(llm.getCallCount() === 1, `expected 1 call, got ${llm.getCallCount()}`);
    console.log('  ✓ succeeds on first attempt');
  }

  // ── 3. 2회 실패 후 3회째 성공 (재시도 범위 내) ────────────────────────────
  {
    const llm = makeLLM(2, 'recovered');
    const chain = createLLMWithFallback(llm, [], { retries: 3, backoffDelays: NO_DELAY });
    const result = await chain.invoke('hello');
    assert(result === 'recovered', `expected 'recovered', got '${result}'`);
    assert(llm.getCallCount() === 3, `expected 3 calls, got ${llm.getCallCount()}`);
    console.log('  ✓ succeeds after 2 failures (within 3 retries)');
  }

  // ── 4. 정확히 3회 재시도 후 성공 (retries 경계) ───────────────────────────
  {
    const llm = makeLLM(3, 'edge');
    const chain = createLLMWithFallback(llm, [], { retries: 3, backoffDelays: NO_DELAY });
    const result = await chain.invoke('hello');
    assert(result === 'edge', `expected 'edge', got '${result}'`);
    assert(llm.getCallCount() === 4, `expected 4 calls (1+3), got ${llm.getCallCount()}`);
    console.log('  ✓ succeeds on attempt 4 (retries=3 boundary)');
  }

  // ── 5. 3회 재시도 모두 실패 시 폴백 LLM 호출 ─────────────────────────────
  {
    const primary = makeLLM(99, 'never');
    const fallback = makeLLM(0, 'fallback-response');
    const chain = createLLMWithFallback(primary, [fallback], { retries: 3, backoffDelays: NO_DELAY });
    const result = await chain.invoke('hello');
    assert(result === 'fallback-response', `expected fallback-response, got ${result}`);
    assert(primary.getCallCount() === 4, `primary should be called 4 times, got ${primary.getCallCount()}`);
    assert(fallback.getCallCount() === 1, `fallback should be called once, got ${fallback.getCallCount()}`);
    console.log('  ✓ falls back after 3 retries exhausted');
  }

  // ── 6. 모든 LLM 실패 시 에러 전파 ────────────────────────────────────────
  {
    const primary = makeLLM(99);
    const fb1 = makeLLM(99);
    const chain = createLLMWithFallback(primary, [fb1], { retries: 3, backoffDelays: NO_DELAY });
    let threw = false;
    try {
      await chain.invoke('hello');
    } catch (_) {
      threw = true;
    }
    assert(threw, 'should throw when all LLMs fail');
    console.log('  ✓ throws when primary + all fallbacks fail');
  }

  // ── 7. retries / fallbackCount 메타 필드 ──────────────────────────────────
  {
    const llm = makeLLM(0);
    const fb = makeLLM(0);
    const chain = createLLMWithFallback(llm, [fb], { retries: 3, backoffDelays: NO_DELAY });
    assert(chain.retries === 3, `chain.retries must be 3, got ${chain.retries}`);
    assert(chain.fallbackCount === 1, `chain.fallbackCount must be 1, got ${chain.fallbackCount}`);
    console.log('  ✓ chain.retries=3, chain.fallbackCount=1');
  }

  // ── 8. logger.warn 호출 확인 ──────────────────────────────────────────────
  {
    const llm = makeLLM(1, 'ok');
    const warnings = [];
    const logger = { warn: msg => warnings.push(msg) };
    const chain = createLLMWithFallback(llm, [], { retries: 3, backoffDelays: NO_DELAY, logger });
    await chain.invoke('hello');
    assert(warnings.length === 1, `expected 1 warning, got ${warnings.length}`);
    assert(warnings[0].includes('attempt 1/4'), `warning should mention attempt 1/4: ${warnings[0]}`);
    console.log('  ✓ logger.warn called on each failure');
  }

  // ── 결과 출력 ───────────────────────────────────────────────────────────
  if (failed === 0) {
    console.log(`3 retries: all llm-fallback tests passed (MAX_RETRIES=${MAX_RETRIES})`);
    process.exit(0);
  } else {
    console.error(`${failed} test(s) FAILED`);
    process.exit(1);
  }
})().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
