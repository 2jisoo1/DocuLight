/**
 * sLLM Decompose Question Node
 * @module services/chatbot/workflow/nodes/sllm/decompose-question
 *
 * Step 15.1: sLLM 최적화 질문 분해
 * - 복잡한 질문을 2-3개 하위 질문으로 분해
 * - JSON 출력 강제
 * - 폴백: 패턴 기반 분해
 */

const { z } = require("zod");
const { SLLM_DECOMPOSE_QUESTION } = require("../../sllm-prompts");

/**
 * 하위 질문 스키마
 */
const subQuestionSchema = z.object({
  order: z.number(),
  question: z.string()
});

/**
 * 분해 결과 스키마
 */
const decomposeSchema = z.object({
  subQuestions: z.array(subQuestionSchema),
  logic: z.string().optional()
});

/**
 * sLLM 질문 분해 노드
 * @param {Object} state - 워크플로우 상태
 * @param {Object} deps - 의존성
 * @param {Object} deps.llm - LLM 인스턴스
 * @param {Object} [deps.logger] - 로거
 * @returns {Promise<Object>} 업데이트된 상태
 */
async function decomposeQuestion(state, { llm, logger }) {
  const { messages, sllmExtractedConcepts } = state;

  if (!messages || messages.length === 0) {
    return {
      sllmSubQuestions: [],
      currentStep: "sllm:decomposeQuestion"
    };
  }

  const lastMessage = messages[messages.length - 1];
  const question = typeof lastMessage === "string"
    ? lastMessage
    : lastMessage.content;

  if (!question || question.trim().length < 3) {
    return {
      sllmSubQuestions: [],
      currentStep: "sllm:decomposeQuestion"
    };
  }

  // 개념 추출 결과에서 핵심 개념 가져오기
  const concepts = sllmExtractedConcepts?.coreConcepts?.join(", ") || "";

  try {
    // Structured output 시도
    const structuredLLM = llm.withStructuredOutput(decomposeSchema);
    const prompt = SLLM_DECOMPOSE_QUESTION
      .replace("{question}", question)
      .replace("{concepts}", concepts);

    const result = await structuredLLM.invoke(prompt);

    if (logger) {
      logger.debug("[sLLM] decomposeQuestion structured output success", {
        subQuestionCount: result.subQuestions.length
      });
    }

    return {
      sllmSubQuestions: result.subQuestions.slice(0, 3),
      currentStep: "sllm:decomposeQuestion"
    };
  } catch (error) {
    // Fallback: 일반 LLM 호출 후 JSON 파싱
    try {
      const prompt = SLLM_DECOMPOSE_QUESTION
        .replace("{question}", question)
        .replace("{concepts}", concepts);
      const response = await llm.invoke(prompt);

      const content = typeof response === "string"
        ? response
        : response.content;

      const result = parseJsonResponse(content, decomposeSchema);

      if (result) {
        if (logger) {
          logger.debug("[sLLM] decomposeQuestion JSON parse success", {
            subQuestionCount: result.subQuestions.length
          });
        }

        return {
          sllmSubQuestions: result.subQuestions.slice(0, 3),
          currentStep: "sllm:decomposeQuestion"
        };
      }

      // JSON 파싱 실패 - 패턴 폴백
      return decomposeByPattern(question, concepts, logger);
    } catch (fallbackError) {
      if (logger) {
        logger.warn("[sLLM] decomposeQuestion fallback to pattern", {
          error: fallbackError.message
        });
      }
      return decomposeByPattern(question, concepts, logger);
    }
  }
}

/**
 * JSON 응답 파싱
 * @param {string} content - LLM 응답
 * @param {z.ZodSchema} schema - Zod 스키마
 * @returns {Object|null} 파싱된 결과 또는 null
 */
function parseJsonResponse(content, schema) {
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const validated = schema.safeParse(parsed);
      if (validated.success) {
        return validated.data;
      }
    }
  } catch (e) {
    // 파싱 실패
  }
  return null;
}

/**
 * 패턴 기반 질문 분해 (폴백)
 * @param {string} question - 질문
 * @param {string} concepts - 핵심 개념
 * @param {Object} [logger] - 로거
 * @returns {Object} 분해 결과
 */
function decomposeByPattern(question, concepts, logger) {
  const subQuestions = [];

  // 비교/대조 패턴
  const compareMatch = question.match(/(.+?)(?:와|과|랑|하고)\s*(.+?)(?:의?\s*(?:차이|비교|versus|vs))/i);
  if (compareMatch) {
    subQuestions.push(
      { order: 1, question: `${compareMatch[1].trim()}이란 무엇인가요?` },
      { order: 2, question: `${compareMatch[2].trim()}이란 무엇인가요?` },
      { order: 3, question: `${compareMatch[1].trim()}와 ${compareMatch[2].trim()}의 주요 차이점은 무엇인가요?` }
    );
  }

  // 장단점 패턴
  const prosConsMatch = question.match(/(.+?)(?:의?\s*(?:장단점|장점.*단점|pros.*cons))/i);
  if (prosConsMatch && subQuestions.length === 0) {
    const topic = prosConsMatch[1].trim();
    subQuestions.push(
      { order: 1, question: `${topic}의 장점은 무엇인가요?` },
      { order: 2, question: `${topic}의 단점은 무엇인가요?` }
    );
  }

  // 왜 + 어떻게 패턴
  const whyHowMatch = question.match(/왜\s*(.+?)(?:하고|하면서|해서)?\s*어떻게/i) ||
                     question.match(/why\s*(.+?)\s*(?:and\s*)?how/i);
  if (whyHowMatch && subQuestions.length === 0) {
    const topic = whyHowMatch[1].trim();
    subQuestions.push(
      { order: 1, question: `왜 ${topic}인가요?` },
      { order: 2, question: `어떻게 ${topic}하나요?` }
    );
  }

  // and/그리고 패턴 (다중 질문)
  const multiMatch = question.match(/(.+?)(?:그리고|and)\s*(.+)/i);
  if (multiMatch && subQuestions.length === 0) {
    subQuestions.push(
      { order: 1, question: multiMatch[1].trim() + "?" },
      { order: 2, question: multiMatch[2].trim() }
    );
  }

  // 개념 기반 분해 (위 패턴 모두 실패 시)
  if (subQuestions.length === 0 && concepts) {
    const conceptList = concepts.split(",").map(c => c.trim()).filter(Boolean);
    if (conceptList.length >= 2) {
      subQuestions.push(
        { order: 1, question: `${conceptList[0]}에 대해 설명해주세요.` },
        { order: 2, question: `${conceptList.slice(1).join(", ")}는 어떤 역할을 하나요?` }
      );
    }
  }

  // 기본 분해 (모든 패턴 실패 시)
  if (subQuestions.length === 0) {
    subQuestions.push(
      { order: 1, question: question }
    );
  }

  if (logger) {
    logger.debug("[sLLM] decomposeByPattern", {
      question: question.substring(0, 50),
      subQuestionCount: subQuestions.length,
      method: "pattern"
    });
  }

  return {
    sllmSubQuestions: subQuestions.slice(0, 3),
    currentStep: "sllm:decomposeQuestion"
  };
}

module.exports = {
  decomposeQuestion,
  decomposeByPattern,
  decomposeSchema
};
