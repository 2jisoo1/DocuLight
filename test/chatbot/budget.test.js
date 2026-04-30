'use strict';

/**
 * TASK-P1-004 budget.test.js
 * BudgetController 단위 테스트:
 *   - 인자 정규화 (normalizeArgs)
 *   - dedup 해시 (computeDedupHash)
 *   - 경로 정규화·traversal 차단 (canonicalizePath)
 *   - iteration / wall-clock / 토큰 / tool_call 예산
 *   - dedup 2회 허용 3회 차단 + 상태 복원
 */

const {
  BudgetController,
  computeDedupHash,
  normalizeArgs,
  canonicalizePath,
} = require('../../src/services/agent-tools/budget');

let failed = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`  FAIL: ${message}`);
    failed++;
  }
}

function assertThrows(fn, label) {
  try {
    fn();
    console.error(`  FAIL (no throw): ${label}`);
    failed++;
  } catch (_) {
    // expected
  }
}

// ── normalizeArgs ──────────────────────────────────────────────────────────
{
  const a = normalizeArgs({ b: '  hello  ', a: 'world' });
  const b = normalizeArgs({ a: 'world', b: 'hello' });
  assert(JSON.stringify(a) === JSON.stringify(b), 'normalizeArgs: key-sort + trim → identical JSON');

  const empty = normalizeArgs(null);
  assert(empty && typeof empty === 'object', 'normalizeArgs: null → {}');
}

// ── computeDedupHash ───────────────────────────────────────────────────────
{
  const h1 = computeDedupHash('search', { query: '  foo  ', limit: 10 });
  const h2 = computeDedupHash('search', { limit: 10, query: 'foo' });
  assert(h1 === h2, 'computeDedupHash: field-order + whitespace invariant');

  const h3 = computeDedupHash('search', { query: 'bar' });
  assert(h1 !== h3, 'computeDedupHash: different args → different hash');

  const h4 = computeDedupHash('other_tool', { query: 'foo', limit: 10 });
  assert(h1 !== h4, 'computeDedupHash: different tool → different hash');
}

// ── canonicalizePath ───────────────────────────────────────────────────────
{
  assert(canonicalizePath('/foo//bar/') === '/foo/bar', 'canonicalizePath: collapse slashes + strip trailing');
  assert(canonicalizePath('\\foo\\bar') === '/foo/bar', 'canonicalizePath: backslash → forward slash');
  assert(canonicalizePath('/') === '/', 'canonicalizePath: root preserved');
  assert(canonicalizePath('/foo/bar') === '/foo/bar', 'canonicalizePath: clean path unchanged');

  assertThrows(() => canonicalizePath('/foo/../etc'), 'canonicalizePath: /foo/../etc blocked');
  assertThrows(() => canonicalizePath('../secret'), 'canonicalizePath: ../secret blocked');
  assertThrows(() => canonicalizePath('/a/b/../../etc/passwd'), 'canonicalizePath: deep traversal blocked');
}

// ── BudgetController: iteration limit ─────────────────────────────────────
{
  const bc = new BudgetController({ maxIterations: 3 });
  assert(!bc.checkIterations(0).exceeded, 'iterations: 0 < 3 allowed');
  assert(!bc.checkIterations(2).exceeded, 'iterations: 2 < 3 allowed');
  const r = bc.checkIterations(3);
  assert(r.exceeded === true && r.type === 'iterations', 'iterations: 3 >= 3 → exceeded:iterations');
  assert(bc.checkIterations(10).exceeded, 'iterations: 10 >> 3 → exceeded');
}

// ── BudgetController: wall-clock ───────────────────────────────────────────
{
  const bc = new BudgetController({ wallClockMs: 50 });
  assert(!bc.checkWallClock().exceeded, 'wall_clock: not exceeded immediately');
  bc._startMs = Date.now() - 100;
  const r = bc.checkWallClock();
  assert(r.exceeded === true && r.type === 'wall_clock', 'wall_clock: exceeded after 100ms > 50ms');
}

