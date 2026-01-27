/**
 * sLLM Synthesize Answers Node
 * @module services/chatbot/workflow/nodes/sllm/synthesize-answers
 *
 * Step 15.1: sLLM 최적화 답변 합성
 * - 모든 하위 답변을 하나로 조합
 * - 중복 제거 및 일관성 유지
 * - 출처 인용 포함
 */

const { SLLM_SYNTHESIZE_ANSWERS } = require("../../sllm-prompts");

/**
 * sLLM 답변 합성 노드
 * @param {Object} state - 워크플로우 상태
 * @param {Object} deps - 의존성
 * @param {Object} deps.llm - LLM 인스턴스
 * @param {Object} [deps.logger] - 로거
 * @returns {Promise<Object>} 업데이트된 상태
 */
async function synthesizeAnswers(state, { llm, logger }) {
  const { messages, sllmSubAnswers } = state;

  if (!messages || messages.length === 0) {
    return {
      sllmSynthesizedAnswer: "",
      currentStep: "sllm:synthesizeAnswers"
    };
  }

  // 원본 질문 추출
  const lastMessage = messages[messages.length - 1];
  const originalQuestion = typeof lastMessage === "string"
    ? lastMessage
    : lastMessage.content;

  // 하위 답변 확인
  if (!sllmSubAnswers || sllmSubAnswers.length === 0) {
    return {
      sllmSynthesizedAnswer: "",
      currentStep: "sllm:synthesizeAnswers"
    };
  }

  // 하위 답변 포맷팅
  const subAnswersText = formatSubAnswers(sllmSubAnswers);

  try {
    const prompt = SLLM_SYNTHESIZE_ANSWERS
      .replace("{originalQuestion}", originalQuestion)
      .replace("{subAnswers}", subAnswersText);

    const response = await llm.invoke(prompt);

    const synthesized = typeof response === "string"
      ? response
      : response.content;

    if (logger) {
      logger.debug("[sLLM] synthesizeAnswers success", {
        subAnswerCount: sllmSubAnswers.length,
        synthesizedLength: synthesized.length
      });
    }

    return {
      sllmSynthesizedAnswer: synthesized.trim(),
      currentStep: "sllm:synthesizeAnswers"
    };
  } catch (error) {
    if (logger) {
      logger.warn("[sLLM] synthesizeAnswers error, using fallback", {
        error: error.message
      });
    }

    // 폴백: 단순 결합
    return synthesizeByPattern(originalQuestion, sllmSubAnswers, logger);
  }
}

/**
 * 패턴 기반 답변 합성 (폴백)
 * @param {string} originalQuestion - 원본 질문
 * @param {Array} subAnswers - 하위 답변 배열
 * @param {Object} [logger] - 로거
 * @returns {Object} 합성 결과
 */
function synthesizeByPattern(originalQuestion, subAnswers, logger) {
  if (!subAnswers || subAnswers.length === 0) {
    return {
      sllmSynthesizedAnswer: "",
      currentStep: "sllm:synthesizeAnswers"
    };
  }

  // 하위 답변 1개인 경우 그대로 반환
  if (subAnswers.length === 1) {
    const answer = subAnswers[0].answer || subAnswers[0];
    return {
      sllmSynthesizedAnswer: answer,
      currentStep: "sllm:synthesizeAnswers"
    };
  }

  // 여러 하위 답변 결합
  const parts = [];

  // 도입부
  parts.push(`${originalQuestion.replace(/\?$/, "")}에 대해 설명드리겠습니다.`);
  parts.push("");

  // 각 하위 답변 추가
  subAnswers.forEach((item, idx) => {
    const answer = item.answer || item;
    const question = item.question || "";

    if (question && subAnswers.length > 1) {
      parts.push(`**${idx + 1}. ${question.replace(/\?$/, "")}**`);
    }
    parts.push(answer);
    parts.push("");
  });

  // 출처 추출 및 병합
  const sources = extractSources(subAnswers);
  if (sources.length > 0) {
    parts.push(`[Sources: ${sources.join(", ")}]`);
  }

  const synthesized = parts.join("\n").trim();

  if (logger) {
    logger.debug("[sLLM] synthesizeByPattern", {
      subAnswerCount: subAnswers.length,
      synthesizedLength: synthesized.length,
      method: "pattern"
    });
  }

  return {
    sllmSynthesizedAnswer: synthesized,
    currentStep: "sllm:synthesizeAnswers"
  };
}

/**
 * 하위 답변을 프롬프트용 문자열로 포맷팅
 * @param {Array} subAnswers - 하위 답변 배열
 * @returns {string} 포맷팅된 문자열
 */
function formatSubAnswers(subAnswers) {
  return subAnswers.map((item, idx) => {
    const order = item.order || (idx + 1);
    const question = item.question || `Sub-question ${order}`;
    const answer = item.answer || item;

    return `[Sub-answer ${order}]\nQuestion: ${question}\nAnswer: ${answer}`;
  }).join("\n\n---\n\n");
}

/**
 * 답변에서 출처 추출
 * @param {Array} subAnswers - 하위 답변 배열
 * @returns {Array<string>} 고유 출처 목록
 */
function extractSources(subAnswers) {
  const sources = new Set();

  subAnswers.forEach(item => {
    const answer = item.answer || item;
    if (typeof answer !== "string") return;

    // [Source: filename.md] 패턴 추출
    const sourceMatches = answer.match(/\[Source:\s*([^\]]+)\]/gi);
    if (sourceMatches) {
      sourceMatches.forEach(match => {
        const source = match.replace(/\[Source:\s*/i, "").replace(/\]$/, "").trim();
        sources.add(source);
      });
    }
  });

  return [...sources];
}

module.exports = {
  synthesizeAnswers,
  synthesizeByPattern,
  formatSubAnswers,
  extractSources
};
