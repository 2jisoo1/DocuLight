/**
 * Map-Reduce Summarization Node
 * @module services/chatbot/workflow/nodes/map-summarize
 *
 * Step 17: Multi-Document Summarization
 * 여러 문서를 그룹화하여 부분 요약 후 병합
 */

const { HumanMessage, AIMessage } = require("@langchain/core/messages");
const { estimateTokens, truncateToTokenLimit } = require("../../token-estimator");
const {
  MAP_SUMMARY_PROMPT,
  REDUCE_SUMMARY_PROMPT,
  SUMMARY_PROMPT_V2
} = require("../prompts");
const {
  buildTargetLengthSpec,
  buildFormatGuidelines,
  buildLengthConstraint
} = require("./analyze-request");

/**
 * 문서를 토큰 예산 기반으로 그룹화
 * @param {Array} documents - 검색된 문서 배열
 * @param {number} maxTokensPerGroup - 그룹당 최대 토큰 수
 * @returns {Array} 문서 그룹 배열
 */
function groupDocumentsByTokenBudget(documents, maxTokensPerGroup = 4000) {
  if (!documents || documents.length === 0) return [];

  const reservedForPrompt = 500; // 프롬프트용 토큰 예약
  const effectiveMax = maxTokensPerGroup - reservedForPrompt;

  const groups = [];
  let currentGroup = { id: 0, documents: [], tokenCount: 0, sources: [] };

  // 소스별로 정렬하여 같은 문서의 청크가 한 그룹에 있도록
  const sortedDocs = [...documents].sort((a, b) => {
    const sourceA = a.metadata?.source || "";
    const sourceB = b.metadata?.source || "";
    return sourceA.localeCompare(sourceB);
  });

  for (const doc of sortedDocs) {
    const docTokens = estimateTokens(doc.pageContent || "");
    const source = doc.metadata?.source || "unknown";

    // 단일 문서가 최대 토큰을 초과하면 별도 그룹으로
    if (docTokens > effectiveMax) {
      if (currentGroup.documents.length > 0) {
        groups.push(currentGroup);
        currentGroup = { id: groups.length, documents: [], tokenCount: 0, sources: [] };
      }
      // 문서 잘라내기
      const truncatedContent = truncateToTokenLimit(doc.pageContent, effectiveMax);
      groups.push({
        id: groups.length,
        documents: [{ ...doc, pageContent: truncatedContent }],
        tokenCount: estimateTokens(truncatedContent),
        sources: [source],
        truncated: true
      });
      continue;
    }

    // 현재 그룹에 추가하면 초과되는지 확인
    if (currentGroup.tokenCount + docTokens > effectiveMax && currentGroup.documents.length > 0) {
      groups.push(currentGroup);
      currentGroup = { id: groups.length, documents: [], tokenCount: 0, sources: [] };
    }

    currentGroup.documents.push(doc);
    currentGroup.tokenCount += docTokens;
    if (!currentGroup.sources.includes(source)) {
      currentGroup.sources.push(source);
    }
  }

  // 마지막 그룹 추가
  if (currentGroup.documents.length > 0) {
    groups.push(currentGroup);
  }

  return groups;
}

/**
 * Map 단계: 각 문서 그룹에 대한 부분 요약 생성
 * @param {Object} state - 워크플로우 상태
 * @param {Object} deps - 의존성
 * @returns {Promise<Object>} 업데이트된 상태
 */
async function mapSummarize(state, { llm, config = {} }) {
  const { retrievedDocs, summaryRequirements } = state;
  const maxTokensPerGroup = config.chatbot?.summarization?.maxTokensPerGroup || 4000;
  const maxParallelMaps = config.chatbot?.summarization?.maxParallelMaps || 3;

  // 문서 그룹화
  const groups = groupDocumentsByTokenBudget(retrievedDocs, maxTokensPerGroup);

  if (groups.length === 0) {
    return {
      partialSummaries: [],
      documentGroups: [],
      summarizationProgress: { current: 0, total: 0, phase: "no_docs" },
      currentStep: "mapSummarize"
    };
  }

  const totalGroups = groups.length;
  const format = summaryRequirements?.format || "auto";
  const focusAreas = summaryRequirements?.focusAreas?.join(", ") || "All relevant topics";
  const language = summaryRequirements?.language || "auto";

  // 부분 요약 생성 (병렬 처리)
  const partialSummaries = [];

  // 배치 단위로 처리
  for (let i = 0; i < groups.length; i += maxParallelMaps) {
    const batch = groups.slice(i, i + maxParallelMaps);

    const batchPromises = batch.map(async (group, batchIndex) => {
      const groupIndex = i + batchIndex;
      const content = group.documents
        .map(doc => doc.pageContent)
        .join("\n\n---\n\n");

      const sources = group.sources.join(", ");

      const prompt = MAP_SUMMARY_PROMPT
        .replace("{source}", sources)
        .replace("{content}", content)
        .replace("{format}", format)
        .replace("{focusAreas}", focusAreas)
        .replace("{language}", language)
        .replace("{partNumber}", String(groupIndex + 1))
        .replace("{totalParts}", String(totalGroups));

      try {
        const response = await llm.invoke([new HumanMessage(prompt)]);
        return {
          groupId: group.id,
          summary: response.content,
          sources: group.sources,
          tokenCount: group.tokenCount,
          success: true
        };
      } catch (error) {
        return {
          groupId: group.id,
          summary: `[Error summarizing group ${groupIndex + 1}]`,
          sources: group.sources,
          tokenCount: group.tokenCount,
          success: false,
          error: error.message
        };
      }
    });

    const batchResults = await Promise.all(batchPromises);
    partialSummaries.push(...batchResults);
  }

  return {
    partialSummaries,
    documentGroups: groups,
    summarizationProgress: {
      current: partialSummaries.length,
      total: totalGroups,
      phase: "map_complete"
    },
    currentStep: "mapSummarize"
  };
}

