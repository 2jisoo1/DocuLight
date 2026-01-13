/**
 * Deep Document Reading Node
 * @module services/chatbot/workflow/nodes/deep-read
 *
 * Step 19: Thinking Mode 전용 Deep Document Reading
 * 답변이 부족할 때 전체 문서를 섹션별로 읽어 포괄적 답변 생성
 */

const { z } = require("zod");
const fs = require("fs").promises;
const path = require("path");
const { AIMessage } = require("@langchain/core/messages");
const {
  EVALUATE_SUFFICIENCY_PROMPT,
  DEEP_READ_SECTION_PROMPT,
  DEEP_READ_SYNTHESIZE_PROMPT
} = require("../prompts");

/**
 * 충분성 평가 스키마
 */
const sufficiencySchema = z.object({
  isSufficient: z.boolean(),
  reason: z.string(),
  missingAspects: z.array(z.string()),
  confidence: z.number().min(0).max(1)
});

/**
 * 섹션 분석 스키마
 */
const sectionAnalysisSchema = z.object({
  hasRelevantContent: z.boolean(),
  extractedContent: z.string(),
  codeExamples: z.array(z.string()),
  keyPoints: z.array(z.string())
});

/**
 * 답변 충분성 평가 노드
 * 생성된 답변이 사용자 질문을 충분히 만족하는지 평가
 *
 * @param {Object} state - 워크플로우 상태
 * @param {Object} deps - 의존성
 * @param {Object} deps.llm - LLM 인스턴스
 * @param {Object} deps.logger - 로거 (선택)
 * @returns {Promise<Object>} 업데이트된 상태
 */
async function evaluateSufficiency(state, { llm, logger }) {
  const { messages, thinkingMode, deepReadAttempts = 0 } = state;

  // Thinking 모드가 아니거나 이미 Deep Read 시도했으면 스킵
  if (!thinkingMode || deepReadAttempts >= 1) {
    logger?.debug("[evaluateSufficiency] Skipping: not thinking mode or already attempted");
    return {
      currentStep: "evaluateSufficiency",
      deepReadEnabled: false
    };
  }

  // 메시지가 2개 미만이면 평가 불필요
  if (!messages || messages.length < 2) {
    return {
      currentStep: "evaluateSufficiency",
      deepReadEnabled: false
    };
  }

  // 마지막 AI 응답 추출
  const lastMessage = messages[messages.length - 1];
  const response = typeof lastMessage === "string"
    ? lastMessage
    : lastMessage.content;

  // 사용자 질문 찾기
  let question = "";
  for (let i = messages.length - 2; i >= 0; i--) {
    const msg = messages[i];
    const type = msg._getType?.() || msg.constructor?.name || "";
    if (type === "human" || type === "HumanMessage") {
      question = typeof msg === "string" ? msg : msg.content;
      break;
    }
  }

  if (!question || !response) {
    return {
      currentStep: "evaluateSufficiency",
      deepReadEnabled: false
    };
  }

  try {
    const structuredLLM = llm.withStructuredOutput(sufficiencySchema);

    const prompt = EVALUATE_SUFFICIENCY_PROMPT
      .replace("{question}", question)
      .replace("{response}", response);

    const result = await structuredLLM.invoke(prompt);

    logger?.info(`[evaluateSufficiency] isSufficient=${result.isSufficient}, reason=${result.reason}`);

    // 충분하면 Deep Read 불필요
    if (result.isSufficient) {
      return {
        currentStep: "evaluateSufficiency",
        deepReadEnabled: false,
        sufficiencyEvaluation: result
      };
    }

    // 부족하면 Deep Read 활성화
    return {
      currentStep: "evaluateSufficiency",
      deepReadEnabled: true,
      sufficiencyEvaluation: result,
      deepReadAttempts: deepReadAttempts + 1
    };

  } catch (error) {
    logger?.error("[evaluateSufficiency] Error:", error.message);
    // 오류 시 휴리스틱으로 폴백
    return evaluateSufficiencyByHeuristics(question, response, deepReadAttempts, logger);
  }
}

/**
 * 휴리스틱 기반 충분성 평가 (폴백)
 * @private
 */
