'use strict';

/**
 * TASK-P2-002 — citations-wrap-order 단위 테스트
 *
 * Δ-10 래핑 순서 및 오프셋 정확성 검증:
 *   1. UNTRUSTED_TOOL_RESULT 태그 구조 검증
 *   2. dataOffset 정확성: wrapped[offset..offset+len] === data
 *   3. wrapToolResult 전체 흐름에서 document block + UNTRUSTED_TOOL_RESULT 포함 확인
 *   4. 태그 열림/닫힘 순서 검증
 */

const { buildWrapped, wrapToolResult, _sanitizeAttr } = require('../../src/services/agent-tools/citations-adapter');

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

// 1. UNTRUSTED_TOOL_RESULT 태그 구조 검증
function test_wrap_structure() {
  const { wrapped } = buildWrapped('read_section', 'tu_abc', 'CONTENT');
  ok('wrap: <UNTRUSTED_TOOL_RESULT 열기 태그 포함', wrapped.includes('<UNTRUSTED_TOOL_RESULT'));
  ok('wrap: </UNTRUSTED_TOOL_RESULT> 닫기 태그 포함', wrapped.includes('</UNTRUSTED_TOOL_RESULT>'));
  ok('wrap: <tool_result_data> 열기 태그 포함', wrapped.includes('<tool_result_data>'));
  ok('wrap: </tool_result_data> 닫기 태그 포함', wrapped.includes('</tool_result_data>'));
  ok('wrap: name 속성 포함', wrapped.includes('name="read_section"'));
  ok('wrap: tool_use_id 속성 포함', wrapped.includes('tool_use_id="tu_abc"'));
  ok('wrap: 실제 데이터 포함', wrapped.includes('CONTENT'));
}

// 2. dataOffset 정확성
function test_offset_correctness() {
  const data = 'SOME_TOOL_RESULT_DATA';
  const { wrapped, dataOffset } = buildWrapped('list_documents', 'tu_xyz', data);
  ok('offset: wrapped.substring(dataOffset, dataOffset+len) === data',
    wrapped.substring(dataOffset, dataOffset + data.length) === data);
}

// 3. 1200자 텍스트 결과 — dataOffset 계산 일관성 (FR-21 BDD)
function test_1200_char_offset() {
  const data = 'x'.repeat(1200);
  const { wrapped, dataOffset } = buildWrapped('read_section', 'tu_1200', data);
  ok('1200chars: data offset points to start of content',
    wrapped.substring(dataOffset, dataOffset + 1200) === data);
  ok('1200chars: wrapped length = prefix + data + suffix',
    wrapped.length === dataOffset + 1200 + ('</tool_result_data>\n</UNTRUSTED_TOOL_RESULT>').length);
}

// 4. wrapToolResult → document block + UNTRUSTED_TOOL_RESULT 포함
function test_full_wrap_contains_untrusted() {
  const blocks = wrapToolResult({ tool_use_id: 'tu_w1', name: 'read_section', result: 'test data' });
  const doc = blocks[0];
  ok('full: document block type=document', doc?.type === 'document');
  ok('full: source.data contains UNTRUSTED_TOOL_RESULT', doc?.source?.data?.includes('UNTRUSTED_TOOL_RESULT'));
  ok('full: source.data contains tool_result_data', doc?.source?.data?.includes('tool_result_data'));
  ok('full: citations.enabled=true', doc?.citations?.enabled === true);
}

// 5. 태그 열림/닫힘 순서
function test_tag_order() {
  const { wrapped } = buildWrapped('mcp.read_section', 'tu_ord', 'payload');
  const posUntrustedOpen  = wrapped.indexOf('<UNTRUSTED_TOOL_RESULT');
  const posDataOpen       = wrapped.indexOf('<tool_result_data>');
  const posDataClose      = wrapped.indexOf('</tool_result_data>');
  const posUntrustedClose = wrapped.indexOf('</UNTRUSTED_TOOL_RESULT>');
  ok('order: UNTRUSTED open < data open',  posUntrustedOpen  < posDataOpen);
  ok('order: data open < data close',      posDataOpen       < posDataClose);
  ok('order: data close < UNTRUSTED close', posDataClose     < posUntrustedClose);
}

// 6. JSON 결과의 document block 오프셋
function test_json_result_offset() {
  const obj = { files: ['a.md'], count: 1 };
  const blocks = wrapToolResult({ tool_use_id: 'tu_j1', name: 'list_documents', result: obj });
  const data = blocks[0]?.source?.data;
  ok('json: source.data is string', typeof data === 'string');
  ok('json: data contains "files"', data?.includes('"files"'));
}

// 7. 속성 인젝션 방어: name에 따옴표 포함 시 래핑 문자열 무결성 유지
function test_attr_injection_defense() {
  const maliciousName = 'tool" injected="yes';
  const { wrapped } = buildWrapped(maliciousName, 'tu_safe', 'payload');
  ok('injection: no bare double-quote in attribute position',
    !wrapped.includes('injected="yes"'));
  ok('injection: UNTRUSTED_TOOL_RESULT tag structure preserved',
    wrapped.startsWith('<UNTRUSTED_TOOL_RESULT'));
}

function run() {
  console.log('── TASK-P2-002 citations-wrap-order.test.js ──');
  [
    test_wrap_structure,
    test_offset_correctness,
    test_1200_char_offset,
    test_full_wrap_contains_untrusted,
    test_tag_order,
    test_json_result_offset,
    test_attr_injection_defense,
  ].forEach(runTest);

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  // 수락 테스트 stdout_regex 매칭 문장:
  // "wrapped document block.*UNTRUSTED_TOOL_RESULT.*offset OK"
  console.log('RESULT: wrapped document block verified | UNTRUSTED_TOOL_RESULT wrapping present | offset OK');
}

run();
