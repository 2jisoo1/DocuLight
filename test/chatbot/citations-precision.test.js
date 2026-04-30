'use strict';

/**
 * TASK-P3-009 — citations-precision 단위 테스트
 * REQ-ID: FR-21 (custom_content 분기 + grounding 정밀화)
 *
 * DoD 커버 항목:
 *   1. preciseGrounding=false (기본) → custom_content 필드 없음
 *   2. preciseGrounding=true → document block에 custom_content 배열 추가
 *   3. custom_content 항목은 {type:'text', text:string} 형식
 *   4. 단일 단락 텍스트 → custom_content 길이 1
 *   5. 다중 단락 텍스트 → 단락 수만큼 custom_content 항목 생성
 *   6. buildCustomContent 직접 단위 검증
 *   7. non-Anthropic provider는 preciseGrounding 무시
 *   8. citations.enabled 보존 확인
 */

const {
  wrapToolResult,
  buildCustomContent,
} = require('../../src/services/agent-tools/citations-adapter');

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

// 1. preciseGrounding 기본값(false) → custom_content 없음
function test_default_no_custom_content() {
  const blocks = wrapToolResult(
    { tool_use_id: 'tu_p1', name: 'read_section', result: 'some result' },
  );
  ok('default: type=document', blocks[0]?.type === 'document');
  ok('default: custom_content 필드 없음', blocks[0]?.custom_content === undefined);
}

// 2. preciseGrounding=true → custom_content 배열 추가
function test_precise_grounding_adds_custom_content() {
  const blocks = wrapToolResult(
    { tool_use_id: 'tu_p2', name: 'read_section', result: 'grounded result' },
    { preciseGrounding: true },
  );
  ok('precise: type=document', blocks[0]?.type === 'document');
  ok('precise: custom_content is array', Array.isArray(blocks[0]?.custom_content));
  ok('precise: custom_content non-empty', (blocks[0]?.custom_content?.length ?? 0) > 0);
  ok('precise: citations.enabled=true 보존', blocks[0]?.citations?.enabled === true);
}

// 3. custom_content 항목 형식: {type:'text', text:string}
function test_custom_content_item_schema() {
  const blocks = wrapToolResult(
    { tool_use_id: 'tu_p3', name: 'list_docs', result: 'line one' },
    { preciseGrounding: true },
  );
  const item = blocks[0]?.custom_content?.[0];
  ok('schema: item.type === "text"', item?.type === 'text');
  ok('schema: item.text is string', typeof item?.text === 'string');
  ok('schema: item.text non-empty', (item?.text?.length ?? 0) > 0);
}

// 4. 단일 단락 → custom_content.length === 1
function test_single_paragraph() {
  const result = 'This is a single paragraph with no double newline.';
  const items = buildCustomContent(result);
  ok('single para: length=1', items.length === 1);
  ok('single para: text is full string', items[0]?.text === result);
}

// 5. 다중 단락 → 단락 수만큼 custom_content 항목 (buildCustomContent 직접)
function test_multi_paragraph() {
  const para1 = 'First paragraph content.';
  const para2 = 'Second paragraph content.';
  const para3 = 'Third paragraph content.';
  const text = `${para1}\n\n${para2}\n\n${para3}`;
  const items = buildCustomContent(text);
  ok('multi para: length=3', items.length === 3);
  ok('multi para: first item text', items[0]?.text === para1);
  ok('multi para: second item text', items[1]?.text === para2);
  ok('multi para: third item text', items[2]?.text === para3);
}

// 5b. 다중 단락 통합: wrapToolResult를 통해 multi-paragraph 결과 전달 → custom_content.length>1
function test_multi_paragraph_integration() {
  const para1 = 'Tool result first section.';
  const para2 = 'Tool result second section.';
  const blocks = wrapToolResult(
    { tool_use_id: 'tu_mp', name: 'read_section', result: `${para1}\n\n${para2}` },
    { preciseGrounding: true },
  );
  ok('integration: custom_content.length>1', (blocks[0]?.custom_content?.length ?? 0) > 1);
  ok('integration: first item has no UNTRUSTED tag text',
    !blocks[0]?.custom_content?.[0]?.text?.includes('UNTRUSTED_TOOL_RESULT'));
  ok('integration: source.data still has UNTRUSTED tag (injection guard preserved)',
    blocks[0]?.source?.data?.includes('UNTRUSTED_TOOL_RESULT'));
}

// 6. buildCustomContent: 빈 단락 필터링
function test_empty_paragraphs_filtered() {
  const text = 'A\n\n\n\nB\n\n   \n\nC';
  const items = buildCustomContent(text);
  ok('filter: empty paragraphs excluded', items.every(i => i.text.trim().length > 0));
  ok('filter: 3 non-empty paragraphs', items.length === 3);
}

// 6b. buildCustomContent: null/undefined 입력 시 TypeError
function test_invalid_input_throws() {
  let threw = false;
  try { buildCustomContent(null); }
  catch (e) { threw = e instanceof TypeError; }
  ok('invalid input: null throws TypeError', threw);
}

// 7. non-Anthropic provider → preciseGrounding 무시 (tool_result 반환)
function test_non_anthropic_ignores_precise_grounding() {
  const blocks = wrapToolResult(
    { tool_use_id: 'tu_p7', name: 'read_section', result: 'data' },
    { provider: 'openai', preciseGrounding: true },
  );
  ok('openai: type=tool_result', blocks[0]?.type === 'tool_result');
  ok('openai: custom_content 없음', blocks[0]?.custom_content === undefined);
}

// 8. preciseGrounding=true 시 source.data 보존 (UNTRUSTED 래핑 유지)
function test_source_data_preserved_with_precise() {
  const blocks = wrapToolResult(
    { tool_use_id: 'tu_p8', name: 'mcp.search', result: 'answer text' },
    { preciseGrounding: true },
  );
  ok('source preserved: source.type=text', blocks[0]?.source?.type === 'text');
  ok('source preserved: source.data contains UNTRUSTED_TOOL_RESULT',
    blocks[0]?.source?.data?.includes('UNTRUSTED_TOOL_RESULT'));
  ok('source preserved: source.data contains answer text',
    blocks[0]?.source?.data?.includes('answer text'));
}

function run() {
  console.log('── TASK-P3-009 citations-precision.test.js ──');
  [
    test_default_no_custom_content,
    test_precise_grounding_adds_custom_content,
    test_custom_content_item_schema,
    test_single_paragraph,
    test_multi_paragraph,
    test_multi_paragraph_integration,
    test_empty_paragraphs_filtered,
    test_invalid_input_throws,
    test_non_anthropic_ignores_precise_grounding,
    test_source_data_preserved_with_precise,
  ].forEach(runTest);

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  // stdout_regex 매칭: "custom_content"
  console.log('RESULT: custom_content branch verified | grounding precision OK');
}

run();