function evaluateSufficiencyByHeuristics(question, response, deepReadAttempts, logger) {
  const lowerQuestion = question.toLowerCase();
  const lowerResponse = response.toLowerCase();

  // 코드/예제 요청인데 코드 블록이 없으면 부족
  const asksForCode = /예제|example|코드|code|샘플|sample|how to|방법/i.test(question);
  const hasCodeBlock = /```[\s\S]*```/.test(response);

  if (asksForCode && !hasCodeBlock) {
    logger?.debug("[evaluateSufficiency] Heuristic: code requested but no code block found");
    return {
      currentStep: "evaluateSufficiency",
      deepReadEnabled: true,
      sufficiencyEvaluation: {
        isSufficient: false,
        reason: "Code/example requested but no code block in response",
        missingAspects: ["code examples"],
        confidence: 0.8
      },
      deepReadAttempts: deepReadAttempts + 1
    };
  }

  // "정보가 없다", "찾을 수 없다" 등의 표현이 있으면 부족
  const uncertainPhrases = [
    "정보가 없", "찾을 수 없", "제공되지 않", "포함되어 있지 않",
    "문서에서 찾을", "no information", "couldn't find", "not available",
    "문서에 없", "not found in", "추가적인 정보", "더 자세한"
  ];

  if (uncertainPhrases.some(phrase => lowerResponse.includes(phrase))) {
    logger?.debug("[evaluateSufficiency] Heuristic: response indicates uncertainty");
    return {
      currentStep: "evaluateSufficiency",
      deepReadEnabled: true,
      sufficiencyEvaluation: {
        isSufficient: false,
        reason: "Response indicates missing information",
        missingAspects: ["specific details"],
        confidence: 0.7
      },
      deepReadAttempts: deepReadAttempts + 1
    };
  }

  // 기본적으로 충분
  return {
    currentStep: "evaluateSufficiency",
    deepReadEnabled: false,
    sufficiencyEvaluation: {
      isSufficient: true,
      reason: "Response appears adequate by heuristics",
      missingAspects: [],
      confidence: 0.6
    }
  };
}

/**
 * Deep Document Reading 노드
 * 가장 관련성 높은 문서를 전체 읽어 섹션별로 분석
 *
 * @param {Object} state - 워크플로우 상태
 * @param {Object} deps - 의존성
 * @param {Object} deps.llm - LLM 인스턴스
 * @param {Object} deps.config - 설정 객체
 * @param {Object} deps.logger - 로거 (선택)
 * @returns {Promise<Object>} 업데이트된 상태
 */
