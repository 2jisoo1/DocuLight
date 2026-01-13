/**
 * Chatbot Workflow Graph Builder
 * @module services/chatbot/workflow/graph
 *
 * LangGraph.js 기반 RAG 워크플로우 그래프 정의
 * Phase 4: MemorySaver 및 대화 요약 기능 추가
 */

const { StateGraph, START, END, MemorySaver } = require("@langchain/langgraph");
const { ChatbotAnnotation } = require("./state");
const { classifyQuery } = require("./nodes/classify");
const { retrieveDocs } = require("./nodes/retrieve");
const { generateAnswer, generateAnswerStream, generateWithLowRelevance, generateNoContext, fastGenerate } = require("./nodes/generate");
const { summarizeHistory, checkContextSize } = require("./nodes/summarize");
const { gradeDocuments, routeByRelevance } = require("./nodes/grade");
const { rewriteQuery } = require("./nodes/rewrite");
const { analyzeQuestion, planStrategy, executeSteps } = require("./nodes/thinking");
const { evaluateAnswer, routeByEvaluation } = require("./nodes/evaluate");
const { estimateTokens } = require("../token-estimator");
// Step 17: Multi-Document Summarization
const { analyzeRequest } = require("./nodes/analyze-request");
const { mapSummarize, reduceSummaries, generateSummary, routeForSummarization } = require("./nodes/map-summarize");
// Step 18: Query Contextualization
const { contextualizeQuery } = require("./nodes/contextualize");
// Step 19: Deep Document Reading (Thinking Mode)
const { evaluateSufficiency, deepReadDocument, routeByDeepRead } = require("./nodes/deep-read");

/**
 * 쿼리 타입별 라우팅 결정
 * @param {Object} state - 현재 상태
 * @returns {string} 다음 노드 이름
 */
function routeByQueryType(state) {
  switch (state.queryType) {
    case "question":
      // 질문은 문서 검색 후 답변
      return "retrieveDocs";
    case "summary":
      // Step 17: 요약은 요구사항 분석 후 문서 검색
      return "analyzeRequest";
    case "chitchat":
      // 잡담은 검색 없이 직접 응답
      return "generateAnswer";
    case "unknown":
    default:
      // 알 수 없는 경우 기본적으로 질문으로 처리
      return "retrieveDocs";
  }
}

/**
 * 컨텍스트 크기 기반 라우팅 결정
 * @param {Object} state - 현재 상태
 * @param {Object} config - 설정
 * @returns {string} 다음 노드 ("summarizeHistory" 또는 END)
 */
function routeByContextSize(state, config = {}) {
  const contextLength = config.chatbot?.llm?.contextLength || 128000;
  const threshold = config.chatbot?.context?.compressionThreshold || 0.7;
  const thresholdTokens = Math.floor(contextLength * threshold);

  const currentTokens = estimateTokens(state);

  if (currentTokens > thresholdTokens) {
    return "summarizeHistory";
  }

  return END;
}

/**
 * 챗봇 워크플로우 그래프 생성 (Phase 5: Advanced RAG 추가)
 * @param {Object} deps - 의존성
 * @param {Object} deps.llm - LLM 인스턴스
 * @param {Object} deps.retriever - VectorStore Retriever
 * @param {Object} deps.config - 설정 객체
 * @param {Object} deps.logger - 로거 (선택)
 * @param {Object} deps.checkpointer - 커스텀 체크포인터 (선택)
 * @returns {CompiledStateGraph} 컴파일된 워크플로우 그래프
 */
