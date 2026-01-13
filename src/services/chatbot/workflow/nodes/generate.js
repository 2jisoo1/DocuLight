/**
 * Answer Generation Node
 * @module services/chatbot/workflow/nodes/generate
 *
 * 검색된 문서를 기반으로 답변 생성
 */

const { HumanMessage, SystemMessage, AIMessage } = require("@langchain/core/messages");
const {
  SYSTEM_PROMPT,
  GENERATE_PROMPT,
  GENERATE_NO_CONTEXT_PROMPT,
  CHITCHAT_PROMPT,
  SUMMARY_PROMPT,
  LOW_RELEVANCE_PROMPT,
  NO_CONTEXT_PROMPT,
  FAST_GENERATE_PROMPT
} = require("../prompts");
const { formatRetrievedDocs } = require("./retrieve");

/**
 * 답변 생성 노드
 * @param {Object} state - 워크플로우 상태
 * @param {Object} deps - 의존성
 * @param {Object} deps.llm - LLM 인스턴스
 * @param {Object} deps.config - 설정
 * @returns {Promise<Object>} 업데이트된 상태
 */
async function generateAnswer(state, { llm, config = {} }) {
  const { messages, retrievedDocs, queryType } = state;

  if (!messages || messages.length === 0) {
    return {
      messages: [new AIMessage("I don't have a question to respond to.")],
      currentStep: "generateAnswer",
      error: "No messages to generate answer for",
    };
  }

  const lastMessage = messages[messages.length - 1];
  const userQuestion = typeof lastMessage === 'string'
    ? lastMessage
    : lastMessage.content;

  // 시스템 프롬프트 (설정 또는 기본값)
  const systemPrompt = config.chatbot?.systemPrompt || SYSTEM_PROMPT;

  try {
    let generatePrompt;

    // 대화 히스토리 구성 (마지막 메시지 제외, 최대 10개)
    const historyMessages = messages.slice(0, -1).slice(-10);
    const history = historyMessages
      .map(msg => {
        const type = msg._getType?.() || msg.constructor?.name || "unknown";
        const content = typeof msg === "string" ? msg : msg.content;
        const role = type === "human" || type === "HumanMessage" ? "User" : "Assistant";
        return `${role}: ${content}`;
      })
      .join("\n");

    switch (queryType) {
      case "chitchat":
        generatePrompt = CHITCHAT_PROMPT
          .replace("{history}", history || "No previous conversation")
          .replace("{input}", userQuestion);
        break;

      case "summary":
        if (retrievedDocs && retrievedDocs.length > 0) {
          const context = formatRetrievedDocs(retrievedDocs);
          generatePrompt = SUMMARY_PROMPT
            .replace("{context}", context)
            .replace("{question}", userQuestion);
        } else {
          generatePrompt = GENERATE_NO_CONTEXT_PROMPT
            .replace("{question}", userQuestion);
        }
        break;

      case "question":
      default:
        if (retrievedDocs && retrievedDocs.length > 0) {
          const context = formatRetrievedDocs(retrievedDocs);
          generatePrompt = GENERATE_PROMPT
            .replace("{context}", context)
            .replace("{question}", userQuestion);
        } else {
          generatePrompt = GENERATE_NO_CONTEXT_PROMPT
            .replace("{question}", userQuestion);
        }
        break;
    }

    // LLM 호출
    const response = await llm.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(generatePrompt),
    ]);

    // 응답 메시지 추출
    const aiMessage = response instanceof AIMessage
      ? response
      : new AIMessage(typeof response === 'string' ? response : response.content);

    // RAG 사용 여부 (문서가 있으면 RAG 사용한 것)
    const usedRAG = retrievedDocs && retrievedDocs.length > 0;

    return {
      messages: [aiMessage],
      currentStep: "generateAnswer",
      usedRAG,
    };
  } catch (error) {
    // Log the actual error for debugging
    console.error(`[generateAnswer] LLM error:`, error.message || error);

    const errorMessage = new AIMessage(
      "I apologize, but I encountered an error while generating a response. Please try again."
    );

    return {
      messages: [errorMessage],
      currentStep: "generateAnswer",
      error: `Generation failed: ${error.message}`,
    };
  }
}

/**
 * 스트리밍 답변 생성 노드
 * @param {Object} state - 워크플로우 상태
 * @param {Object} deps - 의존성
 * @param {Object} deps.llm - LLM 인스턴스
 * @param {Object} deps.config - 설정
 * @param {Function} deps.onToken - 토큰 콜백
 * @returns {AsyncGenerator} 토큰 스트림
 */