// ── BudgetController: token tracking ──────────────────────────────────────
{
  const bc = new BudgetController({ maxInputTokens: 100, maxOutputTokens: 50 });
  assert(!bc.recordTokens(50, 10).exceeded, 'tokens: 50/10 not exceeded');
  assert(!bc.recordTokens(40, 30).exceeded, 'tokens: cumulative 90/40 not exceeded');
  const r = bc.recordTokens(20, 0);
  assert(r.exceeded === true && r.type === 'input_tokens', 'tokens: 110 input → exceeded:input_tokens');
}
{
  const bc = new BudgetController({ maxInputTokens: 1000, maxOutputTokens: 10 });
  const r = bc.recordTokens(0, 15);
  assert(r.exceeded === true && r.type === 'output_tokens', 'tokens: 15 output → exceeded:output_tokens');
}

// ── BudgetController: tool_call limit ─────────────────────────────────────
{
  const bc = new BudgetController({ maxToolCalls: 2 });
  assert(bc.checkToolCall('t1', {}).allowed, 'tool_calls: 1st allowed');
  assert(bc.checkToolCall('t2', {}).allowed, 'tool_calls: 2nd allowed');
  const r = bc.checkToolCall('t3', {});
  assert(!r.allowed && r.reason === 'tool_call_limit', 'tool_calls: 3rd → tool_call_limit');
}

// ── BudgetController: dedup (2회 허용, 3회째 차단) ─────────────────────────
{
  const bc = new BudgetController({ maxToolCalls: 99 });
  const r1 = bc.checkToolCall('search', { query: 'foo' });
  assert(r1.allowed, 'dedup: 1st call allowed');
  const r2 = bc.checkToolCall('search', { query: 'foo' });
  assert(r2.allowed, 'dedup: 2nd call allowed');
  const r3 = bc.checkToolCall('search', { query: 'foo' });
  assert(!r3.allowed && r3.reason === 'dedup', 'dedup: 3rd call → dedup blocked');

  // 인자가 다르면 별개 해시
  const r4 = bc.checkToolCall('search', { query: 'bar' });
  assert(r4.allowed, 'dedup: different args → allowed');

  // 도구가 다르면 별개 해시
  const r5 = bc.checkToolCall('list', { query: 'foo' });
  assert(r5.allowed, 'dedup: different tool → allowed');
}

// ── BudgetController: path traversal 차단 ─────────────────────────────────
{
  const bc = new BudgetController({ maxToolCalls: 99 });
  const r = bc.checkToolCall('query_document', { path: '/docs/../etc/passwd' });
  assert(!r.allowed && r.reason === 'path_traversal', 'path_traversal: blocked in tool args');

  // 정상 경로는 허용
  const r2 = bc.checkToolCall('query_document', { path: '/docs/guide.md' });
  assert(r2.allowed, 'path: normal path allowed');
}

// ── BudgetController: dedup 상태 복원 (LangGraph 체크포인트) ──────────────
{
  const bc1 = new BudgetController({ maxToolCalls: 99 });
  bc1.checkToolCall('search', { query: 'restore-test' }); // seen → 1
  const hashes = bc1.getDedupHashes();

  const bc2 = new BudgetController({ maxToolCalls: 99 });
  bc2.restoreDedupHashes(hashes);
  bc2.checkToolCall('search', { query: 'restore-test' }); // seen 1→2, allowed
  const r = bc2.checkToolCall('search', { query: 'restore-test' }); // seen 2 → dedup blocked
  assert(!r.allowed && r.reason === 'dedup', 'dedup restore: 3rd call after restore → blocked');
}

// ── getDedupHashes 반환값 불변성 ──────────────────────────────────────────
{
  const bc = new BudgetController({ maxToolCalls: 99 });
  bc.checkToolCall('t', { x: 1 });
  const h1 = bc.getDedupHashes();
  h1['tamper'] = 999;
  const h2 = bc.getDedupHashes();
  assert(!('tamper' in h2), 'getDedupHashes: returns copy (mutation safe)');
}

// ── 결과 ──────────────────────────────────────────────────────────────────
if (failed === 0) {
  console.log('PASS');
  process.exit(0);
} else {
  console.error(`${failed} test(s) FAILED`);
  process.exit(1);
}
