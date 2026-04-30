/**
 * Chatbot Service
 * @module services/chatbot/chatbot-service
 *
 * Phase 7: 챗봇 서비스 통합 모듈
 * LLM, Embedding, VectorStore, Workflow 통합
 */

const crypto = require("crypto");
const AsyncLock = require("async-lock");
const { HumanMessage, AIMessage } = require("@langchain/core/messages");
const { createLLM } = require("./llm-factory");
const { createEmbeddings } = require("./embedding-factory");
const { VectorStoreManager } = require("./vector-store");
const { DocWatcher } = require("./doc-watcher");
const {
  createChatbotGraph,
  createThinkingChatbotGraph,
  createSelfCorrectingGraph,
  ConversationManager
} = require("./workflow");
const { createAgenticGraph } = require("./workflow/agentic-graph");
const { buildAgenticTools } = require("./agentic-tools");

/**
 * 챗봇 서비스 클래스
 * 모든 챗봇 관련 기능을 통합 관리
 */
class ChatbotService {
  /**
   * @param {Object} config - 설정 객체
   * @param {Object} logger - 로거 인스턴스
   */
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;

    // 컴포넌트 초기화 상태
    this.llm = null;
    this.embeddings = null;
    this.vectorStoreManager = null;
    this.graph = null;
    this.thinkingGraph = null;
    this.selfCorrectingGraph = null;  // Step 16: Self-Correcting RAG
    this.agenticGraph = null;         // FR-14: Feature Flag B — Agentic graph
    this.docWatcher = null;

    // 세션 관리
    this.sessions = new Map();
    this.conversationManager = null;

    // 동시성 제어를 위한 락 (90초 타임아웃)
    this.sessionLock = new AsyncLock({ timeout: 90000 });

