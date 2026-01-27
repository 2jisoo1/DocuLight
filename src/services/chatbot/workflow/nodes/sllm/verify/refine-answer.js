/**
 * sLLM Refine Answer Node
 * @module services/chatbot/workflow/nodes/sllm/verify/refine-answer
 *
 * Step 15.1: sLLM 답변 개선
 * - 검증 피드백 기반 답변 수정
 * - 미검증 사실 처리
 * - Early Exit 시 원본 반환
 */

const { SLLM_REFINE_ANSWER } = require("../../../sllm-prompts");

/**
 * 개선 필요 임계값
 */
const REFINE_THRESHOLD = 85;

/**
 * sLLM 답변 개선 노드
 * @param {Object} state - 워크플로우 상태
 * @param {Object} deps - 의존성
 * @param {Object} deps.llm - LLM 인스턴스
 * @param {Object} [deps.logger] - 로거
 * @returns {Promise<Object>} 업데이트된 상태
 */
async function refineAnswer(state, { llm, logger }) {
  const {
    sllmSynthesizedAnswer,
    sllmSimpleAnswer,
    sllmVerifyScore,
    sllmFactCheckResult
  } = state;

  // 원본 답변 선택
  const originalAnswer = sllmSynthesizedAnswer || sllmSimpleAnswer;

  if (!originalAnswer || originalAnswer.trim().length === 0) {
    return {
      sllmRefinedAnswer: "",
      sllmFinalAnswer: "",
      currentStep: "sllm:refineAnswer"
    };
  }

  // Early Exit 체크 (앙상블 점수 85점 이상이면 개선 없이 원본 반환)
  if (sllmVerifyScore && sllmVerifyScore.average >= REFINE_THRESHOLD) {
    if (logger) {
      logger.debug("[sLLM] refineAnswer skipped (early exit)", {
        verifyScore: sllmVerifyScore.average
      });
    }

    return {
      sllmRefinedAnswer: originalAnswer,
      sllmFinalAnswer: originalAnswer,
      currentStep: "sllm:refineAnswer"
    };
  }

  // 팩트 체크도 건너뛴 경우 (Early Exit)
  if (sllmFactCheckResult?.skipped) {
    return {
      sllmRefinedAnswer: originalAnswer,
      sllmFinalAnswer: originalAnswer,
      currentStep: "sllm:refineAnswer"
    };
  }

  // 검증 이슈 수집
  const issues = collectIssues(sllmVerifyScore, sllmFactCheckResult);

  // 미검증 사실 수집
  const unverifiedFacts = getUnverifiedFactsText(sllmFactCheckResult);

  // 이슈가 없으면 원본 반환
  if (issues.length === 0 && unverifiedFacts.length === 0) {
    return {
      sllmRefinedAnswer: originalAnswer,
      sllmFinalAnswer: originalAnswer,
      currentStep: "sllm:refineAnswer"
    };
  }

  try {
    const prompt = SLLM_REFINE_ANSWER
      .replace("{answer}", originalAnswer)
      .replace("{issues}", issues.join("\n") || "None")
      .replace("{unverifiedFacts}", unverifiedFacts.join("\n") || "None");

    const response = await llm.invoke(prompt);

    const refined = typeof response === "string"
      ? response
      : response.content;

    if (logger) {
      logger.debug("[sLLM] refineAnswer success", {
        originalLength: originalAnswer.length,
        refinedLength: refined.length,
        issueCount: issues.length,
        unverifiedCount: unverifiedFacts.length
      });
    }

    return {
      sllmRefinedAnswer: refined.trim(),
      sllmFinalAnswer: refined.trim(),
      currentStep: "sllm:refineAnswer"
    };
  } catch (error) {
    if (logger) {
      logger.warn("[sLLM] refineAnswer error, using fallback", {
        error: error.message
      });
    }

    // 폴백: 패턴 기반 개선
    return refineByPattern(originalAnswer, issues, unverifiedFacts, logger);
  }
}

/**
 * 패턴 기반 답변 개선 (폴백)
 * @param {string} answer - 원본 답변
 * @param {Array<string>} issues - 이슈 목록
 * @param {Array<string>} unverifiedFacts - 미검증 사실 목록
 * @param {Object} [logger] - 로거
 * @returns {Object} 개선된 답변
 */
