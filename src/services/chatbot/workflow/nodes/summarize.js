/**
 * Conversation Summarization Node
 * @module services/chatbot/workflow/nodes/summarize
 *
 * Phase 4: 컨텍스트 압축을 위한 대화 요약
 */

const { HumanMessage } = require("@langchain/core/messages");
const { SUMMARIZE_CONVERSATION_PROMPT } = require("../prompts");
const { estimateTokens } = require("../../token-estimator");
const { MultiTurnMemory } = require("../../multi-turn-memory");

/**
 * 대화 히스토리 요약 노드
 * 컨텍스트 크기가 임계값을 초과할 때 호출되어
 * 대화를 요약하고 최근 메시지만 유지
 *
 * @param {Object} state - 워크플로우 상태
 * @param {Object} deps - 의존성
 * @param {Object} deps.llm - LLM 인스턴스
 * @param {Object} deps.config - 설정
 * @returns {Promise<Object>} 업데이트된 상태
 */
async function summarizeHistory(state, { llm, config = {} }) {
  const { messages, summary } = state;

  // 설정값 추출
  const contextLength = config.chatbot?.llm?.contextLength || 128000;
  const targetRatio = config.chatbot?.context?.compressionTarget || 0.1;
  const targetTokens = Math.floor(contextLength * targetRatio);

  // 메시지가 없으면 그대로 반환
  if (!messages || messages.length === 0) {
    return {
      currentStep: "summarizeHistory",
    };
  }

  try {
    // 대화 텍스트 구성
    const conversationText = messages
      .map(msg => {
        const role = getMessageRole(msg);
        const content = typeof msg === 'string' ? msg : msg.content;
        return `${role}: ${content}`;
      })
      .join('\n');

    // 프롬프트 구성
    const prompt = SUMMARIZE_CONVERSATION_PROMPT
      .replace("{existing_summary}", summary || "None")
      .replace("{conversation}", conversationText)
      .replace("{target_tokens}", String(targetTokens));

    // LLM 호출
    const response = await llm.invoke([new HumanMessage(prompt)]);
    const newSummary = typeof response === 'string'
      ? response
      : response.content;

    // 최근 2개 메시지만 유지 (사용자 질문 + AI 응답)
    const recentMessages = messages.slice(-2);

    return {
      summary: newSummary,
      messages: recentMessages,
      currentStep: "summarizeHistory",
    };
  } catch (error) {
    // 요약 실패 시 최근 메시지만 유지하고 요약은 유지
    const recentMessages = messages.slice(-4);

    return {
      messages: recentMessages,
      currentStep: "summarizeHistory",
      error: `Summarization failed: ${error.message}`,
    };
  }
}

/**
 * 메시지 역할 추출
 * @private
 */
function getMessageRole(msg) {
  if (typeof msg === 'string') {
    return 'message';
  }

  // LangChain 메시지 타입 확인
  if (msg._getType) {
    const type = msg._getType();
    switch (type) {
      case 'human':
        return 'User';
      case 'ai':
        return 'Assistant';
      case 'system':
        return 'System';
      default:
        return type;
    }
  }

  // role 속성 확인
  if (msg.role) {
    return msg.role === 'user' ? 'User' : msg.role === 'assistant' ? 'Assistant' : msg.role;
  }

  return 'message';
}

/**
 * 컨텍스트 크기 체크 및 라우팅 결정
 * @param {Object} state - 현재 상태
 * @param {Object} config - 설정
 * @returns {string} 다음 노드 ("summarizeHistory" 또는 END)
 */
function checkContextSize(state, config = {}) {
  const contextLength = config.chatbot?.llm?.contextLength || 128000;
  const threshold = config.chatbot?.context?.compressionThreshold || 0.7;
  const thresholdTokens = Math.floor(contextLength * threshold);

  const currentTokens = estimateTokens(state);

  if (currentTokens > thresholdTokens) {
    return "summarizeHistory";
  }

  return "__end__";  // LangGraph END
}

/**
 * 요약이 필요한지 확인
 * @param {Object} state - 현재 상태
 * @param {Object} config - 설정
 * @returns {boolean} 요약 필요 여부
 */
function needsSummarization(state, config = {}) {
  const contextLength = config.chatbot?.llm?.contextLength || 128000;
  const threshold = config.chatbot?.context?.compressionThreshold || 0.7;
  const thresholdTokens = Math.floor(contextLength * threshold);

  const currentTokens = estimateTokens(state);

  return currentTokens > thresholdTokens;
}

/**
 * 이전 대화 턴 요약 (FR-18, TASK-P2-005).
 * MultiTurnMemory의 얇은 래퍼 — 단발 호출용, prefetch 미지원.
 * prefetch(zero-latency) 기능이 필요하면 MultiTurnMemory 인스턴스를 직접 사용할 것.
 *
 * @param {Array} messages - 대화 메시지 배열
 * @param {object} opts
 * @param {object} opts.llm - LLM 인스턴스
 * @param {string} [opts.provider='']
 * @param {number} [opts.maxLines=5]
 * @param {number} [opts.maxTokens=200]
 * @returns {Promise<string>}
 */
async function summarizePreviousTurns(messages, opts = {}) {
  const { llm, provider = '', maxLines = 5, maxTokens = 200 } = opts;
  if (!llm) throw new Error('summarizePreviousTurns: llm is required');
  const mem = new MultiTurnMemory({ llm, provider });
  return mem.summarizePreviousTurns(messages, { maxLines, maxTokens });
}

module.exports = {
  summarizeHistory,
  checkContextSize,
  needsSummarization,
  summarizePreviousTurns,
};
