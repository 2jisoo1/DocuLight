/**
 * sLLM Answer Subquestion Node
 * @module services/chatbot/workflow/nodes/sllm/answer-subquestion
 *
 * Step 15.1: sLLM 최적화 하위 질문 답변
 * - 단일 하위 질문에 대한 답변 생성
 * - 문서 기반 답변
 * - 출처 인용 포함
 */

const { SLLM_ANSWER_SUBQUESTION } = require("../../sllm-prompts");

/**
 * 하위 질문 답변 노드
 * - 한 번에 하나의 하위 질문에 대해 답변
 * @param {Object} state - 워크플로우 상태
 * @param {Object} deps - 의존성
 * @param {Object} deps.llm - LLM 인스턴스
 * @param {Object} [deps.logger] - 로거
 * @param {number} [subQuestionIndex=0] - 답변할 하위 질문 인덱스
 * @returns {Promise<Object>} 업데이트된 상태
 */
async function answerSubquestion(state, { llm, logger }, subQuestionIndex = 0) {
  const { messages, sllmSubQuestions, retrievedDocs } = state;

  if (!messages || messages.length === 0) {
    return {
      sllmSubAnswers: state.sllmSubAnswers || [],
      currentStep: "sllm:answerSubquestion"
    };
  }

  // 원본 질문 추출
  const lastMessage = messages[messages.length - 1];
  const originalQuestion = typeof lastMessage === "string"
    ? lastMessage
    : lastMessage.content;

  // 하위 질문 확인
  if (!sllmSubQuestions || sllmSubQuestions.length === 0 || subQuestionIndex >= sllmSubQuestions.length) {
    return {
      sllmSubAnswers: state.sllmSubAnswers || [],
      currentStep: "sllm:answerSubquestion"
    };
  }

  const subQuestion = sllmSubQuestions[subQuestionIndex];
  const subQuestionText = typeof subQuestion === "string"
    ? subQuestion
    : subQuestion.question;

  // 문서 포맷팅
  const documents = formatDocuments(retrievedDocs);

  try {
    const prompt = SLLM_ANSWER_SUBQUESTION
      .replace("{originalQuestion}", originalQuestion)
      .replace("{subQuestion}", subQuestionText)
      .replace("{documents}", documents);

    const response = await llm.invoke(prompt);

    const answer = typeof response === "string"
      ? response
      : response.content;

    if (logger) {
      logger.debug("[sLLM] answerSubquestion success", {
        subQuestionIndex,
        answerLength: answer.length
      });
    }

    // 기존 답변 배열에 추가
    const existingAnswers = state.sllmSubAnswers || [];
    const newAnswers = [...existingAnswers];
    newAnswers[subQuestionIndex] = {
      order: subQuestionIndex + 1,
      question: subQuestionText,
      answer: answer.trim()
    };

    return {
      sllmSubAnswers: newAnswers,
      currentStep: "sllm:answerSubquestion"
    };
  } catch (error) {
    if (logger) {
      logger.warn("[sLLM] answerSubquestion error", {
        subQuestionIndex,
        error: error.message
      });
    }

    // 에러 시 기본 답변
    const existingAnswers = state.sllmSubAnswers || [];
    const newAnswers = [...existingAnswers];
    newAnswers[subQuestionIndex] = {
      order: subQuestionIndex + 1,
      question: subQuestionText,
      answer: "문서에서 관련 정보를 찾을 수 없습니다."
    };

    return {
      sllmSubAnswers: newAnswers,
      currentStep: "sllm:answerSubquestion"
    };
  }
}

/**
 * 모든 하위 질문에 대해 순차적으로 답변
 * @param {Object} state - 워크플로우 상태
 * @param {Object} deps - 의존성
 * @returns {Promise<Object>} 업데이트된 상태
 */
async function answerAllSubquestions(state, deps) {
  const { sllmSubQuestions } = state;

  if (!sllmSubQuestions || sllmSubQuestions.length === 0) {
    return {
      sllmSubAnswers: [],
      currentStep: "sllm:answerSubquestion"
    };
  }

  let currentState = { ...state, sllmSubAnswers: [] };

  for (let i = 0; i < sllmSubQuestions.length; i++) {
    const result = await answerSubquestion(currentState, deps, i);
    currentState = { ...currentState, ...result };
  }

  return {
    sllmSubAnswers: currentState.sllmSubAnswers,
    currentStep: "sllm:answerSubquestion"
  };
}

/**
 * 문서 배열을 프롬프트용 문자열로 포맷팅
 * @param {Array} docs - 검색된 문서 배열
 * @returns {string} 포맷팅된 문서 문자열
 */
function formatDocuments(docs) {
  if (!docs || docs.length === 0) {
    return "No documents available.";
  }

  return docs.map((doc, idx) => {
    const content = typeof doc === "string"
      ? doc
      : doc.pageContent || doc.content || "";
    const source = doc.metadata?.source || doc.source || `doc-${idx + 1}`;
    const filename = extractFilename(source);

    return `[Document ${idx + 1}: ${filename}]\n${content.substring(0, 1000)}`;
  }).join("\n\n---\n\n");
}

/**
 * 경로에서 파일명 추출
 * @param {string} path - 파일 경로
 * @returns {string} 파일명
 */
function extractFilename(path) {
  if (!path) return "unknown";
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] || "unknown";
}

module.exports = {
  answerSubquestion,
  answerAllSubquestions,
  formatDocuments
};
