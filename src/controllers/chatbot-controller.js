/**
 * Chatbot Controller
 * @module controllers/chatbot-controller
 *
 * Phase 7: API 엔드포인트 및 SSE 스트리밍
 * RAG 챗봇 API 컨트롤러
 */

const path = require("path");
const { HumanMessage } = require("@langchain/core/messages");

/**
 * SSE 이벤트 전송 헬퍼
 * @param {Object} res - Express response 객체
 * @param {string} event - 이벤트 타입
 * @param {Object} data - 전송할 데이터
 * @param {Object} logger - Logger 인스턴스 (optional)
 * @returns {boolean} 전송 성공 여부
 */
function sendSSE(res, event, data, logger = null) {
  try {
    // Check if response is still writable
    if (res.writableEnded || res.destroyed) {
      logger?.warn?.(`SSE cannot send ${event}: response already ended`);
      return false;
    }

    const eventStr = `event: ${event}\n`;
    const dataStr = `data: ${JSON.stringify(data)}\n\n`;
    const fullMsg = eventStr + dataStr;

    logger?.debug?.(`SSE sending: ${event}, bytes=${fullMsg.length}`);

    // Write the complete message at once
    const written = res.write(fullMsg);

    // Force flush using multiple methods
    if (typeof res.flush === 'function') {
      res.flush();
    }
    if (res.socket && typeof res.socket.write === 'function') {
      // Trigger socket flush
      res.socket.write('');
    }

    logger?.debug?.(`SSE sent: ${event}, written=${written}`);
    return true;
  } catch (err) {
    logger?.error?.(`SSE send error: ${err.message}`);
    return false;
  }
}

/**
 * 9종 정규화 SSE 이벤트 타입 (TASK-P1-005 / FR-11)
 * @type {Set<string>}
 */
const SSE_EVENT_TYPES = new Set([
  'plan', 'tool_use_start', 'tool_use_result', 'citation',
  'token', 'error', 'end', 'retrieval', 'evaluation'
]);

/**
 * 정규화된 SSE 이벤트 전송 — 9종 타입만 허용
 * @param {Object} res - Express response 객체
 * @param {'plan'|'tool_use_start'|'tool_use_result'|'citation'|'token'|'error'|'end'|'retrieval'|'evaluation'} event
 * @param {Object} data
 * @param {Object} [logger]
 * @returns {boolean}
 */
function emitSseEvent(res, event, data, logger = null) {
  if (!SSE_EVENT_TYPES.has(event)) {
    logger?.error?.(`emitSseEvent: unknown event type "${event}"`);
    return false;
  }
  return sendSSE(res, event, data, logger);
}

/**
 * SSE 헤더 설정
 * @param {Object} res - Express response 객체
 */
function setupSSEHeaders(res) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // nginx buffering 비활성화
  res.setHeader("Content-Encoding", "identity"); // 압축 비활성화
  res.setHeader("Transfer-Encoding", "chunked");

  // Disable socket buffering
  if (res.socket) {
    res.socket.setNoDelay(true);
  }

  res.flushHeaders();
}

/**
 * 챗봇 메시지 전송 (SSE 스트리밍)
 * POST /api/chatbot/chat
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Next middleware
 */