    // 상태
    this.isInitialized = false;
    this.lastUpdated = null;
  }

  /**
   * 서비스 초기화
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.isInitialized) {
      this.logger?.warn("ChatbotService already initialized");
      return;
    }

    const chatbotConfig = this.config.chatbot;

    if (!chatbotConfig || !chatbotConfig.llm || !chatbotConfig.embedding) {
      throw new Error("Chatbot configuration is missing or incomplete");
    }

    try {
      this.logger?.info("Initializing ChatbotService...");

      // 1. LLM 초기화
      this.logger?.debug("Creating LLM instance...");
      this.llm = createLLM(chatbotConfig.llm);

      // 2. Embeddings 초기화
      this.logger?.debug("Creating Embeddings instance...");
      this.embeddings = createEmbeddings(chatbotConfig.embedding);

      // 3. VectorStore 초기화
      this.logger?.debug("Initializing VectorStore...");
      this.vectorStoreManager = new VectorStoreManager(
        this.embeddings,
        chatbotConfig.rag,
        {
          logger: this.logger,
          embeddingConfig: chatbotConfig.embedding,
          docsRoot: this.config.docsRoot
        }
      );
      await this.vectorStoreManager.initialize();

      // 3.5. 기존 문서 로드
      if (this.config.docsRoot) {
        this.logger?.debug("Loading existing documents...");
        await this.loadExistingDocuments(this.config.docsRoot);
      }

      // 4. Document Watcher 초기화 (선택적)
      if (this.config.docsRoot) {
        this.logger?.debug("Starting DocWatcher...");
        this.docWatcher = new DocWatcher(this.config.docsRoot, {
          debounceMs: 1000,
          excludePatterns: this.config.excludes || [],
          logger: this.logger
        });

        this.docWatcher.on("add", (path) => this.handleDocumentAdd(path));
        this.docWatcher.on("change", (path) => this.handleDocumentChange(path));
        this.docWatcher.on("remove", (path) => this.handleDocumentRemove(path));

        // DocWatcher 시작
        this.docWatcher.start();
      }

      // 5. 워크플로우 그래프 생성
      this.logger?.debug("Creating workflow graphs...");
      const retriever = this.vectorStoreManager.getRetriever(
        chatbotConfig.rag?.retrievalCount || 20,
        chatbotConfig.rag?.minSimilarityScore || 0.3  // 기본값 0.3
      );

      this.graph = createChatbotGraph({
        llm: this.llm,
        retriever,
        config: this.config,
        logger: this.logger
      });

      this.thinkingGraph = createThinkingChatbotGraph({
        llm: this.llm,
        retriever,
        config: this.config,
        logger: this.logger
      });

      // 5.5 Self-Correcting RAG 그래프 생성 (Step 16)
      const selfCorrectionEnabled = chatbotConfig.selfCorrection?.enabled !== false;
      if (selfCorrectionEnabled) {
        this.logger?.debug("Creating Self-Correcting RAG graph...");
        this.selfCorrectingGraph = createSelfCorrectingGraph({
          llm: this.llm,
          retriever,
          config: this.config,
          logger: this.logger
        });
      }

      // 5.6 Agentic 그래프 생성 (FR-14: agenticMode=B)
      // warnOnAuto=true: 'auto' 폴백 경고는 부팅 시 1회만 emit
      const agenticMode = this._resolveAgenticMode(chatbotConfig.agenticMode, true);
      if (agenticMode === "B") {
        this.logger?.debug("Creating Agentic (B) graph...");
        // thread_id 별 토큰 콜백 레지스트리 (finalize 노드 스트리밍용)
        this.streamCallbacks = new Map();
        // app.locals 호환 컨텍스트 — app.js에서 attachRuntimeContext()로 주입.
        // 빌드 시점엔 vectorStoreManager만 셀프 보유, projectResolver 등은 후속 attach.
        this.runtimeContext = { vectorStoreManager: this.vectorStoreManager };
        // MCP 도구를 agentic 그래프 호환 형식으로 변환하여 등록.
        const agenticTools = buildAgenticTools({
          config: this.config,
          logger: this.logger,
          getRuntimeContext: () => this.runtimeContext,
        });
        this.logger?.info(`Agentic tools registered: ${agenticTools.length} tools`);
        this.agenticGraph = createAgenticGraph({
          llm: this.llm,
          tools: agenticTools,
          retriever,
          config: this.config,
          logger: this.logger,
          streamCallbacks: this.streamCallbacks,
        });
        this.logger?.info("Agentic graph (agenticMode=B) initialized");
      }

      // 6. ConversationManager 초기화
      this.conversationManager = new ConversationManager(this.graph);

      this.isInitialized = true;
      this.lastUpdated = new Date();
      this.logger?.info("ChatbotService initialized successfully");

    } catch (error) {
      this.logger?.error("Failed to initialize ChatbotService:", error);
      throw error;
    }
  }

  /**
   * 문서 추가 처리
   * @param {string} filePath - 파일 경로
   */
  async handleDocumentAdd(filePath) {
    this.logger?.info(`Document added: ${filePath}`);
    try {
      const fs = require("fs").promises;
      const pathModule = require("path");
      const content = await fs.readFile(filePath, "utf-8");
      const relativePath = pathModule.relative(this.config.docsRoot, filePath);
      await this.vectorStoreManager.addDocument(relativePath, content, {
        source: filePath,
        filename: pathModule.basename(filePath)
      });
      this.lastUpdated = new Date();
      this.logger?.info(`Document indexed: ${relativePath}`);
    } catch (error) {
      this.logger?.error(`Failed to add document ${filePath}:`, error);
    }
  }

  /**
   * 문서 변경 처리
   * @param {string} filePath - 파일 경로
   */
  async handleDocumentChange(filePath) {
    this.logger?.info(`Document changed: ${filePath}`);
    try {
      const fs = require("fs").promises;
      const pathModule = require("path");
      const content = await fs.readFile(filePath, "utf-8");
      const relativePath = pathModule.relative(this.config.docsRoot, filePath);
      await this.vectorStoreManager.addDocument(relativePath, content, {
        source: filePath,
        filename: pathModule.basename(filePath)
      });
      this.lastUpdated = new Date();
      this.logger?.info(`Document re-indexed: ${relativePath}`);
    } catch (error) {
      this.logger?.error(`Failed to update document ${filePath}:`, error);
    }
  }

  /**
   * 문서 삭제 처리
   * @param {string} filePath - 파일 경로
   */
  async handleDocumentRemove(filePath) {
    this.logger?.info(`Document removed: ${filePath}`);
    try {
      const pathModule = require("path");
      const relativePath = pathModule.relative(this.config.docsRoot, filePath);
      await this.vectorStoreManager.removeDocument(relativePath);
      this.lastUpdated = new Date();
      this.logger?.info(`Document removed from index: ${relativePath}`);
    } catch (error) {
      this.logger?.error(`Failed to remove document ${filePath}:`, error);
    }
  }

  /**
   * 기존 문서 로드 (초기화 시)
   * @param {string} docsRoot - 문서 루트 경로
   */
  async loadExistingDocuments(docsRoot) {
    const fs = require("fs").promises;
    const path = require("path");

    const loadDir = async (dir) => {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        let count = 0;

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);

          // 제외 패턴 체크
          if (this.config.excludes?.some(pattern => {
            const glob = pattern.replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*");
            return new RegExp(glob).test(fullPath);
          })) {
            continue;
          }

          if (entry.isDirectory()) {
            count += await loadDir(fullPath);
          } else if (entry.name.endsWith(".md")) {
            try {
              const content = await fs.readFile(fullPath, "utf-8");
              const relativePath = path.relative(docsRoot, fullPath);
              await this.vectorStoreManager.addDocument(relativePath, content, {
                source: fullPath,
                filename: entry.name
              });
              count++;
            } catch (err) {
              this.logger?.warn(`Failed to load ${fullPath}: ${err.message}`);
            }
          }
        }
        return count;
      } catch (err) {
        this.logger?.error(`Failed to read directory ${dir}: ${err.message}`);
        return 0;
      }
    };

    const totalDocs = await loadDir(docsRoot);
    this.logger?.info(`Loaded ${totalDocs} documents from ${docsRoot}`);
  }

  /**
   * 외부 런타임 컨텍스트(app.locals)를 도구 호출용으로 등록.
   * MCP 핸들러(`smart_search`, `resolve_project` 등)가 `req.app.locals`의 객체를 참조하므로
   * agentic 그래프 빌드 후 app.js에서 호출하여 의존성을 주입.
   *
   * @param {object} appLocals - Express app.locals 또는 호환 객체
   *   ({ vectorStoreManager?, projectResolver?, stores?, chatbotService?, ... })
   */
  attachRuntimeContext(appLocals) {
    if (!appLocals || typeof appLocals !== 'object') return;
    // 자체 vectorStoreManager는 우선순위 유지, 나머지는 외부값으로 채움.
    this.runtimeContext = {
      ...appLocals,
      vectorStoreManager: this.vectorStoreManager || appLocals.vectorStoreManager,
    };
    this.logger?.debug?.('ChatbotService runtime context attached');
  }

  /**
   * agenticMode 설정값을 정규화하여 반환.
   * 'auto'는 Phase 1에서 FR-7 라우팅 휴리스틱 미구현으로 'A' 폴백.
   * warn 로그는 호출자(initialize)에서 1회만 emit — 세션 생성마다 반복 금지.
   * @param {string} [raw]
   * @param {boolean} [warnOnAuto=false]
   * @returns {'A'|'B'}
   */
  _resolveAgenticMode(raw, warnOnAuto = false) {
    const mode = (raw || "A").toUpperCase();
    if (mode === "B") return "B";
    if (mode === "AUTO") {
      if (warnOnAuto) {
        // FR-7 라우팅 휴리스틱은 Phase 3(TASK-P3-002)에서 구현. Phase 1에서는 'A'로 폴백.
        this.logger?.warn("agenticMode=auto: FR-7 routing heuristic not yet available (Phase 1). Falling back to 'A'.");
      }
      return "A";
    }
    return "A";
  }

  /**
   * 새 세션 생성
   * @returns {string} 세션 ID
   */
  createSession() {
    const sessionId = crypto.randomUUID();
    // Δ-9: agenticMode는 세션 생성 시점에 고정. 이후 config 변경은 새 세션부터 반영.
    const agenticMode = this._resolveAgenticMode(this.config.chatbot?.agenticMode);
    this.sessions.set(sessionId, {
      createdAt: new Date(),
      lastUpdatedAt: new Date(),
      messages: [],
      summary: "",
      agenticMode
    });
    return sessionId;
  }

  /**
   * 채팅 실행
   * @param {string} sessionId - 세션 ID
   * @param {string} message - 사용자 메시지
   * @param {Object} options - 옵션
   * @param {boolean} options.thinkingMode - Thinking 모드 활성화
   * @param {Function} options.onStep - 단계 콜백
   * @param {Function} options.onRetrieval - 검색 결과 콜백
   * @param {Function} options.onThinking - Thinking 모드 콜백
   * @param {Function} options.onToken - 토큰 콜백
   * @returns {Promise<Object>} 응답 결과
   */
  async chat(sessionId, message, options = {}) {
    if (!this.isInitialized) {
      throw new Error("ChatbotService not initialized");
    }

    const {
      thinkingMode = false,
      onStep,
      onRetrieval,
      onThinking,
      onToken
    } = options;

    // 세션 확인 또는 생성 (락 외부에서 수행)
    if (!this.sessions.has(sessionId)) {
      sessionId = this.createSession();
    }

    // 동일 세션에 대한 요청은 순차 처리 (동시성 제어)
    return this.sessionLock.acquire(sessionId, async () => {
      const session = this.sessions.get(sessionId);

      // 세션이 삭제된 경우 (다른 요청에서 삭제됨)
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      // Step 16: 대화 히스토리를 LangChain 메시지로 변환
      const selfCorrectionConfig = this.config.chatbot?.selfCorrection || {};
      const historyLimit = selfCorrectionConfig.historyLimit || 10;
      const previousMessages = session.messages
        .slice(-historyLimit)
        .map(msg =>
          msg.role === 'user'
            ? new HumanMessage(msg.content)
            : new AIMessage(msg.content)
        );

      // 입력 상태 구성 (이전 메시지 포함)
      const input = {
        messages: [...previousMessages, new HumanMessage(message)],
        thinkingMode
      };

      // 그래프 선택 (Agentic B > Self-Correcting > Thinking > 기본)
      const selfCorrectionEnabled = selfCorrectionConfig.enabled !== false;
      // Δ-9: 세션 생성 시점에 고정된 agenticMode 사용. 런타임 config 변경 무시.
      const agenticMode = session.agenticMode || "A";
      const currentConfigMode = this._resolveAgenticMode(this.config.chatbot?.agenticMode);
      if (agenticMode !== currentConfigMode) {
        this.logger?.warn(`Session ${sessionId} is using agenticMode=${agenticMode} (locked at session creation). Config now shows ${currentConfigMode}. Will apply to new sessions only.`);
      }
      let graph;
      if (agenticMode === "B" && this.agenticGraph) {
        graph = this.agenticGraph;
        this.logger?.debug("Using Agentic (B) graph");
      } else if (selfCorrectionEnabled && this.selfCorrectingGraph && !thinkingMode) {
        graph = this.selfCorrectingGraph;
        this.logger?.debug("Using Self-Correcting RAG graph");
      } else if (thinkingMode) {
        graph = this.thinkingGraph;
        this.logger?.debug("Using Thinking Mode graph");
      } else {
        graph = this.graph;
        this.logger?.debug("Using standard graph");
      }

      // agentic 그래프의 finalize 노드가 토큰 단위 스트리밍을 지원.
      // 등록된 onToken은 매 청크마다 누적된 content 전체를 받음 (클라이언트 누적 덮어쓰기 호환).
      // 동시성 안전: 동일 sessionId의 중첩 호출은 sessionLock(line 368)이 직렬화하므로
      // streamCallbacks.set이 활성 콜백을 덮어쓰지 않음.
      const agenticStreamingActive =
        agenticMode === "B" && this.agenticGraph && typeof onToken === "function" && this.streamCallbacks;

      try {
        if (agenticStreamingActive) {
          if (this.streamCallbacks.has(sessionId)) {
            this.logger?.warn(`Stale streamCallback for session ${sessionId} — overwriting`);
          }
          this.streamCallbacks.set(sessionId, onToken);
        }
        onStep?.("classifyQuery", "Analyzing your question...");

        // 그래프 스트리밍 실행
        const streamConfig = {
          streamMode: "values",
          configurable: { thread_id: sessionId }
        };

        let finalState = null;
        let lastStep = "";
        let iterationCount = 0;

        this.logger?.info(`Starting graph.stream with input: ${JSON.stringify({ messages: input.messages.length, thinkingMode: input.thinkingMode })}`);

        const stream = await graph.stream(input, streamConfig);
        this.logger?.info(`Stream created, starting iteration...`);

        for await (const state of stream) {
          iterationCount++;
          this.logger?.info(`Stream iteration ${iterationCount}: currentStep=${state.currentStep}, queryType=${state.queryType}, messages=${state.messages?.length || 0}`);

          finalState = state;

          // 단계 진행 알림
          if (state.currentStep && state.currentStep !== lastStep) {
            lastStep = state.currentStep;
            const stepMessage = this.getStepMessage(state.currentStep);
            this.logger?.info(`Step changed: ${state.currentStep} -> ${stepMessage}`);
            onStep?.(state.currentStep, stepMessage);
          }

          // 검색 결과 알림
          if (state.retrievedDocs && state.currentStep === "retrieveDocs") {
            this.logger?.info(`Retrieved ${state.retrievedDocs.length} documents`);
            onRetrieval?.(state.retrievedDocs);
          }

          // Thinking 모드 알림
          if (thinkingMode) {
            if (state.thinkingAnalysis && state.currentStep === "analyzeQuestion") {
              onThinking?.("analyze", `Question type: ${state.thinkingAnalysis.questionType}`);
            }
            if (state.thinkingPlan && state.currentStep === "planStrategy") {
              onThinking?.("plan", `Strategy: ${state.thinkingPlan.strategy}`);
            }
          }

          // 참고: 중간 답변 전송 제거 (Self-Correcting RAG에서 잘못된 첫 답변 방지)
          // 최종 응답은 스트림 완료 후 finalState에서 전송
        }

        // 스트림 완료 후 최종 응답 전송.
        // agentic streaming이 활성이면 finalize 노드가 이미 토큰별 onToken을 호출했으므로 중복 발송 회피.
        if (finalState && finalState.messages && finalState.messages.length > 0) {
          const lastMessage = finalState.messages[finalState.messages.length - 1];
          if (lastMessage instanceof AIMessage) {
            this.logger?.info(`Sending final AI response: ${lastMessage.content?.substring(0, 50)}...`);
            if (!agenticStreamingActive) {
              onToken?.(lastMessage.content);
            }
          }
        }

        this.logger?.info(`Stream completed after ${iterationCount} iterations`);

        // 세션 업데이트 (락 내부에서 안전하게 수행)
        if (finalState && finalState.messages) {
          session.messages.push(
            { role: "user", content: message, timestamp: new Date() },
            {
              role: "assistant",
              content: finalState.messages[finalState.messages.length - 1]?.content || "",
              timestamp: new Date()
            }
          );
          session.lastUpdatedAt = new Date();
          if (finalState.summary) {
            session.summary = finalState.summary;
          }
        }

        return {
          sessionId,
          response: finalState?.messages?.[finalState.messages.length - 1]?.content || "",
          thinkingResults: thinkingMode ? {
            analysis: finalState?.thinkingAnalysis,
            plan: finalState?.thinkingPlan,
            execution: finalState?.thinkingResults
          } : null
        };

      } catch (error) {
        this.logger?.error(`Chat error for session ${sessionId}:`, error);
        throw error;
      } finally {
        if (agenticStreamingActive) {
          this.streamCallbacks.delete(sessionId);
        }
        // M3: 에러 경로에서도 BudgetController 누수 방지 (정상 경로는 finalize 노드가 이미 정리)
        if (agenticMode === "B" && this.agenticGraph && typeof this.agenticGraph.cleanupThread === "function") {
          try { this.agenticGraph.cleanupThread(sessionId); } catch (_) { /* swallow */ }
        }
      }
    });
  }

  /**
   * 단계별 메시지 반환
   * @param {string} step - 워크플로우 단계
   * @returns {string} 사용자 표시 메시지
   */
  getStepMessage(step) {
    const messages = {
      classifyQuery: "Analyzing your question...",
      fastGenerate: "Generating quick response...",           // Step 16
      evaluateAnswer: "Evaluating response quality...",       // Step 16
      retrieveDocs: "Searching relevant documents...",
      gradeDocuments: "Evaluating document relevance...",
      rewriteQuery: "Optimizing search query...",
      generateAnswer: "Generating response...",
      generateWithLowRelevance: "Generating response with limited context...",
      generateNoContext: "No relevant documents found, generating general response...",
      summarizeHistory: "Summarizing conversation...",
      analyzeQuestion: "Analyzing question complexity...",
      planStrategy: "Planning response strategy...",
      executeSteps: "Executing response plan...",
      // Step 17: Multi-Document Summarization
      analyzeRequest: "Analyzing your summarization requirements...",
      mapSummarize: "Generating partial summaries...",
      reduceSummaries: "Merging summaries into final response...",
      generateSummary: "Generating document summary...",
      // Step 19: Deep Document Reading (Thinking Mode)
      evaluateSufficiency: "Evaluating response completeness...",
      deepReadDocument: "Deep reading document for comprehensive answer..."
    };
    return messages[step] || `Processing: ${step}`;
  }

  /**
   * 대화 히스토리 조회
   * @param {string} sessionId - 세션 ID
   * @returns {Object|null} 히스토리 또는 null
   */
  async getHistory(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    return {
      threadId: sessionId,
      messages: session.messages,
      summary: session.summary,
      createdAt: session.createdAt.toISOString(),
      lastUpdatedAt: session.lastUpdatedAt.toISOString()
    };
  }

  /**
   * 세션 삭제
   * @param {string} sessionId - 세션 ID
   * @returns {Promise<boolean>} 삭제 성공 여부
   */
  async deleteSession(sessionId) {
    // 해당 세션에 대한 진행 중인 요청이 완료될 때까지 대기
    return this.sessionLock.acquire(sessionId, async () => {
      return this.sessions.delete(sessionId);
    });
  }

  /**
   * 서비스 상태 조회
   * @returns {Object} 상태 정보
   */
  async getStatus() {
    const vectorStoreStats = this.vectorStoreManager?.getStats() || {
      totalDocuments: 0,
      totalChunks: 0
    };

    return {
      vectorStore: {
        ...vectorStoreStats,
        lastUpdated: this.lastUpdated?.toISOString() || null
      },
      llm: {
        type: this.config.chatbot?.llm?.type || "unknown",
        model: this.config.chatbot?.llm?.model || "unknown",
        status: this.llm ? "connected" : "disconnected"
      },
      embedding: {
        type: this.config.chatbot?.embedding?.type || "unknown",
        model: this.config.chatbot?.embedding?.model || "unknown",
        status: this.embeddings ? "connected" : "disconnected"
      },
      activeSessions: this.sessions.size
    };
  }

  /**
   * 서비스 종료
   */
  async shutdown() {
    this.logger?.info("Shutting down ChatbotService...");

    if (this.docWatcher) {
      await this.docWatcher.close();
    }

    if (this.vectorStoreManager) {
      await this.vectorStoreManager.shutdown();
    }

    this.sessions.clear();
    this.isInitialized = false;

    this.logger?.info("ChatbotService shut down successfully");
  }
}

module.exports = { ChatbotService };
