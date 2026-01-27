/**
 * sLLM Fact Verify Node
 * @module services/chatbot/workflow/nodes/sllm/verify/fact-verify
 *
 * Step 15.1: sLLM 사실 검증
 * - 답변을 개별 사실로 분해
 * - 각 사실을 문서와 대조 검증
 * - Early Exit 시 건너뜀
 */

const { z } = require("zod");
const { SLLM_FACT_VERIFY } = require("../../../sllm-prompts");

/**
 * 개별 사실 스키마
 */
const factSchema = z.object({
  id: z.number(),
  text: z.string(),
  status: z.enum(["verified", "inferred", "not_found", "contradicted"]),
  evidence: z.string().nullable(),
  source: z.string().nullable()
});

/**
 * 사실 검증 결과 스키마
 */
const factVerifySchema = z.object({
  facts: z.array(factSchema),
  summary: z.object({
    verified: z.number(),
    inferred: z.number(),
    not_found: z.number(),
    contradicted: z.number()
  }),
  overallScore: z.number().min(0).max(100)
});

/**
 * sLLM 사실 검증 노드
 * @param {Object} state - 워크플로우 상태
 * @param {Object} deps - 의존성
 * @param {Object} deps.llm - LLM 인스턴스
 * @param {Object} [deps.logger] - 로거
 * @returns {Promise<Object>} 업데이트된 상태
 */
async function factVerify(state, { llm, logger }) {
  const { retrievedDocs, sllmSynthesizedAnswer, sllmSimpleAnswer, sllmVerifyScore } = state;

  // Early Exit 체크 (앙상블 점수 85점 이상이면 건너뜀)
  if (sllmVerifyScore && sllmVerifyScore.average >= 85) {
    if (logger) {
      logger.debug("[sLLM] factVerify skipped (early exit)", {
        verifyScore: sllmVerifyScore.average
      });
    }

    return {
      sllmFactCheckResult: {
        skipped: true,
        reason: "early_exit",
        verifyScore: sllmVerifyScore.average
      },
      currentStep: "sllm:factVerify"
    };
  }

  // 검증할 답변 선택
  const answer = sllmSynthesizedAnswer || sllmSimpleAnswer;

  if (!answer || answer.trim().length === 0) {
    return {
      sllmFactCheckResult: {
        facts: [],
        summary: { verified: 0, inferred: 0, not_found: 0, contradicted: 0 },
        overallScore: 0
      },
      currentStep: "sllm:factVerify"
    };
  }

  // 문서 포맷팅
  const documents = formatDocuments(retrievedDocs);

  try {
    // Structured output 시도
    const structuredLLM = llm.withStructuredOutput(factVerifySchema);
    const prompt = SLLM_FACT_VERIFY
      .replace("{answer}", answer)
      .replace("{documents}", documents);

    const result = await structuredLLM.invoke(prompt);

    if (logger) {
      logger.debug("[sLLM] factVerify structured output success", {
        factCount: result.facts.length,
        overallScore: result.overallScore
      });
    }

    return {
      sllmFactCheckResult: result,
      currentStep: "sllm:factVerify"
    };
  } catch (error) {
    // Fallback: JSON 파싱 시도
    try {
      const prompt = SLLM_FACT_VERIFY
        .replace("{answer}", answer)
        .replace("{documents}", documents);

      const response = await llm.invoke(prompt);
      const content = typeof response === "string" ? response : response.content;
      const result = parseJsonResponse(content, factVerifySchema);

      if (result) {
        if (logger) {
          logger.debug("[sLLM] factVerify JSON parse success", {
            factCount: result.facts.length,
            overallScore: result.overallScore
          });
        }

        return {
          sllmFactCheckResult: result,
          currentStep: "sllm:factVerify"
        };
      }

      // 패턴 폴백
      return factVerifyByPattern(answer, retrievedDocs, logger);
    } catch (fallbackError) {
      if (logger) {
        logger.warn("[sLLM] factVerify fallback to pattern", {
          error: fallbackError.message
        });
      }
      return factVerifyByPattern(answer, retrievedDocs, logger);
    }
  }
}

/**
 * 패턴 기반 사실 검증 (폴백)
 * @param {string} answer - 답변
 * @param {Array} docs - 문서 배열
 * @param {Object} [logger] - 로거
 * @returns {Object} 검증 결과
 */