async function chat(req, res, next) {
  const logger = req.app.locals.logger;
  const chatbotService = req.app.locals.chatbotService;

  if (!chatbotService) {
    return res.status(503).json({
      error: "Chatbot service not available",
      code: "SERVICE_UNAVAILABLE"
    });
  }

  const { message, threadId } = req.body;

  if (!message || typeof message !== "string" || message.trim().length === 0) {
    return res.status(400).json({
      error: "Message is required",
      code: "INVALID_MESSAGE"
    });
  }

  // SSE 설정
  setupSSEHeaders(res);

  // Check socket status directly instead of relying on 'close' event
  // (the 'close' event can fire prematurely in some cases)
  const checkConnection = () => {
    if (res.writableEnded || res.destroyed) return false;
    if (res.socket && res.socket.destroyed) return false;
    return true;
  };

  // Track if client truly disconnected (for cleanup only)
  let clientAborted = false;
  req.on("close", () => {
    clientAborted = true;
    logger?.debug("Request 'close' event fired");
  });

  // tool_use_id 1:1 페어링 타이밍 맵 — try 밖에 선언해야 finally에서 clear() 가능
  const toolUseTimings = new Map();

  try {
    // 세션 ID 생성 또는 사용
    const sessionId = threadId || chatbotService.createSession();
    logger?.info(`Chat request: session=${sessionId}`);

    // 워크플로우 단계 콜백
    // extra: { i18nKey, vars } — 클라이언트 i18n 보간용 (없을 수도 있음, 영문 fallback)
    const onStep = (step, stepMessage, extra) => {
      if (checkConnection()) {
        const payload = { step, message: stepMessage };
        if (extra && typeof extra === "object") {
          if (extra.i18nKey) payload.i18nKey = extra.i18nKey;
          if (extra.vars) payload.vars = extra.vars;
        }
        sendSSE(res, "step", payload, logger);
      }
    };

    // 검색 결과 콜백
    const onRetrieval = (docs) => {
      if (checkConnection() && docs && docs.length > 0) {
        const docsRoot = req.app.locals.config?.docsRoot || "";

        // 절대 경로를 상대 경로로 변환
        const sources = [...new Set(docs.map(d => {
          const source = d.metadata?.source || "unknown";
          if (docsRoot && source.startsWith(docsRoot)) {
            return path.relative(docsRoot, source).replace(/\\/g, "/");
          }
          return source;
        }))];

        emitSseEvent(res, 'retrieval', {
          count: docs.length,
          sources: sources.slice(0, 5)
        }, logger);
      }
    };

    // 토큰 스트리밍 콜백
    const onToken = (token) => {
      if (checkConnection()) {
        logger?.info(`Sending token event, length=${token?.length || 0}`);
        emitSseEvent(res, 'token', { content: token }, logger);
      }
    };

    // Plan 이벤트 콜백 (ReAct 계획 단계)
    const onPlan = (content) => {
      if (checkConnection()) {
        emitSseEvent(res, 'plan', { content }, logger);
      }
    };

    // tool_use 시작 콜백 (1:1 페어링 타이밍 추적)
    const onToolUseStart = ({ tool_use_id, name, input } = {}) => {
      if (!tool_use_id) {
        logger?.warn('onToolUseStart: missing tool_use_id, skipping');
        return;
      }
      toolUseTimings.set(tool_use_id, Date.now());
      if (checkConnection()) {
        emitSseEvent(res, 'tool_use_start', { tool_use_id, name, input }, logger);
      }
    };

    // tool_use 결과 콜백 (duration 포함)
    const onToolUseResult = ({ tool_use_id, content, isError }) => {
      const startTime = toolUseTimings.get(tool_use_id);
      const duration = startTime !== undefined ? Date.now() - startTime : null;
      toolUseTimings.delete(tool_use_id);
      if (checkConnection()) {
        emitSseEvent(res, 'tool_use_result', { tool_use_id, content, isError, duration }, logger);
      }
    };

    // Citation 이벤트 콜백 ({citationId, quote ≤ 50자, path:line})
    const onCitation = ({ citationId, quote, path: docPath, line }) => {
      if (checkConnection()) {
        // path traversal 정규화 (H-4: 클라이언트 노출 전 sanitize)
        const docsRoot = req.app.locals.config?.docsRoot || '';
        let safePath = docPath || '';
        if (docsRoot && safePath.startsWith(docsRoot)) {
          safePath = path.relative(docsRoot, safePath).replace(/\\/g, '/');
        } else {
          safePath = safePath.replace(/\.\.[/\\]/g, '').replace(/^[/\\]/, '');
        }
        emitSseEvent(res, 'citation', {
          citationId,
          quote: quote && quote.length > 50 ? quote.slice(0, 50) : quote,
          path: safePath,
          line
        }, logger);
      }
    };

    // 평가 이벤트 콜백
    const onEvaluation = (evaluation) => {
      if (checkConnection()) {
        emitSseEvent(res, 'evaluation', evaluation, logger);
      }
    };

    // 초기 단계 전송
    onStep("understanding", "understanding", { i18nKey: "understanding", vars: {} });

    // 워크플로우 실행
    const startTime = Date.now();

    const result = await chatbotService.chat(sessionId, message, {
      onStep,
      onRetrieval,
      onToken,
      onPlan,
      onToolUseStart,
      onToolUseResult,
      onCitation,
      onEvaluation
    });

    const duration = Date.now() - startTime;
    logger?.info(`Chat workflow completed in ${duration}ms, socketOK=${checkConnection()}`);

    // 완료 이벤트 - always try to send regardless of connection status check
    logger?.info(`Attempting to send end event...`);
    const doneSent = emitSseEvent(res, "end", {
      threadId: sessionId,
      duration,
    }, logger);
    logger?.info(`End event send result: ${doneSent}`);

    logger?.info(`Chat completed: session=${sessionId}, duration=${duration}ms`);

  } catch (error) {
    logger?.error("Chat error:", error);

    if (checkConnection()) {
      emitSseEvent(res, 'error', {
        message: error.message || "An error occurred",
        code: error.code || "CHAT_ERROR"
      }, logger);
    }
  } finally {
    toolUseTimings.clear();
    if (checkConnection()) {
      res.end();
    }
  }
}

