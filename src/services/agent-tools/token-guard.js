'use strict';

/**
 * TokenGuard — NFR-2 토큰 가드 단일화 (TASK-P3-011, Δ-5)
 * @module services/agent-tools/token-guard
 *
 * 60k input / 4k output 임계값의 단일 출처(Single Source of Truth).
 * budget.js, anthropic-features.js 등에서 이 값을 참조하도록 통일.
 */

/** Anthropic Claude API 최대 입력 토큰 (NFR-2, Δ-5) */
const MAX_INPUT_TOKENS = 60000;

/** Anthropic Claude API 최대 출력 토큰 */
const MAX_OUTPUT_TOKENS = 4000;

/**
 * 입력 토큰 수가 허용 한도 이내인지 확인.
 * @param {number} tokens - 추정 입력 토큰 수
 * @returns {boolean} true: 한도 이내(허용), false: 한도 초과(거부)
 */
function checkInputLimit(tokens) {
  if (typeof tokens !== 'number' || !Number.isFinite(tokens) || tokens < 0) return false;
  return tokens <= MAX_INPUT_TOKENS;
}

/**
 * 출력 토큰 수가 허용 한도 이내인지 확인.
 * @param {number} tokens - 추정 출력 토큰 수
 * @returns {boolean} true: 한도 이내(허용), false: 한도 초과(거부)
 */
function checkOutputLimit(tokens) {
  if (typeof tokens !== 'number' || !Number.isFinite(tokens) || tokens < 0) return false;
  return tokens <= MAX_OUTPUT_TOKENS;
}

module.exports = { MAX_INPUT_TOKENS, MAX_OUTPUT_TOKENS, checkInputLimit, checkOutputLimit };
