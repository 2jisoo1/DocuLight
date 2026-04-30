'use strict';

/**
 * TASK-P3-012: circuit breaker GA 테스트
 * Run: node test/chatbot/circuit-breaker.test.js
 * Expected stdout: open|closed
 */

const { CircuitBreaker, CB_DEFAULT_FAILURE_THRESHOLD } = require('../../src/services/chatbot/llm-fallback');

let failed = 0;

function assert(cond, msg) {
  if (!cond) {
    console.error(`  FAIL: ${msg}`);
    failed++;
  }
}

(async () => {
  // ── 1. 초기 상태는 closed ─────────────────────────────────────────────────
  {
    const cb = new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 60000 });
    assert(cb.state === 'closed', `initial state must be closed, got ${cb.state}`);
    console.log(`  ✓ initial state: closed`);
  }

  // ── 2. 성공 호출은 closed 유지 ────────────────────────────────────────────
  {
    const cb = new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 60000 });
    await cb.execute(async () => 'ok');
    assert(cb.state === 'closed', `state after success must be closed, got ${cb.state}`);
    console.log('  ✓ success keeps closed');
  }

  // ── 3. 임계값 도달 시 open 전이 ──────────────────────────────────────────
  {
    const cb = new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 60000 });
    for (let i = 0; i < 3; i++) {
      try { await cb.execute(async () => { throw new Error('err'); }); } catch (_) { /* expected */ }
    }
    assert(cb.state === 'open', `state after 3 failures must be open, got ${cb.state}`);
    console.log(`  ✓ state after ${CB_DEFAULT_FAILURE_THRESHOLD} failures: open`);
  }

  // ── 4. open 상태에서 즉시 fail-fast ──────────────────────────────────────
  {
    const cb = new CircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 60000 });
    try { await cb.execute(async () => { throw new Error('e'); }); } catch (_) { /* expected */ }
    try { await cb.execute(async () => { throw new Error('e'); }); } catch (_) { /* expected */ }
    assert(cb.state === 'open', 'should be open');

    let fastFailed = false;
    try {
      await cb.execute(async () => 'should-not-reach');
    } catch (err) {
      fastFailed = err.message.includes('open');
    }
    assert(fastFailed, 'open circuit must fast-fail with "open" message');
    console.log('  ✓ open circuit: fast-fail');
  }

  // ── 5. reset 후 closed 복귀 ───────────────────────────────────────────────
  {
    const cb = new CircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 60000 });
    try { await cb.execute(async () => { throw new Error('e'); }); } catch (_) { /* expected */ }
    try { await cb.execute(async () => { throw new Error('e'); }); } catch (_) { /* expected */ }
    assert(cb.state === 'open', 'should be open before reset');
    cb.reset();
    assert(cb.state === 'closed', `state after reset must be closed, got ${cb.state}`);
    console.log('  ✓ reset restores closed');
  }

  // ── 6. resetTimeoutMs 경과 후 execute() 내 half-open 전이 → 성공 시 closed ─
  {
    const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 0 });
    try { await cb.execute(async () => { throw new Error('e'); }); } catch (_) { /* expected */ }
    assert(cb.state === 'open', `before probe call state must be open, got ${cb.state}`);
    // execute() promotes open → half-open when window elapsed, then probe succeeds
    await cb.execute(async () => 'probe-ok');
    assert(cb.state === 'closed', `after probe success state must be closed, got ${cb.state}`);
    console.log('  ✓ half-open → success → closed');
  }

  // ── 7. resetTimeoutMs 경과 후 execute() 내 half-open 전이 → 실패 시 open ──
  {
    const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 5 });
    try { await cb.execute(async () => { throw new Error('e'); }); } catch (_) { /* expected */ }
    assert(cb.state === 'open', 'should be open before reset window');
    await new Promise(r => setTimeout(r, 10));
    // execute() promotes open → half-open; probe fails → back to open
    try { await cb.execute(async () => { throw new Error('probe-fail'); }); } catch (_) { /* expected */ }
    assert(cb.state === 'open', `after probe failure state must be open, got ${cb.state}`);
    console.log('  ✓ half-open → failure → open');
  }

  // ── 결과 출력 ────────────────────────────────────────────────────────────
  if (failed === 0) {
    console.log('circuit breaker states: open/closed transitions verified');
    process.exit(0);
  } else {
    console.error(`${failed} test(s) FAILED`);
    process.exit(1);
  }
})().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