async function deepReadDocument(state, { llm, config, logger }) {
  const {
    messages,
    retrievedDocs,
    deepReadEnabled,
    sufficiencyEvaluation
  } = state;

  // Deep Read가 활성화되지 않았으면 스킵
  if (!deepReadEnabled) {
    logger?.debug("[deepReadDocument] Skipping: not enabled");
    return { currentStep: "deepReadDocument" };
  }

  // 검색된 문서가 없으면 스킵
  if (!retrievedDocs || retrievedDocs.length === 0) {
    logger?.debug("[deepReadDocument] Skipping: no retrieved docs");
    return {
      currentStep: "deepReadDocument",
      deepReadEnabled: false
    };
  }

  // 사용자 질문 추출
  let question = "";
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const type = msg._getType?.() || msg.constructor?.name || "";
    if (type === "human" || type === "HumanMessage") {
      question = typeof msg === "string" ? msg : msg.content;
      break;
    }
  }

  if (!question) {
    return {
      currentStep: "deepReadDocument",
      deepReadEnabled: false
    };
  }

  // 가장 관련성 높은 문서 선택 (첫 번째 문서가 가장 높은 점수)
  const topDoc = retrievedDocs[0];
  const docPath = topDoc.metadata?.source || topDoc.metadata?.filePath;

  if (!docPath) {
    logger?.warn("[deepReadDocument] No source path in top document");
    return {
      currentStep: "deepReadDocument",
      deepReadEnabled: false
    };
  }

  logger?.info(`[deepReadDocument] Reading full document: ${docPath}`);

  try {
    // 전체 문서 읽기
    const fullContent = await fs.readFile(docPath, "utf-8");

    // 문서를 섹션으로 분할 (마크다운 헤딩 기준)
    const sections = splitIntoSections(fullContent);
    logger?.info(`[deepReadDocument] Document split into ${sections.length} sections`);

    // 각 섹션 분석
    const missingAspects = sufficiencyEvaluation?.missingAspects?.join(", ") || "specific details, code examples";
    const extractions = [];

    const structuredLLM = llm.withStructuredOutput(sectionAnalysisSchema);

    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];

      // 섹션이 너무 작으면 스킵
      if (section.content.trim().length < 50) continue;

      try {
        const prompt = DEEP_READ_SECTION_PROMPT
          .replace("{question}", question)
          .replace("{missingAspects}", missingAspects)
          .replace("{sectionNumber}", String(i + 1))
          .replace("{totalSections}", String(sections.length))
          .replace("{source}", path.basename(docPath))
          .replace("{content}", section.content.substring(0, 4000)); // 섹션 크기 제한

        const result = await structuredLLM.invoke(prompt);

        if (result.hasRelevantContent) {
          extractions.push({
            sectionTitle: section.title,
            ...result
          });
          logger?.debug(`[deepReadDocument] Section ${i + 1} has relevant content`);
        }
      } catch (err) {
        logger?.warn(`[deepReadDocument] Error analyzing section ${i + 1}:`, err.message);
      }
    }

    // 추출된 내용이 없으면 원본 응답 유지
    if (extractions.length === 0) {
      logger?.info("[deepReadDocument] No relevant content extracted");
      return {
        currentStep: "deepReadDocument",
        deepReadEnabled: false,
        deepReadExtractions: []
      };
    }

    // 추출된 내용을 종합하여 최종 답변 생성
    const extractedInfo = formatExtractions(extractions);

    const synthesizePrompt = DEEP_READ_SYNTHESIZE_PROMPT
      .replace("{question}", question)
      .replace("{extractedInfo}", extractedInfo)
      .replace("{source}", path.basename(docPath));

    const finalResponse = await llm.invoke(synthesizePrompt);
    const responseText = typeof finalResponse === "string"
      ? finalResponse
      : finalResponse.content;

    logger?.info("[deepReadDocument] Generated comprehensive response from deep read");

    // 새 AI 메시지로 교체
    const newMessages = [
      ...messages.slice(0, -1), // 기존 AI 응답 제거
      new AIMessage(responseText)
    ];

    return {
      messages: newMessages,
      currentStep: "deepReadDocument",
      deepReadEnabled: false,
      deepReadExtractions: extractions,
      deepReadDocumentPath: docPath
    };

  } catch (error) {
    logger?.error("[deepReadDocument] Error reading document:", error.message);
    return {
      currentStep: "deepReadDocument",
      deepReadEnabled: false,
      error: `Deep read failed: ${error.message}`
    };
  }
}

/**
 * 마크다운 문서를 섹션으로 분할
 * @private
 */
function splitIntoSections(content) {
  const lines = content.split("\n");
  const sections = [];
  let currentSection = { title: "Introduction", content: "" };

  for (const line of lines) {
    // 헤딩 감지 (# ~ ######)
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

    if (headingMatch) {
      // 이전 섹션 저장
      if (currentSection.content.trim()) {
        sections.push({ ...currentSection });
      }
      // 새 섹션 시작
      currentSection = {
        title: headingMatch[2],
        level: headingMatch[1].length,
        content: line + "\n"
      };
    } else {
      currentSection.content += line + "\n";
    }
  }

  // 마지막 섹션 저장
  if (currentSection.content.trim()) {
    sections.push(currentSection);
  }

  return sections;
}

/**
 * 추출된 정보를 포맷팅
 * @private
 */
function formatExtractions(extractions) {
  return extractions.map((ext, i) => {
    let formatted = `### Section: ${ext.sectionTitle}\n`;
    formatted += ext.extractedContent + "\n";

    if (ext.codeExamples && ext.codeExamples.length > 0) {
      formatted += "\n**Code Examples:**\n";
      ext.codeExamples.forEach(code => {
        formatted += "```\n" + code + "\n```\n";
      });
    }

    if (ext.keyPoints && ext.keyPoints.length > 0) {
      formatted += "\n**Key Points:**\n";
      ext.keyPoints.forEach(point => {
        formatted += `- ${point}\n`;
      });
    }

    return formatted;
  }).join("\n---\n");
}

/**
 * Deep Read 라우팅 결정
 * @param {Object} state - 현재 상태
 * @returns {string} 다음 노드 이름
 */
function routeByDeepRead(state) {
  if (state.deepReadEnabled) {
    return "deepReadDocument";
  }
  return "__end__";
}

module.exports = {
  evaluateSufficiency,
  deepReadDocument,
  routeByDeepRead,
  sufficiencySchema,
  sectionAnalysisSchema
};
