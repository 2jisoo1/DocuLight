'use strict';

/**
 * Anthropic 4종 기능 soft-disable + 3계층 폴백 관리 (FR-16, Δ-1)
 * + Prompt Caching (C-15, NFR-13), Parallel Tool Use (C-16), Context Editing 임계 (Δ-5)
 *
 * Layer 1: Anthropic 내부 기능 개별 soft-disable (기능 비활성, Anthropic provider 유지)
 * Layer 2: LLM provider fallback (OpenAI/Azure)
 * Layer 3: Standard RAG 그래프 폴백
 */

const FEATURE_META = {
  extendedThinking:    { betaHeader: null },
  interleavedThinking: { betaHeader: 'interleaved-thinking-2025-05-14' },
  citations:           { betaHeader: null },
  contextEditing:      { betaHeader: 'clear_tool_uses_20250919' },
  promptCaching:       { betaHeader: null },
  parallelToolUse:     { betaHeader: null },
};

const FEATURE_NAMES = Object.keys(FEATURE_META);

const FALLBACK_LAYERS = {
  ANTHROPIC_FEATURES: 1,
  PROVIDER_FALLBACK:  2,
  STANDARD_RAG:       3,
};

class AnthropicFeatures {
  /**
   * @param {Object} options
   * @param {boolean} [options.extendedThinking=true]
   * @param {boolean} [options.interleavedThinking=true]
   * @param {boolean} [options.citations=true]
   * @param {boolean} [options.contextEditing=true]
   * @param {boolean} [options.promptCaching=true]
   * @param {boolean} [options.parallelToolUse=true]
   * @param {number}  [options.initialCacheBreakpoint=0]
   */
  constructor(options = {}) {
    this._state = {};
    for (const name of FEATURE_NAMES) {
      this._state[name] = {
        enabled:       options[name] !== false,
        softDisabled:  false,
        disableReason: null,
      };
    }
    this._cacheBreakpoint      = options.initialCacheBreakpoint ?? 0;
    this._currentFallbackLayer = FALLBACK_LAYERS.ANTHROPIC_FEATURES;
    const envVal = parseInt(process.env.CHATBOT_AGENTIC_CONTEXT_EDIT_THRESHOLD, 10);
    this._contextEditingThreshold = Number.isNaN(envVal) ? 60000 : envVal;
  }

  isEnabled(feature) {
    const s = this._state[feature];
    return s != null && s.enabled && !s.softDisabled;
  }

  /**
   * 기능 하나를 soft-disable.
   * `enabled` 플래그는 유지 — `softDisabled` 만 true 로 설정하여
   * "구성 시 비활성" vs "런타임 오류로 비활성"을 구분 가능.
   * @returns {{type:'soft-disable', feature:string, reason:string, layer:number}|null}
   */
  softDisable(feature, reason = 'api-error') {
    if (!this._state[feature]) return null;
    this._state[feature].softDisabled  = true;
    this._state[feature].disableReason = reason;
    return {
      type:   'soft-disable',
      feature,
      reason,
      layer:  this._currentFallbackLayer,
    };
  }

  /** 현재 활성 기능에 해당하는 Anthropic beta 헤더 목록 반환. */
  getBetaHeaders() {
    const headers = [];
    for (const [name, meta] of Object.entries(FEATURE_META)) {
      if (this.isEnabled(name) && meta.betaHeader) {
        headers.push(meta.betaHeader);
      }
    }
    return headers;
  }

  /**
   * Extended thinking 파라미터 반환 (Reflexion 트리거 시 사용).
   * @param {number} [budgetTokens=8000]
   * @returns {{type:'enabled', budget_tokens:number}|null}
   */
  getExtendedThinkingConfig(budgetTokens = 8000) {
    if (!this.isEnabled('extendedThinking')) return null;
    return { type: 'enabled', budget_tokens: budgetTokens };
  }

  /**
   * Citations API 파라미터 반환.
   * @returns {{enabled:true}|null}
   */
  getCitationsConfig() {
    if (!this.isEnabled('citations')) return null;
    return { enabled: true };
  }

