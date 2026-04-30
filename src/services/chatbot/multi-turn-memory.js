'use strict';

/**
 * Multi-Turn Memory Module (FR-18, TASK-P2-005)
 *
 * 멀티턴 대화 요약 메모리.
 * - maxLines/maxTokens 동적 한도
 * - 비동기 prefetch로 다음 턴 latency 0
 * - provider != anthropic 시에도 동일 인터페이스(LLM 폴백 투명)
 */

/** 메시지 역할 문자열 추출 */
function _extractRole(msg) {
  if (!msg) return 'User';
  if (msg.role) {
    return msg.role === 'user' ? 'User' : msg.role === 'assistant' ? 'Assistant' : msg.role;
  }
  if (typeof msg._getType === 'function') {
    const t = msg._getType();
    return t === 'human' ? 'User' : t === 'ai' ? 'Assistant' : t;
  }
  return 'User';
}

/**
 * LLM 응답에서 텍스트 추출.
 * string / { content: string } / { content: [{type:'text',text:'...'}] } 모두 처리.
 * @private
 */
function _extractResponseText(response) {
  if (typeof response === 'string') return response;
  if (!response?.content) return '';
  if (typeof response.content === 'string') return response.content;
  if (Array.isArray(response.content)) {
    return response.content.map(b => (b.text ?? '')).join('');
  }
  return '';
}

/**
 * 요약 텍스트를 maxLines·maxTokens 동적 한도로 절단.
 * 빈 줄 제거 후 줄 수 먼저 적용, 이후 토큰 한도 적용.
 *
 * @param {string} text
 * @param {number} maxLines
 * @param {number} maxTokens
 * @returns {string}
 */
function truncateSummary(text, maxLines, maxTokens) {
  const lines = (text || '').split('\n').filter(l => l.trim() !== '');
  const byLines = lines.slice(0, maxLines).join('\n');
  const charLimit = maxTokens * 4;
  return byLines.length > charLimit ? byLines.slice(0, charLimit) : byLines;
}

/**
 * 캐시 키: [role, content_prefix] 쌍의 JSON + opts 포함.
 * JSON.stringify로 구분자 충돌 회피.
 */
function _cacheKey(messages, maxLines, maxTokens) {
  const msgPart = JSON.stringify(
    (messages || []).map(m => [_extractRole(m), (m?.content || '').slice(0, 128)])
  );
  return `${msgPart}|${maxLines}|${maxTokens}`;
}

/**
 * LLM을 호출해 요약 생성. 실패 시 대화 텍스트 절단으로 graceful degradation.
 * @private
 */
async function _invokeSummaryLlm(llm, messages, maxLines, maxTokens) {
  const conversation = (messages || [])
    .filter(m => m != null)
    .map(m => `${_extractRole(m)}: ${(m.content || '').slice(0, 500)}`)
    .join('\n');

  const prompt = [
    `다음 대화를 ${maxLines}줄 이내, 약 ${maxTokens}토큰 이내로 핵심 정보만 요약하세요.`,
    '',
    conversation,
  ].join('\n');

  try {
    const response = await llm.invoke([{ role: 'user', content: prompt }]);
    const raw = _extractResponseText(response);
    return truncateSummary(raw, maxLines, maxTokens);
  } catch {
    return truncateSummary(conversation, maxLines, maxTokens);
  }
}

/**
 * 멀티턴 메모리 클래스.
 * prefetchNextTurnSummary()로 비동기 사전 호출, summarizePreviousTurns()에서 캐시 히트.
 */
class MultiTurnMemory {
  /**
   * @param {object} deps
   * @param {object} deps.llm - invoke() 메서드를 가진 LLM 인스턴스
   * @param {string} [deps.provider=''] - LLM 제공자 이름
   */
  constructor({ llm, provider = '' } = {}) {
    this._llm = llm;
    this._provider = (provider || '').toLowerCase();
    /** @type {Map<string, Promise<string>>} */
    this._prefetchCache = new Map();
  }

  /**
   * 이전 대화 턴을 요약한 문자열 반환.
   * prefetch 캐시가 있으면 즉시 반환(zero latency), 없으면 LLM 호출.
   *
   * @param {Array} messages - 대화 메시지 배열
   * @param {object} [opts]
   * @param {number} [opts.maxLines=5]
   * @param {number} [opts.maxTokens=200]
   * @returns {Promise<string>}
   */
  async summarizePreviousTurns(messages, { maxLines = 5, maxTokens = 200 } = {}) {
    const key = _cacheKey(messages, maxLines, maxTokens);

    if (this._prefetchCache.has(key)) {
      const promise = this._prefetchCache.get(key);
      this._prefetchCache.delete(key);
      return promise;
    }

    return _invokeSummaryLlm(this._llm, messages, maxLines, maxTokens);
  }

  /**
   * 다음 턴을 위한 요약을 비동기로 사전 호출 (non-blocking).
   * 현재 턴 종료 직후 호출하면 다음 턴의 summarizePreviousTurns()가 캐시 히트.
   *
   * @param {Array} messages
   * @param {object} [opts]
   * @param {number} [opts.maxLines=5]
   * @param {number} [opts.maxTokens=200]
   */
  prefetchNextTurnSummary(messages, { maxLines = 5, maxTokens = 200 } = {}) {
    const key = _cacheKey(messages, maxLines, maxTokens);
    if (!this._prefetchCache.has(key)) {
      this._prefetchCache.set(
        key,
        _invokeSummaryLlm(this._llm, messages, maxLines, maxTokens)
      );
    }
  }

  /** 사전 호출 캐시 전체 삭제. */
  clearPrefetchCache() {
    this._prefetchCache.clear();
  }
}

module.exports = { MultiTurnMemory, truncateSummary };
