/**
 * Query Rewriting Node
 * @module services/chatbot/workflow/nodes/rewrite
 *
 * Phase 5: 검색 실패 시 질문 재구성
 * 최대 2회까지 재시도
 */

const { HumanMessage } = require("@langchain/core/messages");
const { REWRITE_PROMPT } = require("../prompts");

/**
 * 쿼리 재작성 노드
 * 관련성이 낮은 검색 결과를 받았을 때 질문을 더 명확하게 재구성
 *
 * @param {Object} state - 워크플로우 상태
 * @param {Object} deps - 의존성
 * @param {Object} deps.llm - LLM 인스턴스
 * @returns {Promise<Object>} 업데이트된 상태
 */
async function rewriteQuery(state, { llm }) {
  const { messages, rewriteCount = 0 } = state;

  // 최대 2회 재시도 제한
  if (rewriteCount >= 2) {
    return {
      currentStep: "rewriteQuery",
      error: "Max rewrite attempts reached",
    };
  }

  // 메시지가 없으면 실패
  if (!messages || messages.length === 0) {
    return {
      currentStep: "rewriteQuery",
      error: "No messages to rewrite",
    };
  }

  const lastMessage = messages[messages.length - 1];
  const originalQuestion = typeof lastMessage === 'string'
    ? lastMessage
    : lastMessage.content;

  if (!originalQuestion || originalQuestion.trim().length === 0) {
    return {
      currentStep: "rewriteQuery",
      error: "Empty question to rewrite",
    };
  }

  try {
    // 질문 재작성 프롬프트 구성
    const prompt = REWRITE_PROMPT.replace("{question}", originalQuestion);
    const response = await llm.invoke(prompt);

    // 응답에서 재작성된 질문 추출
    const rewrittenQuestion = typeof response === 'string'
      ? response.trim()
      : response.content.trim();

    // 재작성된 질문이 원본과 같으면 약간 변형
    const finalQuestion = rewrittenQuestion === originalQuestion
      ? `${originalQuestion} (more details)`
      : rewrittenQuestion;

    // 재작성된 질문으로 메시지 교체
    const newMessages = [
      ...messages.slice(0, -1),
      new HumanMessage(finalQuestion),
    ];

    return {
      messages: newMessages,
      rewriteCount: rewriteCount + 1,
      currentStep: "rewriteQuery",
    };
  } catch (error) {
    // LLM 호출 실패 시 기본 재작성
    const fallbackQuestion = enhanceQuestionSimple(originalQuestion);
    const newMessages = [
      ...messages.slice(0, -1),
      new HumanMessage(fallbackQuestion),
    ];

    return {
      messages: newMessages,
      rewriteCount: rewriteCount + 1,
      currentStep: "rewriteQuery",
      error: `Rewrite failed, using fallback: ${error.message}`,
    };
  }
}

/**
 * 간단한 질문 개선 (폴백)
 * LLM 없이 키워드 추가로 질문 개선
 * @private
 */
function enhanceQuestionSimple(question) {
  // 질문 끝에 추가 컨텍스트 요청
  const enhancements = [
    "Please provide specific details.",
    "Include relevant documentation references.",
    "Explain step by step.",
  ];

  // 랜덤하게 하나 선택
  const enhancement = enhancements[Math.floor(Math.random() * enhancements.length)];

  return `${question} ${enhancement}`;
}

/**
 * 재시도 가능 여부 확인
 * @param {Object} state - 현재 상태
 * @param {number} maxRetries - 최대 재시도 횟수 (기본: 2)
 * @returns {boolean} 재시도 가능 여부
 */
function canRetryRewrite(state, maxRetries = 2) {
  const { rewriteCount = 0 } = state;
  return rewriteCount < maxRetries;
}

module.exports = { rewriteQuery, enhanceQuestionSimple, canRetryRewrite };
