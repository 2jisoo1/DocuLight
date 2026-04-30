'use strict';

/**
 * TASK-P1-015 messages-trim.test.js
 * trimMessagesPairwise 단위 테스트:
 *   [성공] 완전한 페어는 그대로 보존
 *   [실패] 고아 tool_use 제거
 *   [실패] 고아 tool_result 제거
 *   [경계] keepLastN 트리밍 — 오래된 완전 페어 제거
 *   [경계] legacy (id 없는) 항목 보수적 보존
 *   [경계] 빈 배열 / null 입력
 *   [경계] 혼합 콘텐츠 메시지에서 고아 블록만 제거
 */

const { trimMessagesPairwise } = require('../../src/services/agent-tools/messages-trim');

let failed = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`  FAIL: ${message}`);
    failed++;
  }
}

// ── 헬퍼 ────────────────────────────────────────────────────────────────────

function toolUseMsg(id, name = 'search') {
  return {
    role: 'assistant',
    content: [{ type: 'tool_use', id, name, input: { query: 'test' } }],
  };
}

function toolResultMsg(tool_use_id) {
  return {
    role: 'user',
    content: [{ type: 'tool_result', tool_use_id, content: 'result' }],
  };
}

function textMsg(role, text) {
  return { role, content: text };
}

function findBlocksOfType(messages, type) {
  return messages.flatMap(m =>
    Array.isArray(m.content)
      ? m.content.filter(b => b.type === type)
      : []
  );
}

// ── 1. 성공: 완전한 페어 보존 ─────────────────────────────────────────────
{
  const messages = [
    textMsg('user', 'hello'),
    toolUseMsg('id1'),
    toolResultMsg('id1'),
    textMsg('assistant', 'done'),
  ];
  const result = trimMessagesPairwise(messages, { keepLastN: 10 });
  assert(result.length === 4, 'success: complete pair preserved — length=4');
  assert(findBlocksOfType(result, 'tool_use').length === 1,  'success: tool_use block present');
  assert(findBlocksOfType(result, 'tool_result').length === 1, 'success: tool_result block present');
}

// ── 2. 실패: 고아 tool_use 제거 ──────────────────────────────────────────
{
  const messages = [
    textMsg('user', 'hello'),
    toolUseMsg('orphan1'),
    textMsg('assistant', 'no result paired'),
  ];
  const result = trimMessagesPairwise(messages);
  const orphanBlocks = findBlocksOfType(result, 'tool_use').filter(b => b.id === 'orphan1');
  assert(orphanBlocks.length === 0, 'failure: orphaned tool_use removed');
  // toolUseMsg 메시지는 콘텐츠가 비어 고아 전체 제거 → 길이 2
  assert(result.length === 2, 'failure: empty-content message removed (length=2)');
}

// ── 3. 실패: 고아 tool_result 제거 ───────────────────────────────────────
{
  const messages = [
    textMsg('user', 'hello'),
    toolResultMsg('ghost_id'),
    textMsg('assistant', 'no call paired'),
  ];
  const result = trimMessagesPairwise(messages);
  const ghostBlocks = findBlocksOfType(result, 'tool_result').filter(b => b.tool_use_id === 'ghost_id');
  assert(ghostBlocks.length === 0, 'failure: orphaned tool_result removed');
}

// ── 4. 경계: keepLastN 트리밍 ─────────────────────────────────────────────
{
  const messages = [
    toolUseMsg('pair1'),
    toolResultMsg('pair1'),
    toolUseMsg('pair2'),
    toolResultMsg('pair2'),
    toolUseMsg('pair3'),
    toolResultMsg('pair3'),
  ];
  const result = trimMessagesPairwise(messages, { keepLastN: 1 });
  const useIds = findBlocksOfType(result, 'tool_use').map(b => b.id);
  assert(!useIds.includes('pair1') && !useIds.includes('pair2'),
    'boundary: keepLastN=1 — old pairs (pair1, pair2) removed');
  assert(useIds.includes('pair3'), 'boundary: keepLastN=1 — last pair (pair3) preserved');
}

// ── 5. 경계: legacy (id 없는) 항목 보수적 보존 ────────────────────────────
{
  const messages = [
    textMsg('user', 'query'),
    { role: 'assistant', content: [{ type: 'tool_use', name: 'legacy_tool', input: {} }] },
    { role: 'user',      content: [{ type: 'tool_result', content: 'legacy result' }] },
    textMsg('assistant', 'response'),
  ];
  const result = trimMessagesPairwise(messages);
  const legacyUse    = findBlocksOfType(result, 'tool_use').filter(b => !b.id);
  const legacyResult = findBlocksOfType(result, 'tool_result').filter(b => !b.tool_use_id);
  assert(legacyUse.length    === 1, 'boundary: legacy tool_use (no id) preserved');
  assert(legacyResult.length === 1, 'boundary: legacy tool_result (no tool_use_id) preserved');
}

// ── 6. 경계: 빈 배열 / null 입력 ─────────────────────────────────────────
{
  assert(trimMessagesPairwise([]).length === 0, 'boundary: empty array → []');
  assert(trimMessagesPairwise(null).length === 0, 'boundary: null → []');
}

// ── 7. 경계: 혼합 콘텐츠 — 고아 tool_use만 제거, text 보존 ──────────────
{
  const messages = [
    {
      role: 'assistant',
      content: [
        { type: 'text', text: 'thinking...' },
        { type: 'tool_use', id: 'orphan_mixed', name: 'search', input: {} },
      ],
    },
  ];
  const result = trimMessagesPairwise(messages);
  const hasText    = findBlocksOfType(result, 'text').length > 0;
  const hasOrphan  = findBlocksOfType(result, 'tool_use').some(b => b.id === 'orphan_mixed');
  assert(hasText,   'boundary: text block in mixed message preserved');
  assert(!hasOrphan, 'boundary: orphan tool_use in mixed message removed');
  // 메시지 자체는 남아 있어야 한다 (text block 존재)
  assert(result.length === 1, 'boundary: mixed message not dropped (text block remains)');
}

// ── 8. 경계: 완전 페어가 keepLastN 이하면 변경 없음 ──────────────────────
{
  const messages = [
    toolUseMsg('only1'),
    toolResultMsg('only1'),
  ];
  const result = trimMessagesPairwise(messages, { keepLastN: 5 });
  assert(result.length === 2, 'boundary: keepLastN >= pair count → no trimming');
}

// ── 9. 경계: keepLastN=0 — 완전 페어 전부 제거 ───────────────────────────
{
  const messages = [
    toolUseMsg('a'),
    toolResultMsg('a'),
    toolUseMsg('b'),
    toolResultMsg('b'),
  ];
  const result = trimMessagesPairwise(messages, { keepLastN: 0 });
  assert(findBlocksOfType(result, 'tool_use').length === 0,    'boundary: keepLastN=0 — all tool_use blocks removed');
  assert(findBlocksOfType(result, 'tool_result').length === 0, 'boundary: keepLastN=0 — all tool_result blocks removed');
}

// ── 10. 경계: keepLastN 비정수 입력 → TypeError ───────────────────────────
{
  let threw = false;
  try {
    trimMessagesPairwise([], { keepLastN: 1.5 });
  } catch (e) {
    threw = e instanceof TypeError;
  }
  assert(threw, 'boundary: non-integer keepLastN → TypeError');
}

// ── 결과 ──────────────────────────────────────────────────────────────────
if (failed === 0) {
  console.log('pairing-unit trim OK');
  process.exit(0);
} else {
  console.error(`${failed} test(s) FAILED`);
  process.exit(1);
}
