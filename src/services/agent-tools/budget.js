'use strict';

/**
 * BudgetController — FR-8 예산·루프 통제 (TASK-P1-004)
 * @module services/agent-tools/budget
 *
 * 제어 항목:
 *   max_iterations : CHATBOT_AGENTIC_MAX_ITERATIONS 환경변수 (기본 8)
 *   max_tool_calls : 12
 *   wall_clock     : 45s
 *   input_tokens   : 60k, output_tokens: 4k
 *   dedup          : SHA-1(name + normalized_args) — 동일 호출 2회까지 허용, 3회째 차단
 *   path canon     : 경로 인자 정규화 + traversal 차단
 */

const crypto = require('crypto');
const { MAX_INPUT_TOKENS, MAX_OUTPUT_TOKENS } = require('./token-guard');

const MAX_ITERATIONS   = parseInt(process.env.CHATBOT_AGENTIC_MAX_ITERATIONS ?? '8', 10);
const MAX_TOOL_CALLS   = 12;
const WALL_CLOCK_MS    = 45000;

// 경로처럼 보이는 인자 키 패턴 (path, filePath, docPath, …)
const PATH_KEY_RE = /path|file|doc/i;

/**
 * 도구 인자 정규화 (dedup 해시 일관성):
 * - 키를 알파벳 순 정렬 (필드 순서 무관)
 * - 문자열 값 앞뒤 공백 제거
 * @param {object} args
 * @returns {object}
 */
function normalizeArgs(args) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return args ?? {};
  const keys = Object.keys(args).sort();
  const out = {};
  for (const k of keys) {
    const v = args[k];
    out[k] = typeof v === 'string' ? v.trim() : v;
  }
  return out;
}

/**
 * 문서/파일 경로 정규화:
 * - 백슬래시 → 슬래시
 * - 중복 슬래시 축소
 * - 루트(/) 외 후행 슬래시 제거
 * - `..` traversal 시퀀스 감지 시 throw
 * @param {string} pathStr
 * @returns {string}
 * @throws {Error} traversal 감지 시
 */
function canonicalizePath(pathStr) {
  if (typeof pathStr !== 'string') return pathStr;
  // URL-encoded traversal 방어 (%2e%2e 등) — 디코딩 실패 시 원본 사용
  let decoded;
  try { decoded = decodeURIComponent(pathStr); } catch (_) { decoded = pathStr; }
  const normalized = decoded.replace(/\\/g, '/').replace(/\/+/g, '/');
  if (/(?:^|\/)\.\.(?:\/|$)/.test(normalized)) {
    throw new Error(`Path traversal blocked: "${pathStr}"`);
  }
  return normalized.length > 1 && normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
}

/**
 * 도구 호출 dedup 해시 계산.
 * SHA-1(toolName + '\x00' + JSON(normalizedArgs))
 * @param {string} toolName
 * @param {object} args
 * @returns {string} 40자 hex
 */
function computeDedupHash(toolName, args) {
  const payload = toolName + '\x00' + JSON.stringify(normalizeArgs(args));
  return crypto.createHash('sha1').update(payload, 'utf8').digest('hex');
}

/**
 * FR-8 예산·루프 통제 컨트롤러.
 *
 * 사용 패턴:
 *   const bc = new BudgetController({ logger });
 *   bc.restoreDedupHashes(state.dedup_hashes);   // 체크포인트 복원 (선택)
 *
 *   // 매 iteration 시작 시
 *   bc.checkIterations(state.iteration)           // 초과 시 { exceeded: true }
 *   bc.checkWallClock()
 *   bc.recordTokens(response.usage.input, response.usage.output)
 *
 *   // 매 tool_use 발행 시
 *   bc.checkToolCall(name, args)                  // 차단 시 { allowed: false, reason }
 *
 *   // observe 노드 이후 state 반영
 *   state.dedup_hashes = bc.getDedupHashes()
 */
class BudgetController {
  /**
   * @param {object} [opts]
   * @param {number} [opts.maxIterations]
   * @param {number} [opts.maxToolCalls]
   * @param {number} [opts.wallClockMs]
   * @param {number} [opts.maxInputTokens]
   * @param {number} [opts.maxOutputTokens]
   * @param {object} [opts.logger]
   */
  constructor({
    maxIterations  = MAX_ITERATIONS,
    maxToolCalls   = MAX_TOOL_CALLS,
    wallClockMs    = WALL_CLOCK_MS,
    maxInputTokens = MAX_INPUT_TOKENS,
    maxOutputTokens = MAX_OUTPUT_TOKENS,
    logger         = null,
  } = {}) {
    this.maxIterations   = maxIterations;
    this.maxToolCalls    = maxToolCalls;
    this.wallClockMs     = wallClockMs;
    this.maxInputTokens  = maxInputTokens;
    this.maxOutputTokens = maxOutputTokens;
    this._logger         = logger;

    this._startMs      = Date.now();
    this._toolCalls    = 0;
    this._inputTokens  = 0;
    this._outputTokens = 0;
    /** @type {Record<string, number>} hash → 누적 호출 횟수 */
    this._dedup = {};
  }

