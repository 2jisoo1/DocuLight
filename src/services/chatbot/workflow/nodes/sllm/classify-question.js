/**
 * sLLM Classify Question Node
 * @module services/chatbot/workflow/nodes/sllm/classify-question
 *
 * Step 15.1: sLLM 최적화 질문 분류
 * - 단일 작업: simple vs complex 판정만
 * - JSON 출력 강제
 * - 폴백: 키워드 기반 분류
 */

const { z } = require("zod");
const { SLLM_CLASSIFY_QUESTION } = require("../../sllm-prompts");

/**
 * 분류 결과 스키마
 */
const classifySchema = z.object({
  type: z.enum(["simple", "complex"]),
  confidence: z.number().min(0).max(1),
  reason: z.string().optional()
});

/**
 * sLLM 질문 분류 노드
 * @param {Object} state - 워크플로우 상태
 * @param {Object} deps - 의존성
 * @param {Object} deps.llm - LLM 인스턴스
 * @param {Object} [deps.logger] - 로거
 * @returns {Promise<Object>} 업데이트된 상태
 */
async function classifyQuestion(state, { llm, logger }) {
  const { messages } = state;

  if (!messages || messages.length === 0) {
    return {
      queryType: "simple",
      confidence: 0.5,
      currentStep: "sllm:classifyQuestion",
      error: "No messages to classify"
    };
  }

  const lastMessage = messages[messages.length - 1];
  const question = typeof lastMessage === "string"
    ? lastMessage
    : lastMessage.content;

  // 빈 입력 처리
  if (!question || question.trim().length < 3) {
    return {
      queryType: "simple",
      confidence: 1.0,
      currentStep: "sllm:classifyQuestion"
    };
  }

  try {
    // Structured output 시도
    const structuredLLM = llm.withStructuredOutput(classifySchema);
    const prompt = SLLM_CLASSIFY_QUESTION.replace("{question}", question);

    const result = await structuredLLM.invoke(prompt);

    if (logger) {
      logger.debug("[sLLM] classifyQuestion structured output success", {
        type: result.type,
        confidence: result.confidence
      });
    }

    return {
      queryType: result.type,
      confidence: result.confidence,
      currentStep: "sllm:classifyQuestion"
    };
  } catch (error) {
    // Fallback: 일반 LLM 호출 후 JSON 파싱
    try {
      const prompt = SLLM_CLASSIFY_QUESTION.replace("{question}", question);
      const response = await llm.invoke(prompt);

      const content = typeof response === "string"
        ? response
        : response.content;

      const result = parseJsonResponse(content, classifySchema);

      if (result) {
        if (logger) {
          logger.debug("[sLLM] classifyQuestion JSON parse success", {
            type: result.type,
            confidence: result.confidence
          });
        }

        return {
          queryType: result.type,
          confidence: result.confidence,
          currentStep: "sllm:classifyQuestion"
        };
      }

      // JSON 파싱 실패 - 키워드 폴백
      return classifyByKeywords(question, logger);
    } catch (fallbackError) {
      if (logger) {
        logger.warn("[sLLM] classifyQuestion fallback to keywords", {
          error: fallbackError.message
        });
      }
      return classifyByKeywords(question, logger);
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
 * 키워드 기반 분류 (폴백)
 * @param {string} question - 질문
 * @param {Object} [logger] - 로거
 * @returns {Object} 분류 결과
 */
function classifyByKeywords(question, logger) {
  const normalized = question.toLowerCase();

  // Complex 패턴
  const complexPatterns = [
    /비교|차이|versus|vs\./i,
    /장단점|pros.*cons/i,
    /왜.*어떻게|why.*how/i,
    /여러|multiple|both/i,
    /and.*and|그리고.*그리고/i,
    /compare|contrast|differ/i,
    /장점.*단점|단점.*장점/i,
    /언제.*어떻게|how.*when/i
  ];

  const isComplex = complexPatterns.some(p => p.test(question));

  if (logger) {
    logger.debug("[sLLM] classifyByKeywords", {
      question: question.substring(0, 50),
      isComplex,
      method: "keyword"
    });
  }

  return {
    queryType: isComplex ? "complex" : "simple",
    confidence: 0.7,
    currentStep: "sllm:classifyQuestion"
  };
}

module.exports = {
  classifyQuestion,
  classifyByKeywords,
  classifySchema
};
