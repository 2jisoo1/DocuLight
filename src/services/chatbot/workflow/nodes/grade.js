/**
 * Document Grading Node
 * @module services/chatbot/workflow/nodes/grade
 *
 * Phase 5: 검색된 문서의 관련성 평가
 * 관련성 점수에 따라 Query Rewriting 또는 답변 생성으로 라우팅
 */

const { z } = require("zod");
const { GRADE_PROMPT } = require("../prompts");

/**
 * 문서 관련성 평가 스키마
 */
const gradingSchema = z.object({
  binaryScore: z.enum(["yes", "no"]),
  reasoning: z.string().optional(),
});

/**
 * 문서 관련성 평가 노드
 * 검색된 각 문서가 질문과 관련이 있는지 평가
 *
 * @param {Object} state - 워크플로우 상태
 * @param {Object} deps - 의존성
 * @param {Object} deps.llm - LLM 인스턴스
 * @returns {Promise<Object>} 업데이트된 상태
 */
async function gradeDocuments(state, { llm }) {
  const { messages, retrievedDocs } = state;

  // 검색된 문서가 없으면 0점
  if (!retrievedDocs || retrievedDocs.length === 0) {
    return {
      relevanceScore: 0,
      currentStep: "gradeDocuments",
    };
  }

  // 마지막 메시지 (사용자 질문)
  const lastMessage = messages[messages.length - 1];
  const question = typeof lastMessage === 'string'
    ? lastMessage
    : lastMessage.content;

  if (!question) {
    return {
      relevanceScore: 0,
      currentStep: "gradeDocuments",
      error: "No question to grade against",
    };
  }

  try {
    // Structured output을 지원하는 LLM 사용
    const structuredLLM = llm.withStructuredOutput(gradingSchema);

    let relevantCount = 0;
    const maxDocsToGrade = Math.min(retrievedDocs.length, 10); // 최대 10개만 평가

    for (let i = 0; i < maxDocsToGrade; i++) {
      const doc = retrievedDocs[i];
      const prompt = GRADE_PROMPT
        .replace("{question}", question)
        .replace("{document}", doc.pageContent.slice(0, 1000)); // 최대 1000자

      try {
        const result = await structuredLLM.invoke(prompt);
        if (result.binaryScore === "yes") {
          relevantCount++;
        }
      } catch (gradeError) {
        // 개별 문서 평가 실패 시 스킵
        continue;
      }
    }

    const relevanceScore = relevantCount / maxDocsToGrade;

    return {
      relevanceScore,
      currentStep: "gradeDocuments",
    };
  } catch (error) {
    // Structured output 미지원 시 키워드 기반 폴백
    return gradeByKeywords(question, retrievedDocs);
  }
}

/**
 * 키워드 기반 관련성 평가 (폴백)
 * LLM 사용 없이 키워드 매칭으로 관련성 평가
 * @private
 */
function gradeByKeywords(question, retrievedDocs) {
  // 질문에서 키워드 추출 (단순화)
  const keywords = question
    .toLowerCase()
    .replace(/[^\w\s가-힣]/g, '')
    .split(/\s+/)
    .filter(word => word.length > 2);

  let relevantCount = 0;
  const maxDocsToGrade = Math.min(retrievedDocs.length, 10);

  for (let i = 0; i < maxDocsToGrade; i++) {
    const doc = retrievedDocs[i];
    const content = doc.pageContent.toLowerCase();

    // 키워드 중 하나라도 포함되면 관련 있음으로 판단
    const hasKeyword = keywords.some(keyword => content.includes(keyword));
    if (hasKeyword) {
      relevantCount++;
    }
  }

  const relevanceScore = relevantCount / maxDocsToGrade;

  return {
    relevanceScore,
    currentStep: "gradeDocuments",
  };
}

/**
 * 관련성 점수 기반 라우팅 결정
 * @param {Object} state - 현재 상태
 * @param {number} threshold - 관련성 임계값 (기본: 0.7)
 * @returns {string} 다음 노드 이름
 */
function routeByRelevance(state, threshold = 0.7) {
  const { relevanceScore, rewriteCount, retrievedDocs } = state;

  // 충분한 관련성 → 답변 생성
  if (relevanceScore >= threshold) {
    return "generateAnswer";
  }

  // 재시도 가능 → 쿼리 재작성
  if ((rewriteCount || 0) < 2) {
    return "rewriteQuery";
  }

  // 재시도 초과 시: 검색 결과가 있으면 진행, 없으면 no-context 응답
  if (retrievedDocs && retrievedDocs.length > 0) {
    return "generateWithLowRelevance";
  }

  return "generateNoContext";
}

module.exports = { gradeDocuments, gradingSchema, gradeByKeywords, routeByRelevance };
