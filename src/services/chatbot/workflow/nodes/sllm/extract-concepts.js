/**
 * sLLM Extract Concepts Node
 * @module services/chatbot/workflow/nodes/sllm/extract-concepts
 *
 * Step 15.1: sLLM 최적화 개념 추출
 * - 단일 작업: 핵심 개념/키워드 추출만
 * - JSON 출력 강제
 * - 폴백: 패턴 기반 추출
 */

const { z } = require("zod");
const { SLLM_EXTRACT_CONCEPTS } = require("../../sllm-prompts");

/**
 * 추출 결과 스키마
 */
const extractSchema = z.object({
  coreConcepts: z.array(z.string()),
  keywords: z.array(z.string())
});

/**
 * sLLM 개념 추출 노드
 * @param {Object} state - 워크플로우 상태
 * @param {Object} deps - 의존성
 * @param {Object} deps.llm - LLM 인스턴스
 * @param {Object} [deps.logger] - 로거
 * @returns {Promise<Object>} 업데이트된 상태
 */
async function extractConcepts(state, { llm, logger }) {
  const { messages } = state;

  if (!messages || messages.length === 0) {
    return {
      sllmExtractedConcepts: { coreConcepts: [], keywords: [] },
      currentStep: "sllm:extractConcepts"
    };
  }

  const lastMessage = messages[messages.length - 1];
  const question = typeof lastMessage === "string"
    ? lastMessage
    : lastMessage.content;

  if (!question || question.trim().length < 3) {
    return {
      sllmExtractedConcepts: { coreConcepts: [], keywords: [] },
      currentStep: "sllm:extractConcepts"
    };
  }

  try {
    // Structured output 시도
    const structuredLLM = llm.withStructuredOutput(extractSchema);
    const prompt = SLLM_EXTRACT_CONCEPTS.replace("{question}", question);

    const result = await structuredLLM.invoke(prompt);

    if (logger) {
      logger.debug("[sLLM] extractConcepts structured output success", {
        conceptCount: result.coreConcepts.length,
        keywordCount: result.keywords.length
      });
    }

    return {
      sllmExtractedConcepts: {
        coreConcepts: result.coreConcepts.slice(0, 5),
        keywords: result.keywords.slice(0, 5)
      },
      currentStep: "sllm:extractConcepts"
    };
  } catch (error) {
    // Fallback: 일반 LLM 호출 후 JSON 파싱
    try {
      const prompt = SLLM_EXTRACT_CONCEPTS.replace("{question}", question);
      const response = await llm.invoke(prompt);

      const content = typeof response === "string"
        ? response
        : response.content;

      const result = parseJsonResponse(content, extractSchema);

      if (result) {
        if (logger) {
          logger.debug("[sLLM] extractConcepts JSON parse success", {
            conceptCount: result.coreConcepts.length,
            keywordCount: result.keywords.length
          });
        }

        return {
          sllmExtractedConcepts: {
            coreConcepts: result.coreConcepts.slice(0, 5),
            keywords: result.keywords.slice(0, 5)
          },
          currentStep: "sllm:extractConcepts"
        };
      }

      // JSON 파싱 실패 - 패턴 폴백
      return extractByPattern(question, logger);
    } catch (fallbackError) {
      if (logger) {
        logger.warn("[sLLM] extractConcepts fallback to pattern", {
          error: fallbackError.message
        });
      }
      return extractByPattern(question, logger);
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
 * 패턴 기반 개념 추출 (폴백)
 * @param {string} question - 질문
 * @param {Object} [logger] - 로거
 * @returns {Object} 추출 결과
 */
function extractByPattern(question, logger) {
  // 따옴표 내용 추출
  const quotedMatches = question.match(/"([^"]+)"|'([^']+)'|「([^」]+)」|『([^』]+)』/g) || [];
  const quoted = quotedMatches.map(m => m.replace(/["'「」『』]/g, "").trim()).filter(Boolean);

  // 대문자로 시작하는 기술 용어 추출 (영어)
  const technicalEn = question.match(/[A-Z][a-zA-Z0-9]+(?:\.[a-zA-Z]+)?/g) || [];

  // 한글 명사 패턴 (조사 앞의 단어)
  const koreanNouns = question.match(/([가-힣]{2,})(?:이|가|을|를|은|는|의|에|로|와|과|도|만)/g) || [];
  const cleanedKorean = koreanNouns.map(m =>
    m.replace(/(?:이|가|을|를|은|는|의|에|로|와|과|도|만)$/, "")
  ).filter(k => k.length >= 2);

  // 영어 단어 추출 (2글자 이상)
  const englishWords = question.match(/\b[a-zA-Z]{3,}\b/g) || [];

  // 중복 제거 및 결합
  const allConcepts = [...new Set([...quoted, ...technicalEn, ...cleanedKorean])];
  const allKeywords = [...new Set([...technicalEn, ...englishWords.filter(w => w.length >= 4)])];

  const result = {
    coreConcepts: allConcepts.slice(0, 5),
    keywords: allKeywords.slice(0, 5)
  };

  if (logger) {
    logger.debug("[sLLM] extractByPattern", {
      question: question.substring(0, 50),
      conceptCount: result.coreConcepts.length,
      keywordCount: result.keywords.length,
      method: "pattern"
    });
  }

  return {
    sllmExtractedConcepts: result,
    currentStep: "sllm:extractConcepts"
  };
}

module.exports = {
  extractConcepts,
  extractByPattern,
  extractSchema
};