function factVerifyByPattern(answer, docs, logger) {
  // 문장으로 분리
  const sentences = answer.split(/[.!?。]\s*/).filter(s => s.trim().length > 10);
  const documentContent = extractAllDocumentContent(docs);

  const facts = [];
  let verified = 0;
  let inferred = 0;
  let notFound = 0;

  sentences.forEach((sentence, idx) => {
    const trimmedSentence = sentence.trim();
    if (!trimmedSentence) return;

    // 문서에서 유사 내용 검색
    const evidence = findEvidence(trimmedSentence, documentContent);

    let status;
    if (evidence.confidence > 0.7) {
      status = "verified";
      verified++;
    } else if (evidence.confidence > 0.3) {
      status = "inferred";
      inferred++;
    } else {
      status = "not_found";
      notFound++;
    }

    facts.push({
      id: idx + 1,
      text: trimmedSentence,
      status,
      evidence: evidence.text || null,
      source: evidence.source || null
    });
  });

  // 전체 점수 계산
  const total = verified + inferred + notFound;
  const overallScore = total > 0
    ? Math.round((verified * 100 + inferred * 50) / total)
    : 50;

  if (logger) {
    logger.debug("[sLLM] factVerifyByPattern", {
      factCount: facts.length,
      verified,
      inferred,
      notFound,
      overallScore,
      method: "pattern"
    });
  }

  return {
    sllmFactCheckResult: {
      facts,
      summary: { verified, inferred, not_found: notFound, contradicted: 0 },
      overallScore
    },
    currentStep: "sllm:factVerify"
  };
}

/**
 * 문서에서 증거 찾기
 * @param {string} claim - 주장 문장
 * @param {Array<Object>} documentContent - 문서 내용 배열
 * @returns {Object} 증거 정보
 */
function findEvidence(claim, documentContent) {
  const claimWords = extractKeywords(claim);
  if (claimWords.length === 0) {
    return { confidence: 0, text: null, source: null };
  }

  let bestMatch = { confidence: 0, text: null, source: null };

  for (const doc of documentContent) {
    const sentences = doc.content.split(/[.!?。]\s*/);

    for (const sentence of sentences) {
      if (sentence.length < 10) continue;

      const sentenceWords = extractKeywords(sentence);
      const matchCount = claimWords.filter(word =>
        sentenceWords.some(sw =>
          sw.toLowerCase().includes(word.toLowerCase()) ||
          word.toLowerCase().includes(sw.toLowerCase())
        )
      ).length;

      const confidence = matchCount / claimWords.length;

      if (confidence > bestMatch.confidence) {
        bestMatch = {
          confidence,
          text: sentence.trim(),
          source: doc.source
        };
      }
    }
  }

  return bestMatch;
}

/**
 * 모든 문서 내용 추출
 * @param {Array} docs - 문서 배열
 * @returns {Array<Object>} 문서 내용 배열
 */
function extractAllDocumentContent(docs) {
  if (!docs || docs.length === 0) return [];

  return docs.map((doc, idx) => {
    const content = typeof doc === "string"
      ? doc
      : doc.pageContent || doc.content || "";
    const source = doc.metadata?.source || doc.source || `doc-${idx + 1}`;

    return { content, source: extractFilename(source) };
  });
}

/**
 * 키워드 추출
 * @param {string} text - 텍스트
 * @returns {Array<string>} 키워드 배열
 */
function extractKeywords(text) {
  const stopWords = new Set([
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "must", "can", "this", "that", "these",
    "those", "it", "its", "of", "in", "on", "at", "to", "for", "with",
    "이", "그", "저", "은", "는", "이", "가", "을", "를", "의", "에", "로"
  ]);

  const words = text.match(/[a-zA-Z가-힣]+/g) || [];
  return words.filter(word =>
    word.length >= 2 && !stopWords.has(word.toLowerCase())
  );
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

/**
 * 미검증 사실 목록 추출
 * @param {Object} factCheckResult - 사실 검증 결과
 * @returns {Array<Object>} 미검증 사실 배열
 */
function getUnverifiedFacts(factCheckResult) {
  if (!factCheckResult || !factCheckResult.facts) return [];

  return factCheckResult.facts.filter(fact =>
    fact.status === "not_found" || fact.status === "contradicted"
  );
}

/**
 * 검증 통과 여부 판단
 * @param {Object} factCheckResult - 사실 검증 결과
 * @param {number} threshold - 통과 임계값 (기본 70)
 * @returns {boolean} 통과 여부
 */
function isFactVerifyPassed(factCheckResult, threshold = 70) {
  if (!factCheckResult) return false;
  if (factCheckResult.skipped) return true;
  return factCheckResult.overallScore >= threshold;
}

module.exports = {
  factVerify,
  factVerifyByPattern,
  getUnverifiedFacts,
  isFactVerifyPassed,
  factVerifySchema,
  factSchema
};