function createChatbotGraph({ llm, retriever, config = {}, logger, checkpointer }) {
  // 기본 MemorySaver 사용 (커스텀 체크포인터가 없는 경우)
  const memoryCheckpointer = checkpointer || new MemorySaver();

  // 노드 래퍼 함수들 (의존성 주입)

  // Step 18: Query Contextualization
  const contextualizeNode = async (state) => {
    logger?.debug("Executing contextualizeQuery node (Step 18)");
    return contextualizeQuery(state, { llm, logger });
  };

  const classifyNode = async (state) => {
    logger?.debug("Executing classifyQuery node");
    return classifyQuery(state, { llm });
  };

  const retrieveNode = async (state) => {
    logger?.debug("Executing retrieveDocs node");
    const k = config.chatbot?.rag?.retrievalCount || 20;
    return retrieveDocs(state, { retriever, k });
  };

  const gradeNode = async (state) => {
    logger?.debug("Executing gradeDocuments node");
    return gradeDocuments(state, { llm });
  };

  const rewriteNode = async (state) => {
    logger?.debug("Executing rewriteQuery node");
    return rewriteQuery(state, { llm });
  };

  const generateNode = async (state) => {
    logger?.debug("Executing generateAnswer node");
    return generateAnswer(state, { llm, config });
  };

  const generateLowRelevanceNode = async (state) => {
    logger?.debug("Executing generateWithLowRelevance node");
    return generateWithLowRelevance(state, { llm, config });
  };

  const generateNoContextNode = async (state) => {
    logger?.debug("Executing generateNoContext node");
    return generateNoContext(state, { llm, config });
  };

  const summarizeNode = async (state) => {
    logger?.debug("Executing summarizeHistory node");
    return summarizeHistory(state, { llm, config });
  };

  // Step 17: 요약 관련 노드
  const analyzeRequestNode = async (state) => {
    logger?.debug("Executing analyzeRequest node (Step 17)");
    return analyzeRequest(state, { llm });
  };

  const mapSummarizeNode = async (state) => {
    logger?.debug("Executing mapSummarize node (Step 17)");
    return mapSummarize(state, { llm, config });
  };

  const reduceSummariesNode = async (state) => {
    logger?.debug("Executing reduceSummaries node (Step 17)");
    return reduceSummaries(state, { llm, config });
  };

  const generateSummaryNode = async (state) => {
    logger?.debug("Executing generateSummary node (Step 17)");
    return generateSummary(state, { llm });
  };

  // 컨텍스트 크기 체크 함수 (config 바인딩)
  const contextSizeRouter = (state) => routeByContextSize(state, config);

  // 관련성 기반 라우팅 함수 (config 바인딩)
  const relevanceRouter = (state) => {
    const threshold = config.chatbot?.rag?.relevanceThreshold || 0.7;
    return routeByRelevance(state, threshold);
  };

  // Step 17: 요약 후 라우팅 (문서 수에 따라)
  const summaryRouter = (state) => {
    return routeForSummarization(state, config);
  };

  // 그래프 빌드
  const workflow = new StateGraph(ChatbotAnnotation)
    // 노드 추가
    .addNode("contextualizeQuery", contextualizeNode) // Step 18
    .addNode("classifyQuery", classifyNode)
    .addNode("retrieveDocs", retrieveNode)
    .addNode("gradeDocuments", gradeNode)
    .addNode("rewriteQuery", rewriteNode)
    .addNode("generateAnswer", generateNode)
    .addNode("generateWithLowRelevance", generateLowRelevanceNode)
    .addNode("generateNoContext", generateNoContextNode)
    .addNode("summarizeHistory", summarizeNode)
    // Step 17: 요약 관련 노드
    .addNode("analyzeRequest", analyzeRequestNode)
    .addNode("mapSummarize", mapSummarizeNode)
    .addNode("reduceSummaries", reduceSummariesNode)
    .addNode("generateSummary", generateSummaryNode)
    // 엣지 추가
    .addEdge(START, "contextualizeQuery") // Step 18: START → contextualizeQuery
    .addEdge("contextualizeQuery", "classifyQuery") // Step 18
    .addConditionalEdges("classifyQuery", routeByQueryType)
    .addEdge("retrieveDocs", "gradeDocuments")
    // Step 17: gradeDocuments 후 라우팅 (summary 타입 분기 포함)
    .addConditionalEdges("gradeDocuments", (state) => {
      // summary 타입이면 요약 라우터 사용
      if (state.queryType === "summary") {
        return summaryRouter(state);
      }
      return relevanceRouter(state);
    })
    .addEdge("rewriteQuery", "retrieveDocs")
    .addConditionalEdges("generateAnswer", contextSizeRouter)
    .addEdge("generateWithLowRelevance", END)
    .addEdge("generateNoContext", END)
    .addEdge("summarizeHistory", END)
    // Step 17: 요약 워크플로우 엣지
    .addEdge("analyzeRequest", "retrieveDocs")
    .addEdge("mapSummarize", "reduceSummaries")
    .addEdge("reduceSummaries", END)
    .addEdge("generateSummary", END);

  // MemorySaver와 함께 컴파일
  return workflow.compile({ checkpointer: memoryCheckpointer });
}