  /**
   * Anthropic API 응답의 cache usage 처리.
   * cache_read_input_tokens=0 이면 캐시 미스 → breakpoint 재계산.
   *
   * @param {{cache_read_input_tokens:number, input_tokens:number}} usage
   * @returns {{recalculated:boolean, oldBreakpoint?:number, newBreakpoint?:number, reason?:string}}
   */
  handleCacheUsage({ cache_read_input_tokens = 0, input_tokens = 0 } = {}) {
    if (cache_read_input_tokens === 0 && input_tokens > 0) {
      const oldBreakpoint   = this._cacheBreakpoint;
      this._cacheBreakpoint = Math.floor(input_tokens * 0.9);
      return {
        recalculated: true,
        reason:       'cache_miss',
        oldBreakpoint,
        newBreakpoint: this._cacheBreakpoint,
      };
    }
    return { recalculated: false };
  }

  getCacheBreakpoint() {
    return this._cacheBreakpoint;
  }

  /**
   * Prompt Caching (C-15, NFR-13).
   * 마지막 블록에 cache_control:{type:"ephemeral"} 추가.
   * promptCaching soft-disabled 시 원본 반환.
   * @param {Array<Object>} blocks
   * @returns {Array<Object>}
   */
  applyCacheControl(blocks) {
    if (!Array.isArray(blocks) || blocks.length === 0) return blocks;
    if (!this.isEnabled('promptCaching')) return blocks;
    return blocks.map((b, i) =>
      i === blocks.length - 1 ? { ...b, cache_control: { type: 'ephemeral' } } : b
    );
  }

  /**
   * Context editing 토큰 임계값 (Δ-5: 60k 단일 출처 통일).
   * 생성자 시점 CHATBOT_AGENTIC_CONTEXT_EDIT_THRESHOLD 환경변수 값으로 고정.
   * @returns {number}
   */
  getContextEditingThreshold() {
    return this._contextEditingThreshold;
  }

  /**
   * Context editing 발동 여부 — GA 확정 API (Δ-5, TASK-P3-004).
   * 60k 단일 임계 통일. 숫자 이외 값은 안전하게 false 반환.
   * @param {number} tokenCount - Anthropic API usage.input_tokens (누적 입력 토큰 수)
   * @returns {boolean}
   */
  shouldEditContext(tokenCount) {
    return this.isEnabled('contextEditing') && Number.isFinite(tokenCount) && tokenCount >= this._contextEditingThreshold;
  }

  /**
   * @deprecated shouldEditContext() 사용 권장 (TASK-P3-004 GA 확정).
   * @param {number} inputTokens
   * @returns {boolean}
   */
  shouldTriggerContextEditing(inputTokens) {
    return this.shouldEditContext(inputTokens);
  }

  /**
   * Anthropic Messages API context_management 파라미터 반환 (AC-NFR-13-3).
   * context editing 비활성 또는 tokenCount 미달 시 null 반환.
   * @param {number} tokenCount
   * @returns {{edits: Array<{type: string}>}|null}
   */
  getContextEditingPayload(tokenCount) {
    if (!this.shouldEditContext(tokenCount)) return null;
    return { edits: [{ type: 'clear_tool_uses_20250919' }] };
  }

  /**
   * Parallel tool use 활성 여부 (C-16).
   * @returns {boolean}
   */
  isParallelToolUseEnabled() {
    return this.isEnabled('parallelToolUse');
  }

  /**
   * 폴백 레이어 상향 (Layer 1 → 2 → 3, 이후 고정).
   * @returns {{layer:number, reason:string, escalated:boolean}}
   */
  escalateFallback(reason = '') {
    const escalated = this._currentFallbackLayer < FALLBACK_LAYERS.STANDARD_RAG;
    if (escalated) {
      this._currentFallbackLayer++;
    }
    return { layer: this._currentFallbackLayer, reason, escalated };
  }

  getCurrentFallbackLayer() {
    return this._currentFallbackLayer;
  }

  getStatus() {
    const features = {};
    for (const name of FEATURE_NAMES) {
      features[name] = { ...this._state[name] };
    }
    return {
      features,
      fallbackLayer:   this._currentFallbackLayer,
      cacheBreakpoint: this._cacheBreakpoint,
    };
  }
}

module.exports = { AnthropicFeatures, FEATURE_NAMES, FALLBACK_LAYERS };
