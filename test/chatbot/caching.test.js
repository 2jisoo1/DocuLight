'use strict';

const assert = require('assert');
const { AnthropicFeatures } = require('../../src/services/chatbot/anthropic-features');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (e) {
    console.error(`✗ ${name}: ${e.message}`);
    failed++;
  }
}

// cache_control 마커 추가 (마지막 블록)
test('applyCacheControl adds cache_control to last block only', () => {
  const af = new AnthropicFeatures();
  const blocks = [
    { type: 'text', text: 'system' },
    { type: 'text', text: 'tools' },
  ];
  const result = af.applyCacheControl(blocks);
  assert.deepStrictEqual(result[1].cache_control, { type: 'ephemeral' });
  assert.strictEqual(result[0].cache_control, undefined);
});

// cache_control 출력 포함 검증
test('applyCacheControl result contains cache_control ephemeral', () => {
  const af = new AnthropicFeatures();
  const [result] = af.applyCacheControl([{ type: 'text', text: 'x'.repeat(1024) }]);
  assert.ok(JSON.stringify(result).includes('cache_control'));
});

// 빈 배열 안전
test('applyCacheControl handles empty array', () => {
  const af = new AnthropicFeatures();
  assert.deepStrictEqual(af.applyCacheControl([]), []);
});

// promptCaching soft-disable 시 cache_control 미적용
test('applyCacheControl skips when promptCaching soft-disabled', () => {
  const af = new AnthropicFeatures();
  af.softDisable('promptCaching', 'test');
  const blocks = [{ type: 'text', text: 'x' }];
  const result = af.applyCacheControl(blocks);
  assert.strictEqual(result[0].cache_control, undefined);
});

// parallelToolUse 기본 활성
test('parallelToolUse enabled by default', () => {
  const af = new AnthropicFeatures();
  assert.strictEqual(af.isEnabled('parallelToolUse'), true);
});

// parallelToolUse soft-disable 가능
test('parallelToolUse can be soft-disabled', () => {
  const af = new AnthropicFeatures();
  af.softDisable('parallelToolUse', 'test');
  assert.strictEqual(af.isEnabled('parallelToolUse'), false);
});

// context editing 임계값 기본 60000 (Δ-5)
test('getContextEditingThreshold returns 60000 by default', () => {
  const af = new AnthropicFeatures();
  assert.strictEqual(af.getContextEditingThreshold(), 60000);
});

// context editing 임계값 환경변수 재정의 (생성자 시점 캐싱)
test('getContextEditingThreshold respects env var at construction time', () => {
  process.env.CHATBOT_AGENTIC_CONTEXT_EDIT_THRESHOLD = '50000';
  const af = new AnthropicFeatures();
  delete process.env.CHATBOT_AGENTIC_CONTEXT_EDIT_THRESHOLD;
  assert.strictEqual(af.getContextEditingThreshold(), 50000);
});

// shouldTriggerContextEditing 경계값
test('shouldTriggerContextEditing: false below threshold', () => {
  const af = new AnthropicFeatures();
  assert.strictEqual(af.shouldTriggerContextEditing(59999), false);
});

test('shouldTriggerContextEditing: true at exactly 60000', () => {
  const af = new AnthropicFeatures();
  assert.strictEqual(af.shouldTriggerContextEditing(60000), true);
});

test('shouldTriggerContextEditing: false when contextEditing disabled', () => {
  const af = new AnthropicFeatures({ contextEditing: false });
  assert.strictEqual(af.shouldTriggerContextEditing(60000), false);
});

// promptCaching 초기값 옵션으로 비활성화 가능
test('promptCaching disabled via constructor option', () => {
  const af = new AnthropicFeatures({ promptCaching: false });
  assert.strictEqual(af.isEnabled('promptCaching'), false);
  const blocks = [{ type: 'text', text: 'x' }];
  assert.strictEqual(af.applyCacheControl(blocks)[0].cache_control, undefined);
});

// getStatus에 신규 기능 포함
test('getStatus includes promptCaching and parallelToolUse', () => {
  const af = new AnthropicFeatures();
  const status = af.getStatus();
  assert.ok('promptCaching' in status.features);
  assert.ok('parallelToolUse' in status.features);
});

// H-3: isParallelToolUseEnabled() 전용 API
test('isParallelToolUseEnabled returns true by default', () => {
  const af = new AnthropicFeatures();
  assert.strictEqual(af.isParallelToolUseEnabled(), true);
});

test('isParallelToolUseEnabled returns false after soft-disable', () => {
  const af = new AnthropicFeatures();
  af.softDisable('parallelToolUse', 'capacity');
  assert.strictEqual(af.isParallelToolUseEnabled(), false);
});

// H-2: soft-disable ON→OFF 전이 회귀 — _cacheBreakpoint 보존 검증
test('soft-disable→re-enable cycle preserves _cacheBreakpoint', () => {
  const af = new AnthropicFeatures({ initialCacheBreakpoint: 1024 });
  // promptCaching soft-disable
  af.softDisable('promptCaching', 'api-error');
  assert.strictEqual(af.getCacheBreakpoint(), 1024, 'breakpoint must survive soft-disable');
  // cache miss 이벤트 발생 시 breakpoint 갱신 (soft-disable 무관)
  af.handleCacheUsage({ cache_read_input_tokens: 0, input_tokens: 2000 });
  assert.strictEqual(af.getCacheBreakpoint(), 1800, 'breakpoint must update during soft-disable');
  // 외부 재활성(enabled 플래그 직접 조작은 public API 없으므로 새 인스턴스 대신
  // softDisabled 플래그만 리셋하는 패턴 검증)
  af._state.promptCaching.softDisabled = false;
  assert.strictEqual(af.isEnabled('promptCaching'), true, 're-enable must work');
  assert.strictEqual(af.getCacheBreakpoint(), 1800, 'breakpoint must be retained after re-enable');
  const [block] = af.applyCacheControl([{ type: 'text', text: 'x' }]);
  assert.deepStrictEqual(block.cache_control, { type: 'ephemeral' }, 'cache_control must apply after re-enable');
});

const summary = `cache_control NFR-13: ${passed} passed, ${failed} failed`;
console.log(summary);
if (failed > 0) process.exit(1);