/**
 * 기본 챗봇 그래프 생성 (MemorySaver 없이)
 * 단순 질문-답변용
 * @param {Object} deps - 의존성
 * @returns {CompiledStateGraph} 컴파일된 워크플로우 그래프
 */
function createSimpleChatbotGraph({ llm, retriever, config = {}, logger }) {
  const classifyNode = async (state) => {
    logger?.debug("Executing classifyQuery node");
    return classifyQuery(state, { llm });
  };

  const retrieveNode = async (state) => {
    logger?.debug("Executing retrieveDocs node");
    const k = config.chatbot?.rag?.retrievalCount || 20;
    return retrieveDocs(state, { retriever, k });
  };

  const generateNode = async (state) => {
    logger?.debug("Executing generateAnswer node");
    return generateAnswer(state, { llm, config });
  };

  const workflow = new StateGraph(ChatbotAnnotation)
    .addNode("classifyQuery", classifyNode)
    .addNode("retrieveDocs", retrieveNode)
    .addNode("generateAnswer", generateNode)
    .addEdge(START, "classifyQuery")
    .addConditionalEdges("classifyQuery", routeByQueryType)
    .addEdge("retrieveDocs", "generateAnswer")
    .addEdge("generateAnswer", END);

  return workflow.compile();
}

/**
 * Self-Correcting RAG 그래프 생성 (Step 16)
 * Fast Path → Evaluate → RAG (필요시) → Evaluate → END
 *
 * @param {Object} deps - 의존성
 * @param {Object} deps.llm - LLM 인스턴스
 * @param {Object} deps.retriever - VectorStore Retriever
 * @param {Object} deps.config - 설정 객체
 * @param {Object} deps.logger - 로거 (선택)
 * @param {Object} deps.checkpointer - 커스텀 체크포인터 (선택)
 * @returns {CompiledStateGraph} 컴파일된 워크플로우 그래프
 */
