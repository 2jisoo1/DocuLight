'use strict';

/**
 * TASK-P3-004 — Context Editing 60k 단일 임계 GA (Δ-5)
 * REQ-ID: FR-10, Δ-5
 * Run: node test/chatbot/context-editing.test.js
 * Expected stdout: 60000
 * DoD: 60k 단일 임계 + tool_use 페어링 트리밍 단위 테스트 통과
 */

const { AnthropicFeatures } =
  require('../../src/services/chatbot/anthropic-features');
const { trimMessagesPairwise } =
  require('../../src/services/agent-tools/messages-trim');

let failed = 0;

function assert(cond, msg) {
  if (!cond) {
    console.error(`  FAIL: ${msg}`);
    failed++;
  }
}

// ── 1. 임계값 상수 검증 (AC-NFR-2-2, Δ-5) ────────────────────────────────────
{
  const af = new AnthropicFeatures();
  const threshold = af.getContextEditingThreshold();
  assert(threshold === 60000, `threshold must be 60000, got ${threshold}`);
  console.log(`  threshold = ${threshold}`);
}

// ── 2. shouldEditContext — 경계값 검증 ────────────────────────────────────────
{
  const af = new AnthropicFeatures();
  assert(!af.shouldEditContext(59999), 'shouldEditContext(59999) = false');
  assert(af.shouldEditContext(60000), 'shouldEditContext(60000) = true');
  assert(af.shouldEditContext(100000), 'shouldEditContext(100000) = true');
  console.log('  ✓ shouldEditContext boundary: 59999=false, 60000=true');
}

// ── 3. shouldEditContext — 비정상 입력 안전성 ─────────────────────────────────
{
  const af = new AnthropicFeatures();
  assert(!af.shouldEditContext(NaN), 'NaN is false');
  assert(!af.shouldEditContext(Infinity), 'Infinity is false');
  assert(!af.shouldEditContext(null), 'null is false');
  assert(!af.shouldEditContext(undefined), 'undefined is false');
  assert(!af.shouldEditContext('60000'), 'string is false');
  console.log('  ✓ shouldEditContext non-numeric inputs safely return false');
}

// ── 4. contextEditing soft-disable 시 발동 안 됨 ─────────────────────────────
{
  const af = new AnthropicFeatures();
  af.softDisable('contextEditing', 'api-error');
  assert(!af.shouldEditContext(60000), 'shouldEditContext=false when soft-disabled');
  assert(!af.shouldEditContext(100000), 'shouldEditContext=false for large token when disabled');
  console.log('  ✓ shouldEditContext respects soft-disable');
}

// ── 5. shouldTriggerContextEditing 하위 호환 ─────────────────────────────────
{
  const af = new AnthropicFeatures();
  assert(!af.shouldTriggerContextEditing(59999), 'backward-compat: 59999=false');
  assert(af.shouldTriggerContextEditing(60000), 'backward-compat: 60000=true');
  console.log('  ✓ shouldTriggerContextEditing backward-compat preserved');
}

// ── 6. getContextEditingPayload — AC-NFR-13-3 ────────────────────────────────
{
  const af = new AnthropicFeatures();
  const payloadBelow = af.getContextEditingPayload(59999);
  assert(payloadBelow === null, 'payload null below threshold');

  const payloadAt = af.getContextEditingPayload(60000);
  assert(payloadAt !== null, 'payload non-null at threshold');
  assert(Array.isArray(payloadAt.edits), 'edits is array');
  assert(payloadAt.edits.length === 1, 'edits has exactly 1 entry');
  assert(payloadAt.edits[0].type === 'clear_tool_uses_20250919', 'edits[0].type = clear_tool_uses_20250919');
  console.log('  ✓ getContextEditingPayload: clear_tool_uses_20250919 at 60000');
}

// ── 7. getContextEditingPayload — soft-disable 시 null ───────────────────────
{
  const af = new AnthropicFeatures();
  af.softDisable('contextEditing', 'test');
  assert(af.getContextEditingPayload(60000) === null, 'payload null when disabled');
  console.log('  ✓ getContextEditingPayload null when contextEditing disabled');
}