/**
 * 대화 히스토리 조회
 * GET /api/chatbot/history/:threadId
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Next middleware
 */
async function getHistory(req, res, next) {
  const logger = req.app.locals.logger;
  const chatbotService = req.app.locals.chatbotService;

  if (!chatbotService) {
    return res.status(503).json({
      error: "Chatbot service not available",
      code: "SERVICE_UNAVAILABLE"
    });
  }

  const { threadId } = req.params;

  if (!threadId) {
    return res.status(400).json({
      error: "Thread ID is required",
      code: "INVALID_THREAD_ID"
    });
  }

  try {
    const history = await chatbotService.getHistory(threadId);

    if (!history) {
      return res.status(404).json({
        error: "Thread not found",
        code: "THREAD_NOT_FOUND"
      });
    }

    res.json(history);

  } catch (error) {
    logger?.error("Get history error:", error);
    next(error);
  }
}

/**
 * 대화 히스토리 삭제
 * DELETE /api/chatbot/history/:threadId
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Next middleware
 */
async function deleteHistory(req, res, next) {
  const logger = req.app.locals.logger;
  const chatbotService = req.app.locals.chatbotService;

  if (!chatbotService) {
    return res.status(503).json({
      error: "Chatbot service not available",
      code: "SERVICE_UNAVAILABLE"
    });
  }

  const { threadId } = req.params;

  if (!threadId) {
    return res.status(400).json({
      error: "Thread ID is required",
      code: "INVALID_THREAD_ID"
    });
  }

  try {
    const deleted = await chatbotService.deleteSession(threadId);

    if (!deleted) {
      return res.status(404).json({
        error: "Thread not found",
        code: "THREAD_NOT_FOUND"
      });
    }

    res.json({ success: true, threadId });

  } catch (error) {
    logger?.error("Delete history error:", error);
    next(error);
  }
}

/**
 * 챗봇 상태 조회
 * GET /api/chatbot/status
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Next middleware
 */
async function getStatus(req, res, next) {
  const logger = req.app.locals.logger;
  const chatbotService = req.app.locals.chatbotService;

  if (!chatbotService) {
    return res.status(503).json({
      error: "Chatbot service not available",
      code: "SERVICE_UNAVAILABLE",
      vectorStore: null,
      llm: null,
      embedding: null
    });
  }

  try {
    const status = await chatbotService.getStatus();
    res.json(status);

  } catch (error) {
    logger?.error("Get status error:", error);
    next(error);
  }
}

/**
 * 새 세션 생성
 * POST /api/chatbot/session
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Next middleware
 */
async function createSession(req, res, next) {
  const logger = req.app.locals.logger;
  const chatbotService = req.app.locals.chatbotService;

  if (!chatbotService) {
    return res.status(503).json({
      error: "Chatbot service not available",
      code: "SERVICE_UNAVAILABLE"
    });
  }

  try {
    const sessionId = chatbotService.createSession();
    logger?.info(`New session created: ${sessionId}`);

    res.json({
      threadId: sessionId,
      createdAt: new Date().toISOString()
    });

  } catch (error) {
    logger?.error("Create session error:", error);
    next(error);
  }
}

module.exports = {
  chat,
  getHistory,
  deleteHistory,
  getStatus,
  createSession,
  sendSSE,
  setupSSEHeaders,
  emitSseEvent,
  SSE_EVENT_TYPES
};
