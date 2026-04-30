'use strict';

/**
 * LLM Fallback - 재시도 3회 + Standard 그래프 폴백 경계 (NFR-11, Δ-13)
 *
 * Exponential backoff delays between retry attempts: 100ms → 400ms → 1600ms
 * (delays apply before attempt 2, 3, 4 respectively; no delay after the final attempt)
 * Retries beyond backoffDelays.length reuse the last interval.
 * Standard 그래프 폴백 진입 시: retrievalCount=5 강제,
 * 잔여 wall-clock < 15s 이면 즉시 한정 답변 (AR-5 timeout 회귀 방지).
 */

const MAX_RETRIES = 3;
const BACKOFF_DELAYS_MS = [100, 400, 1600];
const STANDARD_FALLBACK_RETRIEVAL_COUNT = 5;
const STANDARD_FALLBACK_WALL_CLOCK_LIMIT_MS = 15000;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * LLM 인스턴스를 재시도 + 폴백 체인으로 래핑한 Runnable을 반환한다.
 *
 * @param {Object} primary - 주 LLM 인스턴스 (.invoke(input) 필수)
 * @param {Array<Object>} [fallbacks=[]] - 재시도 소진 후 순서대로 시도할 폴백 LLM 인스턴스 목록
 * @param {Object} [options={}]
 * @param {number} [options.retries=MAX_RETRIES] - 주 LLM 재시도 횟수
 * @param {Object} [options.logger] - logger.warn(msg) 인터페이스
 * @param {number[]} [options.backoffDelays=BACKOFF_DELAYS_MS] - 재시도 간격(ms) 배열. retries가 배열 길이를 초과하면 마지막 값 반복
 * @returns {{ invoke: Function, retries: number, fallbackCount: number }}
 */
function createLLMWithFallback(
  primary,
  fallbacks = [],
  { retries = MAX_RETRIES, logger, backoffDelays = BACKOFF_DELAYS_MS } = {}
) {
  async function invoke(input) {
    let lastError;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await primary.invoke(input);
      } catch (err) {
        lastError = err;
        if (logger) {
          logger.warn(`LLM primary attempt ${attempt + 1}/${retries + 1} failed: ${err.message}`);
        }
        if (attempt < retries) {
          const delay = backoffDelays[Math.min(attempt, backoffDelays.length - 1)];
          await sleep(delay);
        }
      }
    }

    for (const fallback of fallbacks) {
      try {
        return await fallback.invoke(input);
      } catch (err) {
        lastError = err;
        if (logger) {
          logger.warn(`LLM fallback invoke failed: ${err.message}`);
        }
      }
    }

    throw lastError;
  }

  return { invoke, retries, fallbackCount: fallbacks.length };
}

/**
 * Standard 그래프 폴백 진입 시 적용할 경계값을 반환한다.
 *
 * @param {number} remainingWallClockMs - 현재 시점 기준 잔여 wall-clock (ms)
 * @returns {{ retrievalCount: number, immediateRefusal: boolean }}
 */
function getStandardFallbackBounds(remainingWallClockMs) {
  return {
    retrievalCount: STANDARD_FALLBACK_RETRIEVAL_COUNT,
    immediateRefusal: remainingWallClockMs < STANDARD_FALLBACK_WALL_CLOCK_LIMIT_MS,
  };
}

const CB_DEFAULT_FAILURE_THRESHOLD = 3;
const CB_DEFAULT_RESET_TIMEOUT_MS = 30000;

/**
 * Circuit breaker for LLM invocations (NFR-11, Δ-13 GA).
 *
 * States:
 *   closed   – normal; failures accumulate toward threshold
 *   open     – fail-fast; no upstream calls until resetTimeoutMs elapses
 *   half-open – one probe call; success → closed, failure → open again
 */
class CircuitBreaker {
  constructor({
    failureThreshold = CB_DEFAULT_FAILURE_THRESHOLD,
    resetTimeoutMs = CB_DEFAULT_RESET_TIMEOUT_MS,
    logger,
  } = {}) {
    if (!Number.isInteger(failureThreshold) || failureThreshold < 1)
      throw new RangeError('failureThreshold must be a positive integer');
    if (typeof resetTimeoutMs !== 'number' || resetTimeoutMs < 0)
      throw new RangeError('resetTimeoutMs must be a non-negative number');
    this.failureThreshold = failureThreshold;
    this.resetTimeoutMs = resetTimeoutMs;
    this.logger = logger;
    this._state = 'closed';
    this._failureCount = 0;
    this._lastFailureTime = null;
  }

  get state() {
    return this._state;
  }

  async execute(fn) {
    // Promote open → half-open if reset window has elapsed (pure transition, no side effects in getter)
    if (
      this._state === 'open' &&
      this._lastFailureTime !== null &&
      Date.now() - this._lastFailureTime >= this.resetTimeoutMs
    ) {
      this._state = 'half-open';
    }

    if (this._state === 'open') {
      throw new Error('CircuitBreaker open: fast-fail');
    }

    try {
      const result = await fn();
      this._onSuccess();
      return result;
    } catch (err) {
      this._onFailure(err);
      throw err;
    }
  }

  _onSuccess() {
    this._failureCount = 0;
    this._state = 'closed';
    if (this.logger && typeof this.logger.info === 'function')
      this.logger.info('CircuitBreaker: closed (recovered)');
  }

  _onFailure(err) {
    this._failureCount++;
    this._lastFailureTime = Date.now();
    if (this._failureCount >= this.failureThreshold) {
      this._state = 'open';
      if (this.logger)
        this.logger.warn(
          `CircuitBreaker: open after ${this._failureCount} failures — ${err.message}`
        );
    }
  }

  reset() {
    this._state = 'closed';
    this._failureCount = 0;
    this._lastFailureTime = null;
  }
}

module.exports = {
  createLLMWithFallback,
  getStandardFallbackBounds,
  CircuitBreaker,
  MAX_RETRIES,
  STANDARD_FALLBACK_RETRIEVAL_COUNT,
  STANDARD_FALLBACK_WALL_CLOCK_LIMIT_MS,
  CB_DEFAULT_FAILURE_THRESHOLD,
  CB_DEFAULT_RESET_TIMEOUT_MS,
};