/**
 * Reduce 단계: 부분 요약을 최종 요약으로 병합
 * @param {Object} state - 워크플로우 상태
 * @param {Object} deps - 의존성
 * @returns {Promise<Object>} 업데이트된 상태
 */
async function reduceSummaries(state, { llm, config = {} }) {
  const { partialSummaries, summaryRequirements, messages } = state;

  // 부분 요약이 없으면 빈 응답
  if (!partialSummaries || partialSummaries.length === 0) {
    return {
      messages: [new AIMessage("No content available to summarize.")],
      summarizationProgress: { current: 0, total: 0, phase: "no_summaries" },
      currentStep: "reduceSummaries"
    };
  }

  // 성공한 요약만 수집
  const successfulSummaries = partialSummaries
    .filter(s => s.success)
    .map((s, i) => `### Part ${i + 1} (Sources: ${s.sources.join(", ")})\n${s.summary}`)
    .join("\n\n");

  if (!successfulSummaries) {
    return {
      messages: [new AIMessage("Failed to generate summaries from the documents.")],
      summarizationProgress: { current: 0, total: partialSummaries.length, phase: "all_failed" },
      currentStep: "reduceSummaries"
    };
  }

  // 요구사항 기반 프롬프트 구성
  const originalRequest = summaryRequirements?.originalRequest || "Summarize the documents";
  const targetLengthSpec = buildTargetLengthSpec(summaryRequirements);
  const formatSpec = summaryRequirements?.format || "auto";
  const focusAreas = summaryRequirements?.focusAreas?.join(", ") || "All relevant topics";
  const language = summaryRequirements?.language || "auto";
  const lengthConstraint = buildLengthConstraint(summaryRequirements);
  const formatGuidelines = buildFormatGuidelines(formatSpec);

  const prompt = REDUCE_SUMMARY_PROMPT
    .replace("{originalRequest}", originalRequest)
    .replace("{partialSummaries}", successfulSummaries)
    .replace("{targetLengthSpec}", targetLengthSpec)
    .replace("{formatSpec}", formatSpec)
    .replace("{focusAreas}", focusAreas)
    .replace("{language}", language)
    .replace("{lengthConstraint}", lengthConstraint)
    .replace("{formatGuidelines}", formatGuidelines);

  try {
    const response = await llm.invoke([new HumanMessage(prompt)]);

    // 길이 검증 및 재시도
    const validateLength = config.chatbot?.summarization?.validateLength ?? true;
    const maxRetries = config.chatbot?.summarization?.lengthValidationRetries ?? 2;

    let finalContent = response.content;

    if (validateLength && summaryRequirements?.targetLength) {
      finalContent = await validateAndRetry(
        finalContent,
        summaryRequirements,
        llm,
        maxRetries
      );
    }

    // 소스 정보 추가
    const allSources = [...new Set(partialSummaries.flatMap(s => s.sources))];
    const sourceSection = `\n\n---\n**Sources:** ${allSources.map(s => `\`${getFileName(s)}\``).join(", ")}`;

    return {
      messages: [new AIMessage(finalContent + sourceSection)],
      summarizationProgress: {
        current: partialSummaries.length,
        total: partialSummaries.length,
        phase: "complete"
      },
      currentStep: "reduceSummaries"
    };
  } catch (error) {
    return {
      messages: [new AIMessage(`Error generating final summary: ${error.message}`)],
      summarizationProgress: { current: 0, total: partialSummaries.length, phase: "reduce_failed" },
      currentStep: "reduceSummaries"
    };
  }
}

/**
 * 직접 요약 생성 (문서 수가 적을 때)
 * @param {Object} state - 워크플로우 상태
 * @param {Object} deps - 의존성
 * @returns {Promise<Object>} 업데이트된 상태
 */
async function generateSummary(state, { llm }) {
  const { retrievedDocs, summaryRequirements, messages } = state;

  // 마지막 사용자 메시지 추출
  const lastMessage = messages[messages.length - 1];
  const userQuestion = typeof lastMessage === "string"
    ? lastMessage
    : lastMessage.content;

  // 문서 없음
  if (!retrievedDocs || retrievedDocs.length === 0) {
    return {
      messages: [new AIMessage("No documents found to summarize. Please specify the topic or document you'd like summarized.")],
      currentStep: "generateSummary"
    };
  }

  // 컨텍스트 구성
  const context = retrievedDocs
    .map((doc, i) => {
      const source = doc.metadata?.source || "Unknown";
      return `[${i + 1}] Source: ${getFileName(source)}\n${doc.pageContent}`;
    })
    .join("\n\n---\n\n");

  // 요구사항 기반 프롬프트 구성
  const targetLengthSpec = buildTargetLengthSpec(summaryRequirements);
  const formatSpec = summaryRequirements?.format || "auto";
  const focusAreas = summaryRequirements?.focusAreas?.join(", ") || "All relevant topics";
  const language = summaryRequirements?.language || "auto";
  const lengthConstraint = buildLengthConstraint(summaryRequirements);
  const formatGuidelines = buildFormatGuidelines(formatSpec);

  const prompt = SUMMARY_PROMPT_V2
    .replace("{context}", context)
    .replace("{question}", userQuestion)
    .replace("{targetLengthSpec}", targetLengthSpec)
    .replace("{formatSpec}", formatSpec)
    .replace("{focusAreas}", focusAreas)
    .replace("{language}", language)
    .replace("{lengthConstraint}", lengthConstraint)
    .replace("{formatGuidelines}", formatGuidelines);

  try {
    const response = await llm.invoke([new HumanMessage(prompt)]);

    // 소스 정보 추가
    const allSources = [...new Set(retrievedDocs.map(d => d.metadata?.source).filter(Boolean))];
    const sourceSection = `\n\n---\n**Sources:** ${allSources.map(s => `\`${getFileName(s)}\``).join(", ")}`;

    return {
      messages: [new AIMessage(response.content + sourceSection)],
      currentStep: "generateSummary"
    };
  } catch (error) {
    return {
      messages: [new AIMessage(`Error generating summary: ${error.message}`)],
      currentStep: "generateSummary"
    };
  }
}

/**
 * 길이 검증 및 재시도
 * @param {string} summary - 현재 요약
 * @param {Object} requirements - 요구사항
 * @param {Object} llm - LLM 인스턴스
 * @param {number} maxRetries - 최대 재시도 횟수
 * @returns {Promise<string>} 검증된 요약
 */
async function validateAndRetry(summary, requirements, llm, maxRetries) {
  if (!requirements?.targetLength?.value || maxRetries <= 0) {
    return summary;
  }

  const { value, unit, constraint } = requirements.targetLength;

  // 현재 길이 측정
  const currentLength = unit === "characters"
    ? summary.length
    : summary.split(/\s+/).filter(w => w.length > 0).length;

  // 제약 조건 확인
  const meetsConstraint =
    (constraint === "minimum" && currentLength >= value) ||
    (constraint === "maximum" && currentLength <= value) ||
    (constraint === "approximate" && Math.abs(currentLength - value) < value * 0.2);

  if (meetsConstraint) {
    return summary;
  }

  // 재시도 프롬프트
  const action = constraint === "minimum" ? "expand" : "condense";
  const retryPrompt = `The following summary ${constraint === "minimum" ? "is too short" : "is too long"}.