async function* generateAnswerStream(state, { llm, config = {}, onToken }) {
  const { messages, retrievedDocs, queryType } = state;

  if (!messages || messages.length === 0) {
    yield "I don't have a question to respond to.";
    return;
  }

  const lastMessage = messages[messages.length - 1];
  const userQuestion = typeof lastMessage === 'string'
    ? lastMessage
    : lastMessage.content;

  const systemPrompt = config.chatbot?.systemPrompt || SYSTEM_PROMPT;

  // 대화 히스토리 구성 (마지막 메시지 제외, 최대 10개)
  const historyMessages = messages.slice(0, -1).slice(-10);
  const history = historyMessages
    .map(msg => {
      const type = msg._getType?.() || msg.constructor?.name || "unknown";
      const content = typeof msg === "string" ? msg : msg.content;
      const role = type === "human" || type === "HumanMessage" ? "User" : "Assistant";
      return `${role}: ${content}`;
    })
    .join("\n");

  let generatePrompt;

  switch (queryType) {
    case "chitchat":
      generatePrompt = CHITCHAT_PROMPT
        .replace("{history}", history || "No previous conversation")
        .replace("{input}", userQuestion);
      break;

    case "summary":
      if (retrievedDocs && retrievedDocs.length > 0) {
        const context = formatRetrievedDocs(retrievedDocs);
        generatePrompt = SUMMARY_PROMPT
          .replace("{context}", context)
          .replace("{question}", userQuestion);
      } else {
        generatePrompt = GENERATE_NO_CONTEXT_PROMPT
          .replace("{question}", userQuestion);
      }
      break;

    case "question":
    default:
      if (retrievedDocs && retrievedDocs.length > 0) {
        const context = formatRetrievedDocs(retrievedDocs);
        generatePrompt = GENERATE_PROMPT
          .replace("{context}", context)
          .replace("{question}", userQuestion);
      } else {
        generatePrompt = GENERATE_NO_CONTEXT_PROMPT
          .replace("{question}", userQuestion);
      }
      break;
  }

  try {
    // 스트리밍 호출
    const stream = await llm.stream([
      new SystemMessage(systemPrompt),
      new HumanMessage(generatePrompt),
    ]);

    let fullContent = "";

    for await (const chunk of stream) {
      const token = typeof chunk === 'string' ? chunk : chunk.content;
      fullContent += token;

      if (onToken) {
        onToken(token);
      }

      yield token;
    }

    return fullContent;
  } catch (error) {
    yield "I apologize, but I encountered an error while generating a response.";
  }
}

/**
 * 낮은 관련성 문서로 답변 생성 (Phase 5: Graceful Degradation)
 * 검색 결과의 관련성이 낮지만 재시도 횟수를 초과한 경우
 *
 * @param {Object} state - 워크플로우 상태
 * @param {Object} deps - 의존성
 * @param {Object} deps.llm - LLM 인스턴스
 * @param {Object} deps.config - 설정
 * @returns {Promise<Object>} 업데이트된 상태
 */
async function generateWithLowRelevance(state, { llm, config = {} }) {
  const { messages, retrievedDocs } = state;

  if (!messages || messages.length === 0) {
    return {
      messages: [new AIMessage("I don't have a question to respond to.")],
      currentStep: "generateWithLowRelevance",
      error: "No messages",
    };
  }

  const lastMessage = messages[messages.length - 1];
  const userQuestion = typeof lastMessage === 'string'
    ? lastMessage
    : lastMessage.content;

  const systemPrompt = config.chatbot?.systemPrompt || SYSTEM_PROMPT;

  try {
    // 상위 3개 문서만 사용
    const topDocs = (retrievedDocs || []).slice(0, 3);
    const context = formatRetrievedDocs(topDocs);

    const prompt = LOW_RELEVANCE_PROMPT
      .replace("{context}", context || "No documents available")
      .replace("{question}", userQuestion);

    const response = await llm.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(prompt),
    ]);

    const aiMessage = response instanceof AIMessage
      ? response
      : new AIMessage(typeof response === 'string' ? response : response.content);

    return {
      messages: [aiMessage],
      currentStep: "generateWithLowRelevance",
    };
  } catch (error) {
    console.error(`[generateWithLowRelevance] LLM error:`, error.message || error);
    return {
      messages: [new AIMessage("I apologize, but I encountered an error. Please try again.")],
      currentStep: "generateWithLowRelevance",
      error: `Generation failed: ${error.message}`,
    };
  }
}

/**
 * 검색 결과 없이 답변 생성 (Phase 5: No Context)
 * 관련 문서를 찾지 못한 경우
 *
 * @param {Object} state - 워크플로우 상태
 * @param {Object} deps - 의존성
 * @param {Object} deps.llm - LLM 인스턴스
 * @param {Object} deps.config - 설정
 * @returns {Promise<Object>} 업데이트된 상태
 */
