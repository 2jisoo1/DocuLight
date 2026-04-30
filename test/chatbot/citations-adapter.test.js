'use strict';

/**
 * TASK-P2-002 — citations-adapter 단위 테스트
 *
 * DoD 커버 항목:
 *   1. 텍스트 결과 → document block 변환
 *   2. JSON 객체 결과 → JSON.stringify 후 document block 변환
 *   3. 빈 문자열 결과 → (empty) 치환 + warn
 *   4. circular 객체 결과 → util.inspect 폴백 + warn
 *   5. 비 Anthropic provider → tool_result 그대로 반환(어댑터 우회)
 *   6. document block schema: type, source.type, citations.enabled 검증
 */

const { wrapToolResult, _serialize, _sanitizeAttr } = require('../../src/services/agent-tools/citations-adapter');

let passed = 0;
let failed = 0;

function ok(label, cond) {
  if (cond) {
    console.log(`✓ ${label}`);
    passed++;
  } else {
    console.error(`✗ ${label}`);
    failed++;
  }
}

function runTest(fn) {
  try { fn(); }
  catch (e) { console.error(`✗ EXCEPTION in ${fn.name}: ${e.message}`); failed++; }
}

// 1. 텍스트 결과 → document block
function test_text_to_document_block() {
  const blocks = wrapToolResult({ tool_use_id: 'tu_1', name: 'read_section', result: 'hello world' });
  ok('text: returns 1 document block', blocks.length === 1 && blocks[0].type === 'document');
  ok('text: citations.enabled=true', blocks[0].citations?.enabled === true);
  ok('text: source.type=text', blocks[0].source?.type === 'text');
  ok('text: source.data contains result', blocks[0].source?.data?.includes('hello world'));
}

// 2. JSON 객체 결과 → JSON.stringify 후 document block
function test_json_to_document_block() {
  const obj = { items: ['a.md', 'b.md'], count: 2 };
  const blocks = wrapToolResult({ tool_use_id: 'tu_2', name: 'list_documents', result: obj });
  ok('json: returns 1 document block', blocks.length === 1 && blocks[0].type === 'document');
  ok('json: source.data contains "items"', blocks[0].source?.data?.includes('"items"'));
  ok('json: source.data contains "count"', blocks[0].source?.data?.includes('"count"'));
}

// 3. 빈 문자열 → (empty) + warn
function test_empty_result() {
  const warns = [];
  const logger = { warn: m => warns.push(m) };
  const blocks = wrapToolResult(
    { tool_use_id: 'tu_3', name: 'read_section', result: '' },
    { logger }
  );
  ok('empty: returns document block', blocks[0]?.type === 'document');
  ok('empty: source.data contains (empty)', blocks[0]?.source?.data?.includes('(empty)'));
  ok('empty: logger.warn called', warns.length > 0);
}

// 4. circular 객체 → util.inspect 폴백 + warn
function test_circular_result() {
  const obj = {};
  obj.self = obj;
  const warns = [];
  const logger = { warn: m => warns.push(m) };
  const blocks = wrapToolResult(
    { tool_use_id: 'tu_4', name: 'read_section', result: obj },
    { logger }
  );
  ok('circular: returns document block', blocks[0]?.type === 'document');
  ok('circular: logger.warn called', warns.length > 0);
  ok('circular: source.data is non-empty string',
    typeof blocks[0]?.source?.data === 'string' && blocks[0].source.data.length > 0);
}

// 5. 비 Anthropic provider → 어댑터 우회
function test_non_anthropic_bypass() {
  const blocks = wrapToolResult(
    { tool_use_id: 'tu_5', name: 'read_section', result: 'some data' },
    { provider: 'openai' }
  );
  ok('openai: type=tool_result (document block 미생성)', blocks[0]?.type === 'tool_result');
  ok('openai: tool_use_id 보존', blocks[0]?.tool_use_id === 'tu_5');
}

// 6. null result 처리
function test_null_result() {
  const warns = [];
  const blocks = wrapToolResult(
    { tool_use_id: 'tu_6', name: 'read_section', result: null },
    { logger: { warn: m => warns.push(m) } }
  );
  ok('null: returns document block', blocks[0]?.type === 'document');
  ok('null: source.data contains (empty)', blocks[0]?.source?.data?.includes('(empty)'));
}

// 7. NaN result → (empty) + warn
function test_nan_result() {
  const warns = [];
  const serialized = _serialize(NaN, { warn: m => warns.push(m) });
  ok('NaN: _serialize returns (empty)', serialized === '(empty)');
  ok('NaN: warn called', warns.length > 0);
}

// 8. 입력 검증: tool_use_id 또는 name 누락 시 TypeError
function test_missing_required_fields() {
  let threw1 = false;
  try { wrapToolResult({ tool_use_id: '', name: 'read_section', result: 'x' }); }
  catch (e) { threw1 = e instanceof TypeError; }
  ok('missing tool_use_id: throws TypeError', threw1);

  let threw2 = false;
  try { wrapToolResult({ tool_use_id: 'tu_x', name: '', result: 'x' }); }
  catch (e) { threw2 = e instanceof TypeError; }
  ok('missing name: throws TypeError', threw2);
}

// 9. 속성 인젝션 방어: _sanitizeAttr이 따옴표·꺽쇠 제거
function test_attr_sanitization() {
  const dangerous = 'foo" injected="true';
  const sanitized = _sanitizeAttr(dangerous);
  ok('sanitizeAttr: no double-quote in output', !sanitized.includes('"'));
  ok('sanitizeAttr: no < in output', !sanitized.includes('<'));

  const blocks = wrapToolResult({ tool_use_id: 'tu_s', name: dangerous, result: 'data' });
  ok('sanitized name in wrapped data', !blocks[0]?.source?.data?.includes('"injected"'));
}

// 10. non-Anthropic null result → warn
function test_non_anthropic_null_warns() {
  const warns = [];
  const blocks = wrapToolResult(
    { tool_use_id: 'tu_n', name: 'read_section', result: null },
    { provider: 'openai', logger: { warn: m => warns.push(m) } }
  );
  ok('non-anthropic null: type=tool_result', blocks[0]?.type === 'tool_result');
  ok('non-anthropic null: logger.warn called', warns.length > 0);
}

function run() {
  console.log('── TASK-P2-002 citations-adapter.test.js ──');
  [
    test_text_to_document_block,
    test_json_to_document_block,
    test_empty_result,
    test_circular_result,
    test_non_anthropic_bypass,
    test_null_result,
    test_nan_result,
    test_missing_required_fields,
    test_attr_sanitization,
    test_non_anthropic_null_warns,
  ].forEach(runTest);
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
