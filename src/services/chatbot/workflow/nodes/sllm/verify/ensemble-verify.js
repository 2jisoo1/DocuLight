/**
 * sLLM Ensemble Verify Node
 * @module services/chatbot/workflow/nodes/sllm/verify/ensemble-verify
 *
 * Step 15.1: sLLM 앙상블 검증
 * - 2개 변형 (정확성, 완전성) 병렬 검증
 * - 가중 평균 점수 계산
 * - 85점 이상 시 Early Exit
 */

const { z } = require("zod");
const {
  SLLM_VERIFY_ACCURACY,
  SLLM_VERIFY_COMPLETENESS
} = require("../../../sllm-prompts");

/**
 * 정확성 검증 스키마
 */
const accuracySchema = z.object({
  matchesDocuments: z.boolean(),
  answersQuestion: z.boolean(),
  unsupportedClaims: z.array(z.string()),
  score: z.number().min(0).max(100)
});

/**
 * 완전성 검증 스키마
 */
const completenessSchema = z.object({
  mainAnswered: z.enum(["yes", "partially", "no"]),
  missingAspects: z.array(z.string()),
  score: z.number().min(0).max(100)
});

/**
 * Early Exit 임계값
 */
const EARLY_EXIT_THRESHOLD = 85;

/**
 * sLLM 앙상블 검증 노드
 * @param {Object} state - 워크플로우 상태
 * @param {Object} deps - 의존성
 * @param {Object} deps.llm - LLM 인스턴스
 * @param {Object} [deps.logger] - 로거
 * @returns {Promise<Object>} 업데이트된 상태
 */
async function ensembleVerify(state, { llm, logger }) {
  const { messages, retrievedDocs, sllmSynthesizedAnswer, sllmSimpleAnswer } = state;

  // 검증할 답변 선택
  const answer = sllmSynthesizedAnswer || sllmSimpleAnswer;

  if (!answer || answer.trim().length === 0) {
    return {
      sllmVerifyScore: { accuracy: 0, completeness: 0, average: 0 },
      currentStep: "sllm:ensembleVerify"
    };
  }

  // 원본 질문 추출
  const lastMessage = messages[messages.length - 1];
  const question = typeof lastMessage === "string"
    ? lastMessage
    : lastMessage.content;

  // 문서 포맷팅
  const documents = formatDocuments(retrievedDocs);

  try {
    // 병렬 검증 실행
    const [accuracyResult, completenessResult] = await Promise.all([
      verifyAccuracy(llm, question, answer, documents, logger),
      verifyCompleteness(llm, question, answer, logger)
    ]);

    // 가중 평균 계산 (정확성 60%, 완전성 40%)
    const averageScore = Math.round(
      accuracyResult.score * 0.6 + completenessResult.score * 0.4
    );

    if (logger) {
      logger.debug("[sLLM] ensembleVerify success", {
        accuracyScore: accuracyResult.score,
        completenessScore: completenessResult.score,
        averageScore,
        earlyExit: averageScore >= EARLY_EXIT_THRESHOLD
      });
    }

    return {
      sllmVerifyScore: {
        accuracy: accuracyResult.score,
        completeness: completenessResult.score,
        average: averageScore,
        details: {
          accuracyDetails: accuracyResult,
          completenessDetails: completenessResult
        }
      },
      currentStep: "sllm:ensembleVerify"
    };
  } catch (error) {
    if (logger) {
      logger.warn("[sLLM] ensembleVerify error, using fallback", {
        error: error.message
      });
    }

    // 폴백: 기본 점수 반환
    return verifyByPattern(question, answer, documents, logger);
  }
}

/**
 * 정확성 검증
 * @param {Object} llm - LLM 인스턴스
 * @param {string} question - 질문
 * @param {string} answer - 답변
 * @param {string} documents - 문서
 * @param {Object} [logger] - 로거
 * @returns {Promise<Object>} 검증 결과
 */
