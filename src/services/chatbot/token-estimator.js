/**
 * Token Estimator
 * @module services/chatbot/token-estimator
 *
 * UTF-8 바이트 기반 토큰 수 추정
 * 정확한 토큰화는 tiktoken 등을 사용하나,
 * 빠른 추정을 위해 바이트 기반 계산 사용
 */

/**
 * 토큰 수 추정 (UTF-8 바이트 기반)
 * 일반적으로 영어는 1토큰 ≈ 4바이트, 한국어는 1토큰 ≈ 2-3바이트
 * 평균적으로 3바이트당 1토큰으로 추정
 *
 * @param {string|Object} input - 텍스트 또는 상태 객체
 * @returns {number} 추정 토큰 수
 */
function estimateTokens(input) {
  let text;

  if (typeof input === 'string') {
    text = input;
  } else if (input && typeof input === 'object') {
    // 상태 객체인 경우 모든 텍스트 결합
    const parts = [];

    // 요약 추가
    if (input.summary) {
      parts.push(input.summary);
    }

    // 메시지 추가
    if (input.messages && Array.isArray(input.messages)) {
      for (const msg of input.messages) {
        const content = typeof msg === 'string' ? msg : (msg.content || '');
        parts.push(content);
      }
    }

    // 검색된 문서 추가
    if (input.retrievedDocs && Array.isArray(input.retrievedDocs)) {
      for (const doc of input.retrievedDocs) {
        if (doc.pageContent) {
          parts.push(doc.pageContent);
        }
      }
    }

    text = parts.join('\n');
  } else {
    return 0;
  }

  if (!text || text.length === 0) {
    return 0;
  }

  // UTF-8 바이트 계산
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);

  // UTF-8 바이트 / 3 ≈ 토큰 수 (평균 추정)
  return Math.ceil(bytes.length / 3);
}

/**
 * 토큰 제한 내 텍스트 잘라내기
 * @param {string} text - 원본 텍스트
 * @param {number} maxTokens - 최대 토큰 수
 * @returns {string} 잘린 텍스트
 */
function truncateToTokenLimit(text, maxTokens) {
  if (!text) return '';

  const currentTokens = estimateTokens(text);
  if (currentTokens <= maxTokens) {
    return text;
  }

  // 토큰당 평균 3바이트로 추정
  const targetBytes = maxTokens * 3;

  // UTF-8 인코딩
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);

  // 바이트 수로 자르기 (UTF-8 문자 경계 고려)
  const decoder = new TextDecoder();
  let truncatedBytes = bytes.slice(0, targetBytes);

  // UTF-8 문자 경계에서 자르기 위해 뒤에서부터 유효한 위치 찾기
  while (truncatedBytes.length > 0) {
    try {
      const result = decoder.decode(truncatedBytes);
      return result + '...';
    } catch (e) {
      // 마지막 바이트 제거하고 다시 시도
      truncatedBytes = truncatedBytes.slice(0, -1);
    }
  }

  return '';
}

/**
 * 컨텍스트 크기가 임계값을 초과하는지 확인
 * @param {Object} state - 상태 객체
 * @param {number} contextLength - 전체 컨텍스트 길이
 * @param {number} threshold - 임계값 비율 (0-1)
 * @returns {boolean} 초과 여부
 */
function isContextOverThreshold(state, contextLength, threshold = 0.7) {
  const currentTokens = estimateTokens(state);
  const thresholdTokens = Math.floor(contextLength * threshold);

  return currentTokens > thresholdTokens;
}

/**
 * 남은 토큰 수 계산
 * @param {Object} state - 상태 객체
 * @param {number} contextLength - 전체 컨텍스트 길이
 * @returns {number} 남은 토큰 수
 */
function getRemainingTokens(state, contextLength) {
  const currentTokens = estimateTokens(state);
  return Math.max(0, contextLength - currentTokens);
}

module.exports = {
  estimateTokens,
  truncateToTokenLimit,
  isContextOverThreshold,
  getRemainingTokens
};
