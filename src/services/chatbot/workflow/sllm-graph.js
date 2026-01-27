/**
 * sLLM Thinking Mode Graph Builder
 * @module services/chatbot/workflow/sllm-graph
 *
 * Step 15.1: sLLM(1.2B) 최적화 Thinking Mode 워크플로우 그래프
 *
 * 워크플로우:
 * [Simple Path]
 * START → classifyQuestion + extractConcepts (병렬)
 *       → (if simple) retrieveDocs → answerSimple → ensembleVerify → (if score>=85) END
 *                                                                 → (if score<85) factVerify → refineAnswer → END
 *
 * [Complex Path]
 * START → classifyQuestion + extractConcepts (병렬)
 *       → (if complex) decomposeQuestion → retrieveDocs
 *       → answerSubquestion (순차) → synthesizeAnswers
 *       → ensembleVerify → (if score>=85) END
 *                       → (if score<85) factVerify → refineAnswer → END
 */

const { StateGraph, START, END, MemorySaver } = require("@langchain/langgraph");
const { ChatbotAnnotation } = require("./state");

// sLLM 노드 임포트
const { classifyQuestion } = require("./nodes/sllm/classify-question");
const { extractConcepts } = require("./nodes/sllm/extract-concepts");
const { decomposeQuestion } = require("./nodes/sllm/decompose-question");
const { answerAllSubquestions } = require("./nodes/sllm/answer-subquestion");
const { synthesizeAnswers } = require("./nodes/sllm/synthesize-answers");
const { answerSimple } = require("./nodes/sllm/answer-simple");
const { ensembleVerify, shouldEarlyExit } = require("./nodes/sllm/verify/ensemble-verify");
const { factVerify } = require("./nodes/sllm/verify/fact-verify");
const { refineAnswer } = require("./nodes/sllm/verify/refine-answer");

// 기존 노드 재사용
const { retrieveDocs } = require("./nodes/retrieve");
const { contextualizeQuery } = require("./nodes/contextualize");

/**
 * sLLM Thinking Mode 그래프 생성
 * @param {Object} deps - 의존성
 * @param {Object} deps.llm - sLLM 인스턴스 (1.2B-32B)
 * @param {Object} deps.retriever - VectorStore Retriever
 * @param {Object} deps.config - 설정 객체
 * @param {Object} deps.logger - 로거 (선택)
 * @param {Object} deps.checkpointer - 커스텀 체크포인터 (선택)
 * @returns {CompiledStateGraph} 컴파일된 워크플로우 그래프
 */
