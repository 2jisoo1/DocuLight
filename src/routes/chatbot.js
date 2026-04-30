/**
 * Chatbot Routes
 * @module routes/chatbot
 *
 * Phase 7: 챗봇 API 라우트 정의
 */

const express = require("express");
const router = express.Router();
const chatbotController = require("../controllers/chatbot-controller");
const { chatbotRateLimiter } = require("../middleware/chatbot-rate-limiter");

/**
 * POST /api/chatbot/chat
 * 메시지 전송 (SSE 스트리밍 응답)
 *
 * Request Body:
 * {
 *   message: string (required) - 사용자 메시지
 *   threadId: string (optional) - 세션 ID
 * }
 *
 * Response: SSE stream
 * Events:
 *   - plan: ReAct 계획 단계 출력
 *   - tool_use_start: 도구 호출 시작 (tool_use_id, name, input)
 *   - tool_use_result: 도구 호출 결과 (tool_use_id, content, isError, duration)
 *   - citation: 인용 마커 (citationId, quote ≤ 50자, path, line)
 *   - token: 응답 토큰 스트리밍 (누적 content)
 *   - error: 에러
 *   - end: 완료 (threadId, duration)
 *   - retrieval: 검색 결과 정보
 *   - evaluation: 응답 평가 결과
 *   - step: 워크플로우 단계 진행
 */
router.post("/chat", chatbotRateLimiter, chatbotController.chat);

/**
 * GET /api/chatbot/history/:threadId
 * 대화 히스토리 조회
 *
 * Response:
 * {
 *   threadId: string,
 *   messages: Array<{role, content, timestamp}>,
 *   summary?: string,
 *   createdAt: string,
 *   lastUpdatedAt: string
 * }
 */
router.get("/history/:threadId", chatbotController.getHistory);

/**
 * DELETE /api/chatbot/history/:threadId
 * 대화 히스토리 삭제
 *
 * Response:
 * {
 *   success: boolean,
 *   threadId: string
 * }
 */
router.delete("/history/:threadId", chatbotController.deleteHistory);

/**
 * GET /api/chatbot/status
 * 챗봇 서비스 상태 조회
 *
 * Response:
 * {
 *   vectorStore: { totalDocuments, totalChunks, lastUpdated },
 *   llm: { type, model, status },
 *   embedding: { type, model, status }
 * }
 */
router.get("/status", chatbotController.getStatus);

/**
 * POST /api/chatbot/session
 * 새 세션 생성
 *
 * Response:
 * {
 *   threadId: string,
 *   createdAt: string
 * }
 */
router.post("/session", chatbotController.createSession);

module.exports = router;