function createSelfCorrectingGraph({ llm, retriever, config = {}, logger, checkpointer }) {
  const memoryCheckpointer = checkpointer || new MemorySaver();
  const selfCorrectionConfig = config.chatbot?.selfCorrection || {};
  const maxRetries = selfCorrectionConfig.maxRetries || 2;

  // 노드 래퍼 함수들

  // Step 18: Query Contextualization
  const contextualizeNode = async (state) => {
    logger?.debug("Executing contextualizeQuery node (Step 18)");
    return contextualizeQuery(state, { llm, logger });
  };

  const classifyNode = async (state) => {
    logger?.debug("Executing classifyQuery node");
    return classifyQuery(state, { llm });
  };

  const fastGenerateNode = async (state) => {
    logger?.debug("Executing fastGenerate node (Self-Correcting RAG)");
    return fastGenerate(state, { llm, config });
  };

  const evaluateNode = async (state) => {
    logger?.debug("Executing evaluateAnswer node (Self-Correcting RAG)");
    return evaluateAnswer(state, { llm });
  };

  const retrieveNode = async (state) => {
    logger?.debug("Executing retrieveDocs node");
    const k = config.chatbot?.rag?.retrievalCount || 20;
    // 재시도 횟수 증가
    const result = await retrieveDocs(state, { retriever, k });
    return {
      ...result,
      retryCount: (state.retryCount || 0) + 1,
    };
  };

  const gradeNode = async (state) => {
    logger?.debug("Executing gradeDocuments node");
    return gradeDocuments(state, { llm });
  };

  const rewriteNode = async (state) => {
    logger?.debug("Executing rewriteQuery node");
    return rewriteQuery(state, { llm });
  };

  const generateNode = async (state) => {
    logger?.debug("Executing generateAnswer node (with RAG)");
    return generateAnswer(state, { llm, config });
  };

  const generateLowRelevanceNode = async (state) => {
    logger?.debug("Executing generateWithLowRelevance node");
    return generateWithLowRelevance(state, { llm, config });
  };

  const generateNoContextNode = async (state) => {
    logger?.debug("Executing generateNoContext node");
    return generateNoContext(state, { llm, config });
  };

  const summarizeNode = async (state) => {
    logger?.debug("Executing summarizeHistory node");
    return summarizeHistory(state, { llm, config });
  };

  // Step 17: 요약 관련 노드
  const analyzeRequestNode = async (state) => {
    logger?.debug("Executing analyzeRequest node (Step 17)");
    return analyzeRequest(state, { llm });
  };

  const mapSummarizeNode = async (state) => {
    logger?.debug("Executing mapSummarize node (Step 17)");
    return mapSummarize(state, { llm, config });
  };

  const reduceSummariesNode = async (state) => {
    logger?.debug("Executing reduceSummaries node (Step 17)");
    return reduceSummaries(state, { llm, config });
  };

  const generateSummaryNode = async (state) => {
    logger?.debug("Executing generateSummary node (Step 17)");
    return generateSummary(state, { llm });
  };

  // 라우팅 함수들
  const contextSizeRouter = (state) => routeByContextSize(state, config);

  const relevanceRouter = (state) => {
    const threshold = config.chatbot?.rag?.relevanceThreshold || 0.7;
    return routeByRelevance(state, threshold);
  };

  // Step 17: 요약 후 라우팅 (문서 수에 따라)
  const summaryRouter = (state) => {
    return routeForSummarization(state, config);
  };

  // Self-Correction 평가 기반 라우팅
  const evaluationRouter = (state) => {
    const { answerQuality, usedRAG, retryCount = 0, queryType } = state;

    logger?.debug(`Evaluation router: quality=${answerQuality}, usedRAG=${usedRAG}, retryCount=${retryCount}, queryType=${queryType}`);

    // 최대 재시도 횟수 제한
    if (retryCount >= maxRetries) {
      logger?.debug("Max retries reached, ending workflow");
      return END;
    }

    // Step 17: summary 타입이고 needs_docs인 경우 analyzeRequest로 라우팅
    if (queryType === "summary" && (answerQuality === "needs_docs" || answerQuality === "hallucination")) {
      logger?.debug("Summary query needs documents, routing to analyzeRequest");
      return "analyzeRequest";
    }

    switch (answerQuality) {
      case "adequate":
        return END;

      case "needs_docs":
        if (!usedRAG) {
          // RAG 없이 답변했는데 문서 필요 → RAG로 재시도
          return "retrieveDocs";
        }
        // RAG 했는데도 부족 → 쿼리 재작성 후 재시도
        return "rewriteQuery";

      case "hallucination":
        // 근거 없는 답변 → 반드시 문서 검색
        return "retrieveDocs";

      case "off_topic":
        // 질문 이해 실패 → 재분류
        return "classifyQuery";

      default:
        return END;
    }
  };

  // 그래프 빌드
  const workflow = new StateGraph(ChatbotAnnotation)
    // 노드 추가
    .addNode("contextualizeQuery", contextualizeNode) // Step 18
    .addNode("classifyQuery", classifyNode)
    .addNode("fastGenerate", fastGenerateNode)
    .addNode("evaluateAnswer", evaluateNode)
    .addNode("retrieveDocs", retrieveNode)
    .addNode("gradeDocuments", gradeNode)
    .addNode("rewriteQuery", rewriteNode)
    .addNode("generateAnswer", generateNode)
    .addNode("generateWithLowRelevance", generateLowRelevanceNode)
    .addNode("generateNoContext", generateNoContextNode)
    .addNode("summarizeHistory", summarizeNode)
    // Step 17: 요약 관련 노드
    .addNode("analyzeRequest", analyzeRequestNode)
    .addNode("mapSummarize", mapSummarizeNode)
    .addNode("reduceSummaries", reduceSummariesNode)
    .addNode("generateSummary", generateSummaryNode)
    // 시작 → 맥락화 → 분류 (Step 18)
    .addEdge(START, "contextualizeQuery")
    .addEdge("contextualizeQuery", "classifyQuery")
    // 분류 후 → Fast Generate (모든 타입에 대해)
    .addEdge("classifyQuery", "fastGenerate")
    // Fast Generate 후 → 평가
    .addEdge("fastGenerate", "evaluateAnswer")
    // 평가 후 → 조건부 라우팅
    .addConditionalEdges("evaluateAnswer", evaluationRouter)
    // RAG 경로
    .addEdge("retrieveDocs", "gradeDocuments")
    // Step 17: gradeDocuments 후 라우팅 (summary 타입 분기 포함)
    .addConditionalEdges("gradeDocuments", (state) => {
      // summary 타입이면 요약 라우터 사용
      if (state.queryType === "summary") {
        return summaryRouter(state);
      }
      return relevanceRouter(state);
    })
    .addEdge("rewriteQuery", "retrieveDocs")
    // RAG 후 생성 → 평가
    .addEdge("generateAnswer", "evaluateAnswer")
    // Low relevance / No context → 종료
    .addEdge("generateWithLowRelevance", END)
    .addEdge("generateNoContext", END)
    .addEdge("summarizeHistory", END)
    // Step 17: 요약 워크플로우 엣지
    .addEdge("analyzeRequest", "retrieveDocs")
    .addEdge("mapSummarize", "reduceSummaries")
    .addEdge("reduceSummaries", END)
    .addEdge("generateSummary", END);

  return workflow.compile({ checkpointer: memoryCheckpointer });
}