function createSllmThinkingGraph({ llm, retriever, config = {}, logger, checkpointer }) {
  const memoryCheckpointer = checkpointer || new MemorySaver();
  const sllmConfig = config.chatbot?.sllm || {};

  // === 노드 래퍼 함수들 ===

  // Step 18: Query Contextualization (기존 노드 재사용)
  const contextualizeNode = async (state) => {
    logger?.debug("[sLLM Graph] Executing contextualizeQuery node");
    return contextualizeQuery(state, { llm, logger });
  };

  // Phase 1: 질문 분류 (CLASSIFY + EXTRACT 병렬 처리를 위한 준비)
  const classifyNode = async (state) => {
    logger?.debug("[sLLM Graph] Executing classifyQuestion node");
    const result = await classifyQuestion(state, { llm, logger });
    return {
      ...result,
      sllmThinkingEnabled: true
    };
  };

  const extractNode = async (state) => {
    logger?.debug("[sLLM Graph] Executing extractConcepts node");
    return extractConcepts(state, { llm, logger });
  };

  // Phase 1: 병렬 처리 노드 (classify + extract 동시 실행)
  const parallelAnalyzeNode = async (state) => {
    logger?.debug("[sLLM Graph] Executing parallel analyze (classify + extract)");
    const startTime = Date.now();

    const [classifyResult, extractResult] = await Promise.all([
      classifyQuestion(state, { llm, logger }),
      extractConcepts(state, { llm, logger })
    ]);

    const duration = Date.now() - startTime;
    logger?.debug(`[sLLM Graph] Parallel analyze completed in ${duration}ms`);

    return {
      ...classifyResult,
      ...extractResult,
      sllmThinkingEnabled: true
    };
  };

  // Phase 2: 질문 분해 (복잡한 질문용)
  const decomposeNode = async (state) => {
    logger?.debug("[sLLM Graph] Executing decomposeQuestion node");
    return decomposeQuestion(state, { llm, logger });
  };

  // 기존 노드: 문서 검색
  const retrieveNode = async (state) => {
    logger?.debug("[sLLM Graph] Executing retrieveDocs node");
    const k = config.chatbot?.rag?.retrievalCount || 10;
    return retrieveDocs(state, { retriever, k });
  };

  // Phase 3: 하위 질문 답변 (순차 처리)
  const answerSubquestionsNode = async (state) => {
    logger?.debug("[sLLM Graph] Executing answerAllSubquestions node");
    return answerAllSubquestions(state, { llm, logger });
  };

  // Phase 3: 답변 합성
  const synthesizeNode = async (state) => {
    logger?.debug("[sLLM Graph] Executing synthesizeAnswers node");
    return synthesizeAnswers(state, { llm, logger });
  };

  // Phase 3: 단순 질문 답변
  const answerSimpleNode = async (state) => {
    logger?.debug("[sLLM Graph] Executing answerSimple node");
    return answerSimple(state, { llm, logger });
  };

  // Phase 4: 앙상블 검증
  const ensembleVerifyNode = async (state) => {
    logger?.debug("[sLLM Graph] Executing ensembleVerify node");
    return ensembleVerify(state, { llm, logger });
  };

  // Phase 4: 사실 검증
  const factVerifyNode = async (state) => {
    logger?.debug("[sLLM Graph] Executing factVerify node");
    return factVerify(state, { llm, logger });
  };

  // Phase 4: 답변 개선
  const refineAnswerNode = async (state) => {
    logger?.debug("[sLLM Graph] Executing refineAnswer node");
    return refineAnswer(state, { llm, logger });
  };

  // 최종 답변 설정 노드
  const setFinalAnswerNode = async (state) => {
    logger?.debug("[sLLM Graph] Setting final answer");
    const finalAnswer = state.sllmRefinedAnswer ||
                        state.sllmSynthesizedAnswer ||
                        state.sllmSimpleAnswer ||
                        "";

    return {
      sllmFinalAnswer: finalAnswer,
      currentStep: "sllm:complete"
    };
  };

  // === 라우팅 함수들 ===

  /**
   * 질문 타입별 라우팅
   * @param {Object} state - 현재 상태
   * @returns {string} 다음 노드
   */
  function routeByQuestionType(state) {
    const { queryType, confidence } = state;

    logger?.debug(`[sLLM Graph] routeByQuestionType: type=${queryType}, confidence=${confidence}`);

    if (queryType === "complex") {
      return "decomposeQuestion";
    }

    // simple 또는 unknown
    return "retrieveForSimple";
  }

  /**
   * Early Exit 라우팅
   * @param {Object} state - 현재 상태
   * @returns {string} 다음 노드 또는 END
   */
  function routeByVerifyScore(state) {
    const { sllmVerifyScore } = state;

    if (shouldEarlyExit(sllmVerifyScore)) {
      logger?.debug(`[sLLM Graph] Early exit: score=${sllmVerifyScore?.average}`);
      return "setFinalAnswer";
    }

    logger?.debug(`[sLLM Graph] Need fact verification: score=${sllmVerifyScore?.average}`);
    return "factVerify";
  }

  // === 그래프 빌드 ===
  const workflow = new StateGraph(ChatbotAnnotation)
    // 노드 추가
    .addNode("contextualizeQuery", contextualizeNode)
    .addNode("parallelAnalyze", parallelAnalyzeNode)
    .addNode("decomposeQuestion", decomposeNode)
    .addNode("retrieveForSimple", retrieveNode)
    .addNode("retrieveForComplex", retrieveNode)
    .addNode("answerSimple", answerSimpleNode)
    .addNode("answerSubquestions", answerSubquestionsNode)
    .addNode("synthesizeAnswers", synthesizeNode)
    .addNode("ensembleVerify", ensembleVerifyNode)
    .addNode("factVerify", factVerifyNode)
    .addNode("refineAnswer", refineAnswerNode)
    .addNode("setFinalAnswer", setFinalAnswerNode)

    // 엣지 추가
    // START → contextualizeQuery → parallelAnalyze
    .addEdge(START, "contextualizeQuery")
    .addEdge("contextualizeQuery", "parallelAnalyze")

    // parallelAnalyze → 조건부 라우팅 (simple vs complex)
    .addConditionalEdges("parallelAnalyze", routeByQuestionType, {
      "decomposeQuestion": "decomposeQuestion",
      "retrieveForSimple": "retrieveForSimple"
    })

    // Simple Path: retrieve → answer → verify
    .addEdge("retrieveForSimple", "answerSimple")
    .addEdge("answerSimple", "ensembleVerify")

    // Complex Path: decompose → retrieve → answer subquestions → synthesize → verify
    .addEdge("decomposeQuestion", "retrieveForComplex")
    .addEdge("retrieveForComplex", "answerSubquestions")
    .addEdge("answerSubquestions", "synthesizeAnswers")
    .addEdge("synthesizeAnswers", "ensembleVerify")

    // Verification Path: ensembleVerify → Early Exit or factVerify
    .addConditionalEdges("ensembleVerify", routeByVerifyScore, {
      "setFinalAnswer": "setFinalAnswer",
      "factVerify": "factVerify"
    })

    // factVerify → refineAnswer → setFinalAnswer → END
    .addEdge("factVerify", "refineAnswer")
    .addEdge("refineAnswer", "setFinalAnswer")
    .addEdge("setFinalAnswer", END);

  // MemorySaver와 함께 컴파일
  return workflow.compile({ checkpointer: memoryCheckpointer });
}

