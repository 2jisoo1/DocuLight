'use strict';

/**
 * TASK-P1-012: npm test 진입점
 * Phase 1 acceptance test suite (unit + integration guards)
 */

const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const SUITES = [
  'test/chatbot/agentic-graph.test.js',
  'test/chatbot/agentic-graph-pairing.test.js',
  'test/chatbot/agentic-classify-routing.test.js',
  'test/chatbot/agentic-streaming.test.js',
  'test/chatbot/tool-registry.test.js',
  'test/chatbot/budget.test.js',
  'test/chatbot/sse-events.test.js',
  'test/chatbot/anthropic-features.test.js',
  'test/chatbot/anthropic-cache-transition.test.js',
  'test/chatbot/security.test.js',
  'test/chatbot/path-traversal-guard.test.js',
  'test/chatbot/vector-store-memory.test.js',
  'test/mcp/config-security.test.js',
  'test/mcp/default-bind.test.js',
  'test/mcp/streamable-http.test.js',
  'test/mcp/mcp-security-docs.test.js',
  'test/mcp/handler-parity.test.js',
  'test/chatbot/llm-fallback.test.js',
  'test/chatbot/standard-fallback-bounds.test.js',
  'test/chatbot/injection-guard.test.js',
  'test/chatbot/feedback-store.test.js',
  // test/chatbot/llm-factory.test.js — 외부 LLM 엔드포인트 필요, CI 제외
  // test/chatbot/embedding-factory.test.js — 외부 임베딩 서비스 필요, CI 제외
];

let passed = 0;
let failed = 0;
const failures = [];

for (const suite of SUITES) {
  const result = spawnSync(process.execPath, [path.join(ROOT, suite)], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 30000,
  });

  const timedOut = result.error && result.error.code === 'ETIMEDOUT';
  const ok = result.status === 0 && !timedOut;

  if (ok) {
    console.log(`  ✓ ${suite}`);
    passed++;
  } else {
    if (timedOut) {
      console.error(`  ✗ ${suite} [TIMEOUT — killed after 30s]`);
    } else {
      console.error(`  ✗ ${suite}`);
    }
    if (result.stdout) process.stdout.write(result.stdout.slice(-2000));
    if (result.stderr) process.stderr.write(result.stderr.slice(-2000));
    failed++;
    failures.push(suite);
  }
}

console.log('');
console.log(`${passed + failed} suites: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  console.error('FAIL — failing suites: ' + failures.join(', '));
  process.exit(1);
} else {
  console.log('PASS — all suites passed');
  process.exit(0);
}