/**
 * Thinking 모드 챗봇 그래프 생성 (Phase 6)
 * 복잡한 질문에 대해 Analyze → Plan → Execute 프로세스 수행
 * @param {Object} deps - 의존성
 * @param {Object} deps.llm - LLM 인스턴스
 * @param {Object} deps.retriever - VectorStore Retriever
 * @param {Object} deps.config - 설정 객체
 * @param {Object} deps.logger - 로거 (선택)
 * @param {Object} deps.checkpointer - 커스텀 체크포인터 (선택)
 * @returns {CompiledStateGraph} 컴파일된 워크플로우 그래프
 */
function createThinkingChatbotGraph({ llm, retriever, config = {}, logger, checkpointer }) {
  const memoryCheckpointer = checkpointer || new MemorySaver();

  // Step 18: Query Contextualization
  const contextualizeNode = async (state) => {
    logger?.debug("Executing contextualizeQuery node (Step 18)");
    return contextualizeQuery(state, { llm, logger });
  };

  // 기본 노드 래퍼
  const classifyNode = async (state) => {
    logger?.debug("Executing classifyQuery node");
    return classifyQuery(state, { llm });
  };

  const retrieveNode = async (state) => {
    logger?.debug("Executing retrieveDocs node");
    const k = config.chatbot?.rag?.retrievalCount || 20;
    return retrieveDocs(state, { retriever, k });
  };

  const gradeNode = async (state) => {
    logger?.debug("Executing gradeDocuments node");
    return gradeDocuments(state, { llm });
  };

  const rewriteNode = async (state) => {
    logger?.debug("Executing rewriteQuery node");
    return rewriteQuery(state, { llm });
  };

  // Thinking 모드 노드
  const analyzeNode = async (state) => {
    logger?.debug("Executing analyzeQuestion node (Thinking Mode)");
    return analyzeQuestion(state, { llm });
  };

  const planNode = async (state) => {
    logger?.debug("Executing planStrategy node (Thinking Mode)");
    return planStrategy(state, { llm });
  };

  const executeNode = async (state) => {
    logger?.debug("Executing executeSteps node (Thinking Mode)");
    return executeSteps(state, { llm, config });
  };

  // 일반 생성 노드
  const generateNode = async (state) => {
    logger?.debug("Executing generateAnswer node");
    return generateAnswer(state, { llm, config });
  };

  const generateLowRelevanceNode = async (state) => {
    logger?.debug("Executing generateWithLowRelevance node");
    return generateWithLowRelevance(state, { llm, config });
  };

  const generateNoContextNode = async (state) => {
    logger?.debug("Executing generateNoContext node");
    return generateNoContext(state, { llm, config });
  };

  const summarizeNode = async (state) => {
    logger?.debug("Executing summarizeHistory node");
    return summarizeHistory(state, { llm, config });
  };

  // Step 17: 요약 관련 노드
  const analyzeRequestNode = async (state) => {
    logger?.debug("Executing analyzeRequest node (Step 17)");
    return analyzeRequest(state, { llm });
  };

  const mapSummarizeNode = async (state) => {
    logger?.debug("Executing mapSummarize node (Step 17)");
    return mapSummarize(state, { llm, config });
  };

  const reduceSummariesNode = async (state) => {
    logger?.debug("Executing reduceSummaries node (Step 17)");
    return reduceSummaries(state, { llm, config });
  };

  const generateSummaryNode = async (state) => {
    logger?.debug("Executing generateSummary node (Step 17)");
    return generateSummary(state, { llm });
  };

  // Step 19: Deep Read 노드
  const evaluateSufficiencyNode = async (state) => {
    logger?.debug("Executing evaluateSufficiency node (Step 19)");
    return evaluateSufficiency(state, { llm, logger });
  };

  const deepReadNode = async (state) => {
    logger?.debug("Executing deepReadDocument node (Step 19)");
    return deepReadDocument(state, { llm, config, logger });
  };

  // 라우팅 함수
  const contextSizeRouter = (state) => routeByContextSize(state, config);

  const relevanceRouter = (state) => {
    const threshold = config.chatbot?.rag?.relevanceThreshold || 0.7;
    return routeByRelevance(state, threshold);
  };

  // Step 17: 요약 후 라우팅 (문서 수에 따라)
  const summaryRouter = (state) => {
    return routeForSummarization(state, config);
  };

  // Thinking 모드 분기 라우터
  const thinkingModeRouter = (state) => {
    if (state.thinkingMode) {
      return "analyzeQuestion";
    }
    return "generateAnswer";
  };

  // Step 19: Deep Read 라우팅 (Thinking 모드 전용)
  const deepReadRouter = (state) => {
    if (state.deepReadEnabled) {
      return "deepReadDocument";
    }
    // 컨텍스트 크기 체크 후 종료 또는 요약
    return contextSizeRouter(state);
  };

  // 그래프 빌드
  const workflow = new StateGraph(ChatbotAnnotation)
    // 기본 노드
    .addNode("contextualizeQuery", contextualizeNode) // Step 18
    .addNode("classifyQuery", classifyNode)
    .addNode("retrieveDocs", retrieveNode)
    .addNode("gradeDocuments", gradeNode)
    .addNode("rewriteQuery", rewriteNode)
    .addNode("generateAnswer", generateNode)
    .addNode("generateWithLowRelevance", generateLowRelevanceNode)
    .addNode("generateNoContext", generateNoContextNode)
    .addNode("summarizeHistory", summarizeNode)
    // Thinking 모드 노드
    .addNode("analyzeQuestion", analyzeNode)
    .addNode("planStrategy", planNode)
    .addNode("executeSteps", executeNode)
    // Step 17: 요약 관련 노드
    .addNode("analyzeRequest", analyzeRequestNode)
    .addNode("mapSummarize", mapSummarizeNode)
    .addNode("reduceSummaries", reduceSummariesNode)
    .addNode("generateSummary", generateSummaryNode)
    // Step 19: Deep Read 노드
    .addNode("evaluateSufficiency", evaluateSufficiencyNode)
    .addNode("deepReadDocument", deepReadNode)
    // 기본 엣지 (Step 18: START → contextualizeQuery → classifyQuery)
    .addEdge(START, "contextualizeQuery")
    .addEdge("contextualizeQuery", "classifyQuery")
    // Step 17: routeByQueryType에서 반환 가능한 모든 노드를 명시적으로 매핑
    .addConditionalEdges("classifyQuery", routeByQueryType, {
      retrieveDocs: "retrieveDocs",
      analyzeRequest: "analyzeRequest",
      generateAnswer: "generateAnswer",
    })
    .addEdge("retrieveDocs", "gradeDocuments")
    // Step 17 & 19: gradeDocuments 후 라우팅 (Thinking 모드 우선)
    .addConditionalEdges("gradeDocuments", (state) => {
      // summary 타입이면 요약 라우터 사용
      if (state.queryType === "summary") {
        return summaryRouter(state);
      }

      // Step 19: Thinking 모드가 활성화되어 있고 문서가 있으면 바로 Thinking 경로로
      // (저관련성이어도 Thinking 모드 사용)
      if (state.thinkingMode && state.retrievedDocs && state.retrievedDocs.length > 0) {
        logger?.debug("Thinking mode active with docs, routing to analyzeQuestion");
        return "analyzeQuestion";
      }

      const route = relevanceRouter(state);
      // generateAnswer로 가는 경우 thinking 모드 체크 (문서 없는 경우)
      if (route === "generateAnswer") {
        return state.thinkingMode ? "analyzeQuestion" : "generateAnswer";
      }
      return route;
    })
    .addEdge("rewriteQuery", "retrieveDocs")
    // Thinking 모드 엣지 (Step 19 수정: executeSteps → evaluateSufficiency)
    .addEdge("analyzeQuestion", "planStrategy")
    .addEdge("planStrategy", "executeSteps")
    .addEdge("executeSteps", "evaluateSufficiency") // Step 19: 충분성 평가
    .addConditionalEdges("evaluateSufficiency", deepReadRouter) // Step 19: Deep Read 라우팅
    .addConditionalEdges("deepReadDocument", contextSizeRouter) // Deep Read 후 종료
    // 일반 생성 엣지
    .addConditionalEdges("generateAnswer", contextSizeRouter)
    .addEdge("generateWithLowRelevance", END)
    .addEdge("generateNoContext", END)
    .addEdge("summarizeHistory", END)
    // Step 17: 요약 워크플로우 엣지
    .addEdge("analyzeRequest", "retrieveDocs")
    .addEdge("mapSummarize", "reduceSummaries")
    .addEdge("reduceSummaries", END)
    .addEdge("generateSummary", END);

  return workflow.compile({ checkpointer: memoryCheckpointer });
}

