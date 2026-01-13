/**
 * Query Contextualization Node
 * @module services/chatbot/workflow/nodes/contextualize
 *
 * Step 18: 대화 맥락을 기반으로 follow-up 질문을 독립적 질문으로 재작성
 */

const { HumanMessage } = require("@langchain/core/messages");
const { CONTEXTUALIZE_PROMPT } = require("../prompts");

/**
 * Follow-up 질문 감지 휴리스틱
 * @param {string} query - 현재 사용자 쿼리
 * @param {Array} messages - 대화 히스토리
 * @returns {boolean} 맥락화 필요 여부
 */
function needsContextualization(query, messages) {
  // 첫 메시지는 맥락화 불필요
  if (!messages || messages.length <= 1) {
    return false;
  }

  const normalized = query.toLowerCase().trim();

  // 참조 대명사 (맥락화 필요)
  const referentialTerms = [
    // English
    'it', 'this', 'that', 'these', 'those', 'them',
    // Korean
    '그것', '이것', '저것', '그거', '이거', '저거',
    '그', '이', '해당', '위의', '앞서'
  ];

  // Follow-up 패턴 (맥락화 필요)
  const followUpPatterns = [
    // Korean
    '에 대해', '에 대한', '질문이에요', '궁금해요', '어때', '어떻게',
    '더 알려', '자세히', '그리고', '또한', '관련해서', '관련하여',
    // English
    'more about', 'tell me more', 'what about', 'how about',
    'regarding', 'concerning', 'related to', 'same'
  ];

  // 주제 변경 신호 (맥락화 안함)
  const topicChangeSignals = [
    // Korean
    '다른 질문', '새로운 주제', '별개로', '그건 그렇고', '주제 바꿔',
    // English
    'new topic', 'different question', 'unrelated', 'by the way',
    'change subject', 'another topic'
  ];

  // 주제 변경 감지 → 맥락화 스킵
  for (const signal of topicChangeSignals) {
    if (normalized.includes(signal)) {
      return false;
    }
  }

  // 참조 대명사 감지
  for (const term of referentialTerms) {
    if (normalized.includes(term)) {
      return true;
    }
  }

  // Follow-up 패턴 감지
  for (const pattern of followUpPatterns) {
    if (normalized.includes(pattern)) {
      return true;
    }
  }

  // 짧은 모호한 쿼리 (20자 미만, 대화 중)
  if (query.length < 20 && messages.length > 1) {
    return true;
  }

  return false;
}

/**
 * Query Contextualization Node
 * 대화 맥락을 기반으로 follow-up 질문을 독립적 질문으로 재작성
 *
 * @param {Object} state - 워크플로우 상태
 * @param {Object} deps - 의존성
 * @param {Object} deps.llm - LLM 인스턴스
 * @param {Object} deps.logger - 로거 인스턴스
 * @returns {Promise<Object>} 업데이트된 상태
 */
async function contextualizeQuery(state, { llm, logger }) {
  const { messages } = state;

  if (!messages || messages.length === 0) {
    return {
      currentStep: "contextualizeQuery",
      contextualizedQuery: null,
    };
  }

  const lastMessage = messages[messages.length - 1];
  const currentQuery = typeof lastMessage === 'string'
    ? lastMessage
    : lastMessage.content;

  // 맥락화 필요 여부 판단
  if (!needsContextualization(currentQuery, messages)) {
    logger?.debug("[contextualizeQuery] No contextualization needed, passing through");
    return {
      currentStep: "contextualizeQuery",
      contextualizedQuery: null,
    };
  }

  // 대화 히스토리 구성 (마지막 메시지 제외, 최근 6개)
  const historyMessages = messages.slice(0, -1).slice(-6);
  const history = historyMessages
    .map(msg => {
      const type = msg._getType?.() || msg.constructor?.name || "unknown";
      const content = typeof msg === "string" ? msg : msg.content;
      const role = type === "human" || type === "HumanMessage" ? "User" : "Assistant";
      return `${role}: ${content}`;
    })
    .join("\n");

  try {
    logger?.info(`[contextualizeQuery] Contextualizing: "${currentQuery}"`);

    const prompt = CONTEXTUALIZE_PROMPT
      .replace("{history}", history)
      .replace("{question}", currentQuery);

    const response = await llm.invoke(prompt);
    const contextualizedQuery = (typeof response === 'string'
      ? response
      : response.content).trim();

    logger?.info(`[contextualizeQuery] Result: "${currentQuery}" → "${contextualizedQuery}"`);

    // 마지막 메시지를 맥락화된 버전으로 교체
    const newMessages = [
      ...messages.slice(0, -1),
      new HumanMessage(contextualizedQuery),
    ];

    return {
      messages: newMessages,
      currentStep: "contextualizeQuery",
      contextualizedQuery,
      originalQuery: currentQuery,
    };
  } catch (error) {
    logger?.error("[contextualizeQuery] Error:", error.message);
    // 오류 시 원본 쿼리로 진행
    return {
      currentStep: "contextualizeQuery",
      contextualizedQuery: null,
      error: `Contextualization failed: ${error.message}`,
    };
  }
}

module.exports = {
  contextualizeQuery,
  needsContextualization,
};
