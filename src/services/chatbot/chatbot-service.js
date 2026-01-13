/**
 * Chatbot Service
 * @module services/chatbot/chatbot-service
 *
 * Phase 7: 챗봇 서비스 통합 모듈
 * LLM, Embedding, VectorStore, Workflow 통합
 */

const crypto = require("crypto");
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
    this.docWatcher = null;

    // 세션 관리
    this.sessions = new Map();
    this.conversationManager = null;

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
   * 새 세션 생성
   * @returns {string} 세션 ID
   */
  createSession() {
    const sessionId = crypto.randomUUID();
    this.sessions.set(sessionId, {
      createdAt: new Date(),
      lastUpdatedAt: new Date(),
      messages: [],
      summary: ""
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

    // 세션 확인 또는 생성
    if (!this.sessions.has(sessionId)) {
      sessionId = this.createSession();
    }

    const session = this.sessions.get(sessionId);

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

    // 그래프 선택 (Self-Correcting > Thinking > 기본)
    const selfCorrectionEnabled = selfCorrectionConfig.enabled !== false;
    let graph;
    if (selfCorrectionEnabled && this.selfCorrectingGraph && !thinkingMode) {
      graph = this.selfCorrectingGraph;
      this.logger?.debug("Using Self-Correcting RAG graph");
    } else if (thinkingMode) {
      graph = this.thinkingGraph;
      this.logger?.debug("Using Thinking Mode graph");
    } else {
      graph = this.graph;
      this.logger?.debug("Using standard graph");
    }

    try {
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

      // 스트림 완료 후 최종 응답만 전송 (중간 답변 제외)
      if (finalState && finalState.messages && finalState.messages.length > 0) {
        const lastMessage = finalState.messages[finalState.messages.length - 1];
        if (lastMessage instanceof AIMessage) {
          this.logger?.info(`Sending final AI response: ${lastMessage.content?.substring(0, 50)}...`);
          onToken?.(lastMessage.content);
        }
      }

      this.logger?.info(`Stream completed after ${iterationCount} iterations`);

      // 세션 업데이트
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
    }
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
   * @returns {boolean} 삭제 성공 여부
   */
  async deleteSession(sessionId) {
    return this.sessions.delete(sessionId);
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