/**
 * 스트리밍 워크플로우 실행
 * @param {Object} graph - 컴파일된 그래프
 * @param {Object} input - 입력 상태
 * @param {Object} options - 옵션
 * @param {string} options.threadId - 세션 ID
 * @param {Function} options.onToken - 토큰 콜백
 * @returns {AsyncGenerator}
 */
async function* streamWorkflow(graph, input, options = {}) {
  const { threadId, onToken } = options;

  const streamConfig = {
    streamMode: "values",
  };

  // threadId가 있으면 configurable에 추가
  if (threadId) {
    streamConfig.configurable = { thread_id: threadId };
  }

  const stream = await graph.stream(input, streamConfig);

  for await (const state of stream) {
    if (state.messages && state.messages.length > 0) {
      const lastMessage = state.messages[state.messages.length - 1];
      if (lastMessage.content && onToken) {
        onToken(lastMessage.content);
      }
      yield state;
    }
  }
}

/**
 * 간단한 질문-답변 실행
 * @param {Object} graph - 컴파일된 그래프
 * @param {string} question - 사용자 질문
 * @param {string} threadId - 세션 ID (선택)
 * @returns {Promise<string>} AI 응답
 */
async function runSimpleQuery(graph, question, threadId) {
  const { HumanMessage } = require("@langchain/core/messages");

  const input = {
    messages: [new HumanMessage(question)],
  };

  const config = threadId
    ? { configurable: { thread_id: threadId } }
    : {};

  const result = await graph.invoke(input, config);

  // 마지막 AI 메시지 추출
  const messages = result.messages || [];
  const lastMessage = messages[messages.length - 1];

  return lastMessage?.content || "";
}

