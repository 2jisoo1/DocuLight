'use strict';

/**
 * TASK-P1-007: Anthropic 4종 soft-disable + 3계층 폴백 테스트
 * Run: node test/chatbot/anthropic-features.test.js
 * Expected stdout: soft-disable
 */

const { AnthropicFeatures, FEATURE_NAMES, FALLBACK_LAYERS } =
  require('../../src/services/chatbot/anthropic-features');

let failed = 0;

function assert(cond, msg) {
  if (!cond) {
    console.error(`  FAIL: ${msg}`);
    failed++;
  }
}

// ── 1. 기본값 전체 활성 ────────────────────────────────────────────────────────
{
  const af = new AnthropicFeatures();
  for (const name of FEATURE_NAMES) {
    assert(af.isEnabled(name), `${name} enabled by default`);
  }
}

// ── 2. soft-disable 단일 기능 ─────────────────────────────────────────────────
{
  const af = new AnthropicFeatures();
  const result = af.softDisable('extendedThinking', 'beta-header-deprecated');
  assert(result !== null, 'softDisable returns non-null');
  assert(result.type === 'soft-disable', `type=soft-disable got ${result.type}`);
  assert(result.feature === 'extendedThinking', 'feature field matches');
  assert(result.reason === 'beta-header-deprecated', 'reason preserved');
  assert(!af.isEnabled('extendedThinking'), 'extendedThinking disabled');
  assert(af.isEnabled('interleavedThinking'), 'interleavedThinking still enabled');
  assert(af.isEnabled('citations'), 'citations still enabled');
  assert(af.isEnabled('contextEditing'), 'contextEditing still enabled');
  console.log('  ✓ soft-disable: extendedThinking soft-disabled, others intact');
}

// ── 3. 4종 모두 soft-disable ──────────────────────────────────────────────────
{
  const af = new AnthropicFeatures();
  for (const name of FEATURE_NAMES) {
    af.softDisable(name, 'api-unsupported');
  }
  for (const name of FEATURE_NAMES) {
    assert(!af.isEnabled(name), `${name} disabled after soft-disable`);
  }
}

// ── 4. 생성 시 옵션으로 비활성 ────────────────────────────────────────────────
{
  const af = new AnthropicFeatures({ extendedThinking: false, citations: false });
  assert(!af.isEnabled('extendedThinking'), 'extendedThinking disabled at init');
  assert(!af.isEnabled('citations'), 'citations disabled at init');
  assert(af.isEnabled('interleavedThinking'), 'interleavedThinking still enabled');
  assert(af.isEnabled('contextEditing'), 'contextEditing still enabled');
}

// ── 5. beta 헤더 목록 ─────────────────────────────────────────────────────────
{
  const af = new AnthropicFeatures();
  const headers = af.getBetaHeaders();
  assert(headers.includes('interleaved-thinking-2025-05-14'), 'interleaved thinking beta header');
  assert(headers.includes('clear_tool_uses_20250919'), 'context editing beta header');

  af.softDisable('interleavedThinking', 'deprecated');
  const after = af.getBetaHeaders();
  assert(!after.includes('interleaved-thinking-2025-05-14'), 'soft-disabled header removed');
  assert(after.includes('clear_tool_uses_20250919'), 'remaining header intact');
}

// ── 6. extended thinking 파라미터 ─────────────────────────────────────────────
{
  const af = new AnthropicFeatures();
  const cfg = af.getExtendedThinkingConfig(16000);
  assert(cfg !== null, 'extendedThinking config non-null when enabled');
  assert(cfg.type === 'enabled', 'type=enabled');
  assert(cfg.budget_tokens === 16000, 'budget_tokens passed through');

  af.softDisable('extendedThinking', 'not-needed');
  assert(af.getExtendedThinkingConfig() === null, 'null after soft-disable');
}

// ── 7. citations 파라미터 ─────────────────────────────────────────────────────
{
  const af = new AnthropicFeatures();
  const cfg = af.getCitationsConfig();
  assert(cfg !== null && cfg.enabled === true, 'citations config enabled=true');

  af.softDisable('citations', 'not-supported');
  assert(af.getCitationsConfig() === null, 'null after soft-disable');
}

// ── 8. 3계층 폴백 escalation ──────────────────────────────────────────────────
{
  const af = new AnthropicFeatures();
  assert(af.getCurrentFallbackLayer() === FALLBACK_LAYERS.ANTHROPIC_FEATURES, 'starts at layer 1');
  af.escalateFallback('anthropic-api-down');
  assert(af.getCurrentFallbackLayer() === FALLBACK_LAYERS.PROVIDER_FALLBACK, 'escalated to layer 2');
  af.escalateFallback('all-providers-down');
  assert(af.getCurrentFallbackLayer() === FALLBACK_LAYERS.STANDARD_RAG, 'escalated to layer 3');
  af.escalateFallback('beyond-max');
  assert(af.getCurrentFallbackLayer() === FALLBACK_LAYERS.STANDARD_RAG, 'caps at layer 3');
}

// ── 9. 알 수 없는 기능 soft-disable 시 null 반환 ─────────────────────────────
{
  const af = new AnthropicFeatures();
  const r = af.softDisable('nonExistentFeature', 'test');
  assert(r === null, 'unknown feature returns null');
}

// ── 10. getStatus 스냅샷 ───────────────────────────────────────────────────────
{
  const af = new AnthropicFeatures({ initialCacheBreakpoint: 500 });
  af.softDisable('contextEditing', 'deprecated-beta');
  const status = af.getStatus();
  assert(status.features.contextEditing.softDisabled === true, 'status.features.contextEditing.softDisabled');
  assert(status.cacheBreakpoint === 500, 'status.cacheBreakpoint=500');
  assert(status.fallbackLayer === FALLBACK_LAYERS.ANTHROPIC_FEATURES, 'fallbackLayer=1');
}

// ── 결과 출력 ─────────────────────────────────────────────────────────────────
if (failed === 0) {
  console.log('soft-disable: all Anthropic feature management tests passed');
  process.exit(0);
} else {
  console.error(`${failed} test(s) FAILED`);
  process.exit(1);
}