/**
 * 간단한 sLLM 그래프 생성 (검증 없이 빠른 응답)
 * @param {Object} deps - 의존성
 * @returns {CompiledStateGraph} 컴파일된 워크플로우 그래프
 */
function createSimpleSllmGraph({ llm, retriever, config = {}, logger }) {
  const classifyNode = async (state) => {
    return classifyQuestion(state, { llm, logger });
  };

  const retrieveNode = async (state) => {
    const k = config.chatbot?.rag?.retrievalCount || 10;
    return retrieveDocs(state, { retriever, k });
  };

  const answerNode = async (state) => {
    return answerSimple(state, { llm, logger });
  };

  const workflow = new StateGraph(ChatbotAnnotation)
    .addNode("classifyQuestion", classifyNode)
    .addNode("retrieveDocs", retrieveNode)
    .addNode("answerSimple", answerNode)
    .addEdge(START, "classifyQuestion")
    .addEdge("classifyQuestion", "retrieveDocs")
    .addEdge("retrieveDocs", "answerSimple")
    .addEdge("answerSimple", END);

  return workflow.compile();
}

/**
 * sLLM Thinking Mode 실행
 * @param {Object} graph - 컴파일된 그래프
 * @param {string} question - 사용자 질문
 * @param {string} threadId - 세션 ID (선택)
 * @returns {Promise<Object>} 실행 결과
 */
async function runSllmThinking(graph, question, threadId) {
  const { HumanMessage } = require("@langchain/core/messages");

  const input = {
    messages: [new HumanMessage(question)],
    sllmThinkingEnabled: true
  };

  const config = threadId
    ? { configurable: { thread_id: threadId } }
    : {};

  const result = await graph.invoke(input, config);

  return {
    answer: result.sllmFinalAnswer || "",
    queryType: result.queryType,
    confidence: result.confidence,
    verifyScore: result.sllmVerifyScore,
    factCheckResult: result.sllmFactCheckResult,
    extractedConcepts: result.sllmExtractedConcepts,
    subQuestions: result.sllmSubQuestions,
    subAnswers: result.sllmSubAnswers
  };
}

/**
 * sLLM 스트리밍 워크플로우 실행
 * @param {Object} graph - 컴파일된 그래프
 * @param {string} question - 사용자 질문
 * @param {Object} options - 옵션
 * @returns {AsyncGenerator}
 */
async function* streamSllmThinking(graph, question, options = {}) {
  const { HumanMessage } = require("@langchain/core/messages");
  const { threadId, onStep } = options;

  const input = {
    messages: [new HumanMessage(question)],
    sllmThinkingEnabled: true
  };

  const streamConfig = {
    streamMode: "values",
  };

  if (threadId) {
    streamConfig.configurable = { thread_id: threadId };
  }

  const stream = await graph.stream(input, streamConfig);

  for await (const state of stream) {
    if (onStep && state.currentStep) {
      onStep(state.currentStep);
    }
    yield state;
  }
}

module.exports = {
  createSllmThinkingGraph,
  createSimpleSllmGraph,
  runSllmThinking,
  streamSllmThinking
};