/**
 * 대화 세션 관리자
 * MemorySaver 기반 세션 상태 관리
 */
class ConversationManager {
  constructor(graph) {
    this.graph = graph;
    this.sessions = new Map();
  }

  /**
   * 새 세션 시작
   * @returns {string} 세션 ID
   */
  createSession() {
    const crypto = require('crypto');
    const sessionId = crypto.randomUUID();
    this.sessions.set(sessionId, { createdAt: new Date() });
    return sessionId;
  }

  /**
   * 세션으로 질문 보내기
   * @param {string} sessionId - 세션 ID
   * @param {string} question - 질문
   * @returns {Promise<string>} 응답
   */
  async chat(sessionId, question) {
    if (!this.sessions.has(sessionId)) {
      sessionId = this.createSession();
    }

    return runSimpleQuery(this.graph, question, sessionId);
  }

  /**
   * 세션 종료
   * @param {string} sessionId - 세션 ID
   */
  endSession(sessionId) {
    this.sessions.delete(sessionId);
  }

  /**
   * 활성 세션 수
   * @returns {number}
   */
  getActiveSessionCount() {
    return this.sessions.size;
  }
}

module.exports = {
  createChatbotGraph,
  createSimpleChatbotGraph,
  createThinkingChatbotGraph,
  createSelfCorrectingGraph,
  routeByQueryType,
  routeByContextSize,
  streamWorkflow,
  runSimpleQuery,
  ConversationManager
};