function refineByPattern(answer, issues, unverifiedFacts, logger) {
  let refined = answer;

  // 미검증 사실 처리
  if (unverifiedFacts.length > 0) {
    // 미검증 문장에 주의 표시 추가
    for (const fact of unverifiedFacts) {
      // 해당 문장이 답변에 있으면 "문서에 따르면" 추가
      if (refined.includes(fact)) {
        refined = refined.replace(
          fact,
          `(문서 외 정보) ${fact}`
        );
      }
    }
  }

  // 출처가 없으면 일반 표현 추가
  if (!refined.includes("[Source:") && !refined.includes("[출처:")) {
    refined = refined.trim();
    if (!refined.endsWith(".")) {
      refined += ".";
    }
    refined += " (가능한 문서를 기반으로 답변하였습니다.)";
  }

  if (logger) {
    logger.debug("[sLLM] refineByPattern", {
      originalLength: answer.length,
      refinedLength: refined.length,
      method: "pattern"
    });
  }

  return {
    sllmRefinedAnswer: refined,
    sllmFinalAnswer: refined,
    currentStep: "sllm:refineAnswer"
  };
}

/**
 * 검증 결과에서 이슈 수집
 * @param {Object} verifyScore - 앙상블 검증 점수
 * @param {Object} factCheckResult - 사실 검증 결과
 * @returns {Array<string>} 이슈 목록
 */
function collectIssues(verifyScore, factCheckResult) {
  const issues = [];

  // 앙상블 검증 이슈
  if (verifyScore?.details) {
    const { accuracyDetails, completenessDetails } = verifyScore.details;

    if (accuracyDetails) {
      if (!accuracyDetails.matchesDocuments) {
        issues.push("답변이 문서 내용과 일치하지 않을 수 있습니다.");
      }
      if (!accuracyDetails.answersQuestion) {
        issues.push("질문에 대한 직접적인 답변이 아닐 수 있습니다.");
      }
      if (accuracyDetails.unsupportedClaims?.length > 0) {
        issues.push(`지원되지 않는 주장: ${accuracyDetails.unsupportedClaims.join(", ")}`);
      }
    }

    if (completenessDetails) {
      if (completenessDetails.mainAnswered === "partially") {
        issues.push("질문에 부분적으로만 답변되었습니다.");
      } else if (completenessDetails.mainAnswered === "no") {
        issues.push("질문에 제대로 답변되지 않았습니다.");
      }
      if (completenessDetails.missingAspects?.length > 0) {
        issues.push(`누락된 측면: ${completenessDetails.missingAspects.join(", ")}`);
      }
    }
  }

  // 사실 검증 이슈
  if (factCheckResult && !factCheckResult.skipped) {
    const summary = factCheckResult.summary;
    if (summary) {
      if (summary.contradicted > 0) {
        issues.push(`${summary.contradicted}개의 사실이 문서와 모순됩니다.`);
      }
      if (summary.not_found > 2) {
        issues.push(`${summary.not_found}개의 사실이 문서에서 확인되지 않았습니다.`);
      }
    }
  }

  return issues;
}

/**
 * 사실 검증 결과에서 미검증 사실 텍스트 추출
 * @param {Object} factCheckResult - 사실 검증 결과
 * @returns {Array<string>} 미검증 사실 텍스트 목록
 */
function getUnverifiedFactsText(factCheckResult) {
  if (!factCheckResult || factCheckResult.skipped || !factCheckResult.facts) {
    return [];
  }

  return factCheckResult.facts
    .filter(fact => fact.status === "not_found" || fact.status === "contradicted")
    .map(fact => fact.text);
}

/**
 * 개선 필요 여부 판단
 * @param {Object} verifyScore - 앙상블 검증 점수
 * @param {Object} factCheckResult - 사실 검증 결과
 * @returns {boolean} 개선 필요 여부
 */
function needsRefinement(verifyScore, factCheckResult) {
  // 앙상블 점수가 임계값 이상이면 개선 불필요
  if (verifyScore && verifyScore.average >= REFINE_THRESHOLD) {
    return false;
  }

  // 팩트 체크 건너뛴 경우 (Early Exit)
  if (factCheckResult?.skipped) {
    return false;
  }

  // 사실 검증 점수 확인
  if (factCheckResult && factCheckResult.overallScore < 70) {
    return true;
  }

  // 앙상블 점수가 낮은 경우
  if (verifyScore && verifyScore.average < 70) {
    return true;
  }

  return false;
}

module.exports = {
  refineAnswer,
  refineByPattern,
  collectIssues,
  getUnverifiedFactsText,
  needsRefinement,
  REFINE_THRESHOLD
};