async function verifyAccuracy(llm, question, answer, documents, logger) {
  try {
    const structuredLLM = llm.withStructuredOutput(accuracySchema);
    const prompt = SLLM_VERIFY_ACCURACY
      .replace("{question}", question)
      .replace("{answer}", answer)
      .replace("{documents}", documents);

    const result = await structuredLLM.invoke(prompt);
    return result;
  } catch (error) {
    // 폴백: JSON 파싱 시도
    try {
      const prompt = SLLM_VERIFY_ACCURACY
        .replace("{question}", question)
        .replace("{answer}", answer)
        .replace("{documents}", documents);

      const response = await llm.invoke(prompt);
      const content = typeof response === "string" ? response : response.content;
      const parsed = parseJsonResponse(content, accuracySchema);

      if (parsed) return parsed;
    } catch (e) {
      // 파싱 실패
    }

    // 기본값 반환
    return {
      matchesDocuments: true,
      answersQuestion: true,
      unsupportedClaims: [],
      score: 70
    };
  }
}

/**
 * 완전성 검증
 * @param {Object} llm - LLM 인스턴스
 * @param {string} question - 질문
 * @param {string} answer - 답변
 * @param {Object} [logger] - 로거
 * @returns {Promise<Object>} 검증 결과
 */
async function verifyCompleteness(llm, question, answer, logger) {
  try {
    const structuredLLM = llm.withStructuredOutput(completenessSchema);
    const prompt = SLLM_VERIFY_COMPLETENESS
      .replace("{question}", question)
      .replace("{answer}", answer);

    const result = await structuredLLM.invoke(prompt);
    return result;
  } catch (error) {
    // 폴백: JSON 파싱 시도
    try {
      const prompt = SLLM_VERIFY_COMPLETENESS
        .replace("{question}", question)
        .replace("{answer}", answer);

      const response = await llm.invoke(prompt);
      const content = typeof response === "string" ? response : response.content;
      const parsed = parseJsonResponse(content, completenessSchema);

      if (parsed) return parsed;
    } catch (e) {
      // 파싱 실패
    }

    // 기본값 반환
    return {
      mainAnswered: "yes",
      missingAspects: [],
      score: 70
    };
  }
}

/**
 * 패턴 기반 검증 (폴백)
 * @param {string} question - 질문
 * @param {string} answer - 답변
 * @param {string} documents - 문서
 * @param {Object} [logger] - 로거
 * @returns {Object} 검증 결과
 */
function verifyByPattern(question, answer, documents, logger) {
  // 간단한 휴리스틱 검증
  let accuracyScore = 70;
  let completenessScore = 70;

  // 출처 인용 확인
  if (answer.includes("[Source:") || answer.includes("[출처:")) {
    accuracyScore += 10;
  }

  // 답변 길이 확인
  const answerLength = answer.length;
  if (answerLength > 100 && answerLength < 2000) {
    completenessScore += 10;
  }

  // 질문의 핵심 단어가 답변에 포함되어 있는지 확인
  const questionWords = question.match(/[a-zA-Z가-힣]+/g) || [];
  const answerLower = answer.toLowerCase();
  const matchingWords = questionWords.filter(word =>
    answerLower.includes(word.toLowerCase())
  );
  if (matchingWords.length >= Math.min(3, questionWords.length / 2)) {
    accuracyScore += 5;
    completenessScore += 5;
  }

  const averageScore = Math.round(accuracyScore * 0.6 + completenessScore * 0.4);

  if (logger) {
    logger.debug("[sLLM] verifyByPattern", {
      accuracyScore,
      completenessScore,
      averageScore,
      method: "pattern"
    });
  }

  return {
    sllmVerifyScore: {
      accuracy: accuracyScore,
      completeness: completenessScore,
      average: averageScore
    },
    currentStep: "sllm:ensembleVerify"
  };
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

    return `[Document ${idx + 1}: ${filename}]\n${content.substring(0, 800)}`;
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

/**
 * Early Exit 여부 판단
 * @param {Object} verifyScore - 검증 점수
 * @returns {boolean} Early Exit 여부
 */
function shouldEarlyExit(verifyScore) {
  return verifyScore && verifyScore.average >= EARLY_EXIT_THRESHOLD;
}

module.exports = {
  ensembleVerify,
  verifyAccuracy,
  verifyCompleteness,
  verifyByPattern,
  shouldEarlyExit,
  EARLY_EXIT_THRESHOLD,
  accuracySchema,
  completenessSchema
};