  /**
   * iteration 횟수 예산 확인.
   * @param {number} iteration - 현재 iteration 값 (상태의 state.iteration)
   * @returns {{ exceeded: boolean, type?: string }}
   */
  checkIterations(iteration) {
    if (iteration >= this.maxIterations) {
      this._logger?.warn(`[BudgetController] budget_exceeded:iterations iter=${iteration} max=${this.maxIterations}`);
      return { exceeded: true, type: 'iterations' };
    }
    return { exceeded: false };
  }

  /**
   * wall-clock 예산 확인.
   * @returns {{ exceeded: boolean, type?: string }}
   */
  checkWallClock() {
    const elapsed = Date.now() - this._startMs;
    if (elapsed >= this.wallClockMs) {
      this._logger?.warn(`[BudgetController] budget_exceeded:wall_clock elapsed=${elapsed}ms max=${this.wallClockMs}ms`);
      return { exceeded: true, type: 'wall_clock' };
    }
    return { exceeded: false };
  }

  /**
   * 토큰 사용량 기록 및 예산 확인.
   * @param {number} [inputTokens=0]
   * @param {number} [outputTokens=0]
   * @returns {{ exceeded: boolean, type?: string }}
   */
  recordTokens(inputTokens = 0, outputTokens = 0) {
    this._inputTokens  += inputTokens;
    this._outputTokens += outputTokens;
    if (this._inputTokens > this.maxInputTokens) {
      this._logger?.warn(`[BudgetController] budget_exceeded:input_tokens total=${this._inputTokens}`);
      return { exceeded: true, type: 'input_tokens' };
    }
    if (this._outputTokens > this.maxOutputTokens) {
      this._logger?.warn(`[BudgetController] budget_exceeded:output_tokens total=${this._outputTokens}`);
      return { exceeded: true, type: 'output_tokens' };
    }
    return { exceeded: false };
  }

  /**
   * 도구 호출 허용 여부 판정 (tool_call 총횟수 + dedup + path canonicalization).
   * 내부 카운터를 증가시키므로 실제 허용된 호출에만 사용.
   *
   * @param {string} toolName
   * @param {object} args
   * @returns {{ allowed: boolean, reason?: string, hash?: string }}
   */
  checkToolCall(toolName, args) {
    // 1. path canonicalization FIRST — 실패 시 카운터 영향 없음 (C-1 수정)
    let canonArgs;
    try {
      canonArgs = this._canonicalizePathArgs(args);
    } catch (e) {
      this._logger?.warn(`[BudgetController] path_traversal_blocked: ${e.message}`);
      return { allowed: false, reason: 'path_traversal' };
    }

    // 2. tool_call 총횟수 카운터 + 한도 체크
    this._toolCalls++;
    if (this._toolCalls > this.maxToolCalls) {
      this._logger?.warn(`[BudgetController] budget_exceeded:tool_calls count=${this._toolCalls} max=${this.maxToolCalls}`);
      return { allowed: false, reason: 'tool_call_limit' };
    }

    // 3. dedup 체크 (동일 호출 2회까지 허용, 3회째 차단)
    const hash = computeDedupHash(toolName, canonArgs);
    const seen = this._dedup[hash] ?? 0;
    this._dedup[hash] = seen + 1;

    if (seen >= 2) {
      this._logger?.warn(`[BudgetController] dedup_blocked:${toolName}:${hash.slice(0, 8)}`);
      return { allowed: false, reason: 'dedup', hash };
    }

    return { allowed: true, hash };
  }

  /**
   * LangGraph state 직렬화용 dedup 해시 테이블 반환.
   * @returns {Record<string, number>}
   */
  getDedupHashes() {
    return { ...this._dedup };
  }

  /**
   * 체크포인트에서 dedup 상태 복원.
   * @param {Record<string, number>} hashes
   */
  restoreDedupHashes(hashes) {
    if (!hashes || typeof hashes !== 'object') return;
    for (const [k, v] of Object.entries(hashes)) {
      this._dedup[k] = Math.max(this._dedup[k] ?? 0, Number(v) || 0);
    }
  }

  /** @private */
  _canonicalizePathArgs(args) {
    if (!args || typeof args !== 'object' || Array.isArray(args)) return args ?? {};
    const out = { ...args };
    for (const key of Object.keys(out)) {
      if (typeof out[key] === 'string' && PATH_KEY_RE.test(key)) {
        out[key] = canonicalizePath(out[key]);
      }
    }
    return out;
  }
}

module.exports = { BudgetController, computeDedupHash, normalizeArgs, canonicalizePath };
