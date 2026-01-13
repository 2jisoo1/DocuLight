/**
 * Chatbot Routes
 * @module routes/chatbot
 *
 * Phase 7: 챗봇 API 라우트 정의
 */

const express = require("express");
const router = express.Router();
const chatbotController = require("../controllers/chatbot-controller");

/**
 * POST /api/chatbot/chat
 * 메시지 전송 (SSE 스트리밍 응답)
 *
 * Request Body:
 * {
 *   message: string (required) - 사용자 메시지
 *   threadId: string (optional) - 세션 ID
 *   thinkingMode: boolean (optional) - Thinking 모드 활성화
 * }
 *
 * Response: SSE stream
 * Events:
 *   - step: 워크플로우 단계 진행
 *   - retrieval: 검색 결과 정보
 *   - thinking: Thinking 모드 중간 결과
 *   - token: 응답 토큰 스트리밍
 *   - done: 완료
 *   - error: 에러
 */
router.post("/chat", chatbotController.chat);

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