// ── 8. 환경변수 재정의 검증 ───────────────────────────────────────────────────
{
  const origEnv = process.env.CHATBOT_AGENTIC_CONTEXT_EDIT_THRESHOLD;
  process.env.CHATBOT_AGENTIC_CONTEXT_EDIT_THRESHOLD = '80000';

  // 새 인스턴스는 환경변수를 읽음
  const af = new AnthropicFeatures();
  assert(af.getContextEditingThreshold() === 80000, 'env var overrides default');
  assert(!af.shouldEditContext(60000), 'below custom threshold');
  assert(af.shouldEditContext(80000), 'at custom threshold');

  // 복원
  if (origEnv === undefined) delete process.env.CHATBOT_AGENTIC_CONTEXT_EDIT_THRESHOLD;
  else process.env.CHATBOT_AGENTIC_CONTEXT_EDIT_THRESHOLD = origEnv;
  console.log('  ✓ CHATBOT_AGENTIC_CONTEXT_EDIT_THRESHOLD env override works');
}

// ── 9. tool_use/tool_result 페어링 트리밍 (TASK-P1-015 인계 검증) ─────────────
{
  const messages = [
    { role: 'assistant', content: [
      { type: 'tool_use', id: 'tu1', name: 'search', input: {} },
      { type: 'tool_use', id: 'tu2', name: 'fetch',  input: {} },
    ]},
    { role: 'user', content: [
      { type: 'tool_result', tool_use_id: 'tu1', content: 'result1' },
      // tu2 는 result 없음 → 고아
    ]},
    { role: 'assistant', content: [
      { type: 'tool_use', id: 'tu3', name: 'read', input: {} },
    ]},
    { role: 'user', content: [
      { type: 'tool_result', tool_use_id: 'tu3', content: 'result3' },
    ]},
  ];

  const trimmed = trimMessagesPairwise(messages);

  // tu2 고아 블록이 제거되어야 함
  const allBlocks = trimmed.flatMap(m => Array.isArray(m.content) ? m.content : []);
  const orphanBlock = allBlocks.find(b => b.id === 'tu2');
  assert(!orphanBlock, 'orphaned tu2 tool_use removed');

  // tu1/tu3 완전 페어는 보존
  const tu1 = allBlocks.find(b => b.id === 'tu1');
  const tu3 = allBlocks.find(b => b.id === 'tu3');
  assert(tu1, 'complete pair tu1 preserved');
  assert(tu3, 'complete pair tu3 preserved');

  console.log('  ✓ trimMessagesPairwise: orphan removed, complete pairs preserved');
}

// ── 10. keepLastN 으로 오래된 페어 제거 ──────────────────────────────────────
{
  const messages = [
    { role: 'assistant', content: [{ type: 'tool_use', id: 'old1', name: 'a', input: {} }] },
    { role: 'user',      content: [{ type: 'tool_result', tool_use_id: 'old1', content: 'r1' }] },
    { role: 'assistant', content: [{ type: 'tool_use', id: 'old2', name: 'b', input: {} }] },
    { role: 'user',      content: [{ type: 'tool_result', tool_use_id: 'old2', content: 'r2' }] },
    { role: 'assistant', content: [{ type: 'tool_use', id: 'new1', name: 'c', input: {} }] },
    { role: 'user',      content: [{ type: 'tool_result', tool_use_id: 'new1', content: 'r3' }] },
  ];

  const trimmed = trimMessagesPairwise(messages, { keepLastN: 1 });
  const allBlocks = trimmed.flatMap(m => Array.isArray(m.content) ? m.content : []);

  assert(!allBlocks.find(b => b.id === 'old1'), 'old1 dropped');
  assert(!allBlocks.find(b => b.id === 'old2'), 'old2 dropped');
  assert(allBlocks.find(b => b.id === 'new1'), 'new1 retained');
  console.log('  ✓ trimMessagesPairwise keepLastN=1: older pairs dropped, newest retained');
}

// ── 11. 60k 시뮬레이션 → context_management 페이로드 첨부 시나리오 ─────────────
{
  const af = new AnthropicFeatures();
  const simulatedInputTokens = 60000;

  assert(af.shouldEditContext(simulatedInputTokens), '60k simulation triggers context edit');

  const payload = af.getContextEditingPayload(simulatedInputTokens);
  assert(payload !== null && payload.edits[0].type === 'clear_tool_uses_20250919',
    'context_management.edits[0].type = clear_tool_uses_20250919 at 60k');

  console.log(`  ✓ 60k simulation: context editing triggered, payload = ${JSON.stringify(payload)}`);
}

// ── 결과 ──────────────────────────────────────────────────────────────────────
if (failed === 0) {
  console.log(`context-editing GA: all tests passed (threshold=60000)`);
  process.exit(0);
} else {
  console.error(`${failed} test(s) FAILED`);
  process.exit(1);
}