Current length: ${currentLength} ${unit}
Required: ${constraint} ${value} ${unit}

Please ${action} the summary to meet the requirement while preserving key information:

${summary}

Generate the ${action === "expand" ? "expanded" : "condensed"} version:`;

  try {
    const response = await llm.invoke([new HumanMessage(retryPrompt)]);
    return validateAndRetry(response.content, requirements, llm, maxRetries - 1);
  } catch {
    return summary;
  }
}

/**
 * 파일 경로에서 파일 이름 추출
 * @param {string} path - 파일 경로
 * @returns {string} 파일 이름
 */
function getFileName(path) {
  if (!path) return "Unknown";
  return path.split(/[/\\]/).pop() || path;
}

/**
 * 요약 필요 여부에 따른 라우팅
 * @param {Object} state - 현재 상태
 * @param {Object} config - 설정
 * @returns {string} 다음 노드 이름
 */
function routeForSummarization(state, config = {}) {
  const { queryType, retrievedDocs } = state;

  // summary 쿼리 타입이 아니면 기본 generate로
  if (queryType !== "summary") {
    return "generateAnswer";
  }

  const threshold = config.chatbot?.summarization?.mapReduceThreshold ?? 5;
  const docCount = retrievedDocs?.length || 0;

  // 문서 수가 임계값 이하면 직접 요약
  if (docCount <= threshold) {
    return "generateSummary";
  }

  // 문서 수가 많으면 Map-Reduce
  return "mapSummarize";
}

module.exports = {
  groupDocumentsByTokenBudget,
  mapSummarize,
  reduceSummaries,
  generateSummary,
  routeForSummarization,
  validateAndRetry,
  getFileName
};
