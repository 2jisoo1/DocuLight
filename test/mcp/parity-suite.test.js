'use strict';

/**
 * parity-suite.test.js
 *
 * FR-20 TASK-P3-008: 도구 핸들러 parity test 자동화
 *
 * buildToolRegistry()가 반환하는 16개 도구 각각에 대해
 * wire name, schema, handler의 파리티를 검증한다.
 *
 * Acceptance: exits 0 and prints "16/16 parity"
 */

const { buildToolRegistry, validateToolRegistry, makeWire } = require('../../src/services/agent-tools/registry');

const WIRE_NAME_RE = /^[a-zA-Z0-9_-]{1,64}$/;
const EXPECTED_COUNT = 16;

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
  } else {
    console.error(`  FAIL: ${message}`);
    failed++;
  }
}

let registry;
try {
  registry = buildToolRegistry();
} catch (err) {
  console.error(`  FAIL: buildToolRegistry() threw: ${err.message}`);
  console.log(`0/${EXPECTED_COUNT} parity`);
  process.exit(1);
}

if (!registry || typeof registry !== 'object') {
  console.error('  FAIL: buildToolRegistry() returned null/invalid registry');
  console.log(`0/${EXPECTED_COUNT} parity`);
  process.exit(1);
}

const tools = Object.values(registry);

// 1. 총 도구 수 확인
assert(tools.length === EXPECTED_COUNT, `registry tool count === ${EXPECTED_COUNT} (got ${tools.length})`);

// 2. 각 도구 3축 + wire 생성 일관성 parity 검증
for (const tool of tools) {
  const label = tool.internal;

  assert(WIRE_NAME_RE.test(tool.wire), `${label}: valid wire name`);
  assert(tool.schema && typeof tool.schema.parse === 'function', `${label}: schema has parse`);
  assert(typeof tool.handler === 'function', `${label}: handler is function`);
  assert(tool.wire === makeWire(tool.internal), `${label}: wire === makeWire(internal)`);
}

// 3. validateToolRegistry로 교차 확인
const validation = validateToolRegistry(registry, null);
assert(validation.valid === true, `validateToolRegistry: no errors`);
assert(validation.count === EXPECTED_COUNT, `validateToolRegistry: count === ${EXPECTED_COUNT}`);

// 4. wire name 중복 없음
const wireNames = tools.map(t => t.wire);
const uniqueWires = new Set(wireNames);
assert(uniqueWires.size === tools.length, `no duplicate wire names`);

// 5. internal name prefix 일관성
const allMcpPrefixed = tools.every(t => t.internal.startsWith('mcp.'));
assert(allMcpPrefixed, `all internal names start with 'mcp.'`);

const total = passed + failed;
if (failed > 0) {
  console.log(`${passed}/${total} parity`);
  process.exit(1);
}

console.log(`${EXPECTED_COUNT}/${EXPECTED_COUNT} parity`);