async function generateNoContext(state, { llm, config = {} }) {
  const { messages } = state;

  if (!messages || messages.length === 0) {
    return {
      messages: [new AIMessage("I don't have a question to respond to.")],
      currentStep: "generateNoContext",
      error: "No messages",
    };
  }

  const lastMessage = messages[messages.length - 1];
  const userQuestion = typeof lastMessage === 'string'
    ? lastMessage
    : lastMessage.content;

  // 대화 히스토리 구성 (마지막 메시지 제외, 최대 10개)
  const historyMessages = messages.slice(0, -1).slice(-10);
  const history = historyMessages
    .map(msg => {
      const type = msg._getType?.() || msg.constructor?.name || "unknown";
      const content = typeof msg === "string" ? msg : msg.content;
      const role = type === "human" || type === "HumanMessage" ? "User" : "Assistant";
      return `${role}: ${content}`;
    })
    .join("\n");

  const systemPrompt = config.chatbot?.systemPrompt || SYSTEM_PROMPT;

  try {
    const prompt = NO_CONTEXT_PROMPT
      .replace("{history}", history || "No previous conversation")
      .replace("{question}", userQuestion);

    const response = await llm.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(prompt),
    ]);

    const aiMessage = response instanceof AIMessage
      ? response
      : new AIMessage(typeof response === 'string' ? response : response.content);

    return {
      messages: [aiMessage],
      currentStep: "generateNoContext",
    };
  } catch (error) {
    console.error(`[generateNoContext] LLM error:`, error.message || error);
    return {
      messages: [new AIMessage("I couldn't find relevant information for your question. Please try rephrasing.")],
      currentStep: "generateNoContext",
      error: `Generation failed: ${error.message}`,
    };
  }
}

/**
 * Fast Path 답변 생성 (Step 16: Self-Correcting RAG)
 * RAG 없이 대화 히스토리만으로 빠르게 답변 시도
 *
 * @param {Object} state - 워크플로우 상태
 * @param {Object} deps - 의존성
 * @param {Object} deps.llm - LLM 인스턴스
 * @param {Object} deps.config - 설정
 * @returns {Promise<Object>} 업데이트된 상태
 */
async function fastGenerate(state, { llm, config = {} }) {
  const { messages, queryType } = state;

  if (!messages || messages.length === 0) {
    return {
      messages: [new AIMessage("I don't have a question to respond to.")],
      currentStep: "fastGenerate",
      usedRAG: false,
      error: "No messages",
    };
  }

  // 마지막 메시지 (사용자 질문)
  const lastMessage = messages[messages.length - 1];
  const userQuestion = typeof lastMessage === 'string'
    ? lastMessage
    : lastMessage.content;

  // 대화 히스토리 구성 (마지막 메시지 제외, 최대 10개)
  const historyMessages = messages.slice(0, -1).slice(-10);
  const history = historyMessages
    .map(msg => {
      const type = msg._getType?.() || msg.constructor?.name || "unknown";
      const content = typeof msg === "string" ? msg : msg.content;
      const role = type === "human" ? "User" : "Assistant";
      return `${role}: ${content}`;
    })
    .join("\n");

  const systemPrompt = config.chatbot?.systemPrompt || SYSTEM_PROMPT;

  try {
    let generatePrompt;

    // chitchat은 기존 프롬프트 사용
    if (queryType === "chitchat") {
      generatePrompt = CHITCHAT_PROMPT.replace("{input}", userQuestion);
    } else {
      // 나머지는 fast path 프롬프트 사용
      generatePrompt = FAST_GENERATE_PROMPT
        .replace("{history}", history || "No previous conversation")
        .replace("{question}", userQuestion);
    }

    const response = await llm.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(generatePrompt),
    ]);

    const aiMessage = response instanceof AIMessage
      ? response
      : new AIMessage(typeof response === 'string' ? response : response.content);

    return {
      messages: [aiMessage],
      currentStep: "fastGenerate",
      usedRAG: false,
    };
  } catch (error) {
    console.error(`[fastGenerate] LLM error:`, error.message || error);
    return {
      messages: [new AIMessage("I apologize, but I encountered an error. Please try again.")],
      currentStep: "fastGenerate",
      usedRAG: false,
      error: `Fast generation failed: ${error.message}`,
    };
  }
}

module.exports = {
  generateAnswer,
  generateAnswerStream,
  generateWithLowRelevance,
  generateNoContext,
  fastGenerate
};
