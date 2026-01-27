/**
 * Chatbot Workflow State Definition
 * @module services/chatbot/workflow/state
 *
 * LangGraph.js 기반 상태 정의
 */

const { Annotation, messagesStateReducer } = require("@langchain/langgraph");

/**
 * 챗봇 워크플로우 상태 정의
 * LangGraph Annotation을 사용하여 상태 스키마 정의
 */
const ChatbotAnnotation = Annotation.Root({
  // 메시지 히스토리 (MessagesAnnotation 대체)
  messages: Annotation({
    reducer: messagesStateReducer,
    default: () => [],
  }),

  // 질문 분류 결과
  queryType: Annotation({
    reducer: (_, action) => action,
    default: () => "unknown",
  }),

  // 분류 신뢰도
  confidence: Annotation({
    reducer: (_, action) => action,
    default: () => 0,
  }),

  // 검색된 문서
  retrievedDocs: Annotation({
    reducer: (_, action) => action,
    default: () => [],
  }),

  // 현재 워크플로우 단계
  currentStep: Annotation({
    reducer: (_, action) => action,
    default: () => "",
  }),

  // 에러 정보
  error: Annotation({
    reducer: (_, action) => action,
    default: () => null,
  }),

  // 대화 요약 (Phase 4: 컨텍스트 압축용)
  summary: Annotation({
    reducer: (_, action) => action,
    default: () => "",
  }),

  // 세션 ID (Phase 4: MemorySaver용)
  threadId: Annotation({
    reducer: (_, action) => action,
    default: () => "",
  }),

  // 문서 관련성 점수 (Phase 5: Document Grading)
  relevanceScore: Annotation({
    reducer: (_, action) => action,
    default: () => 0,
  }),

  // 쿼리 재작성 횟수 (Phase 5: Query Rewriting)
  rewriteCount: Annotation({
    reducer: (_, action) => action,
    default: () => 0,
  }),

  // Thinking 모드 활성화 여부 (Phase 6)
  thinkingMode: Annotation({
    reducer: (_, action) => action,
    default: () => false,
  }),

  // Thinking 분석 결과 (Phase 6)
  thinkingAnalysis: Annotation({
    reducer: (_, action) => action,
    default: () => null,
  }),

  // Thinking 계획 결과 (Phase 6)
  thinkingPlan: Annotation({
    reducer: (_, action) => action,
    default: () => null,
  }),

  // Thinking 실행 결과 (Phase 6)
  thinkingResults: Annotation({
    reducer: (_, action) => action,
    default: () => null,
  }),

  // === Step 16: Self-Correcting RAG ===

  // 답변 품질 평가 결과
  answerQuality: Annotation({
    reducer: (_, action) => action,
    default: () => null,
  }),

  // RAG 사용 여부
  usedRAG: Annotation({
    reducer: (_, action) => action,
    default: () => false,
  }),

  // 재시도 횟수 (무한 루프 방지)
  retryCount: Annotation({
    reducer: (_, action) => action,
    default: () => 0,
  }),

  // 평가 이유
  evaluationReason: Annotation({
    reducer: (_, action) => action,
    default: () => "",
  }),

  // 평가 신뢰도
  evaluationConfidence: Annotation({
    reducer: (_, action) => action,
    default: () => 0,
  }),

  // Self-Correction 활성화 여부
  selfCorrectionEnabled: Annotation({
    reducer: (_, action) => action,
    default: () => true,
  }),

  // === Step 17: Multi-Document Summarization ===

  // 사용자 요약 요구사항 (길이, 형식, 초점 영역)
  // Schema: { targetLength: { value, unit, constraint }, format, focusAreas, language }
  summaryRequirements: Annotation({
    reducer: (_, action) => action,
    default: () => null,
  }),

  // Map-Reduce 부분 요약 결과
  partialSummaries: Annotation({
    reducer: (_, action) => action,
    default: () => [],
  }),

  // Map-Reduce용 문서 그룹
  documentGroups: Annotation({
    reducer: (_, action) => action,
    default: () => [],
  }),

  // 요약 진행 상태 (UI 피드백용)
  summarizationProgress: Annotation({
    reducer: (_, action) => action,
    default: () => ({ current: 0, total: 0, phase: "idle" }),
  }),

  // === Step 18: Query Contextualization ===

  // 맥락화된 쿼리 (follow-up 질문 재작성 결과)
  contextualizedQuery: Annotation({
    reducer: (_, action) => action,
    default: () => null,
  }),

  // 원본 쿼리 (맥락화 전, 로깅/디버깅용)
  originalQuery: Annotation({
    reducer: (_, action) => action,
    default: () => null,
  }),

  // === Step 19: Deep Document Reading (Thinking Mode) ===

  // Deep Read 활성화 여부 (답변 부족 시 활성화)
  deepReadEnabled: Annotation({
    reducer: (_, action) => action,
    default: () => false,
  }),

  // Deep Read 대상 문서 경로
  deepReadDocumentPath: Annotation({
    reducer: (_, action) => action,
    default: () => null,
  }),

  // Deep Read 추출 결과
  deepReadExtractions: Annotation({
    reducer: (_, action) => action,
    default: () => [],
  }),

  // 답변 충분성 평가 결과
  sufficiencyEvaluation: Annotation({
    reducer: (_, action) => action,
    default: () => null,
  }),

  // Deep Read 시도 횟수 (무한 루프 방지)
  deepReadAttempts: Annotation({
    reducer: (_, action) => action,
    default: () => 0,
  }),

  // === Step 15.1: sLLM Thinking Mode ===

  // sLLM 개념 추출 결과
  // Schema: { coreConcepts: string[], keywords: string[] }
  sllmExtractedConcepts: Annotation({
    reducer: (_, action) => action,
    default: () => null,
  }),

  // sLLM 하위 질문 목록 (복잡한 질문 분해 결과)
  // Schema: Array<{ order: number, question: string }>
  sllmSubQuestions: Annotation({
    reducer: (_, action) => action,
    default: () => [],
  }),

  // sLLM 하위 질문별 답변
  // Schema: Array<{ order: number, question: string, answer: string }>
  sllmSubAnswers: Annotation({
    reducer: (_, action) => action,
    default: () => [],
  }),

  // sLLM 합성된 답변 (복잡한 질문용)
  sllmSynthesizedAnswer: Annotation({
    reducer: (_, action) => action,
    default: () => "",
  }),

  // sLLM 단순 질문 답변
  sllmSimpleAnswer: Annotation({
    reducer: (_, action) => action,
    default: () => "",
  }),

  // sLLM 검증 점수 (앙상블 검증 결과)
  // Schema: { accuracy: number, completeness: number, average: number }
  sllmVerifyScore: Annotation({
    reducer: (_, action) => action,
    default: () => null,
  }),

  // sLLM 사실 검증 결과
  // Schema: { facts: Array<{id, text, status, evidence, source}>, summary: {...}, overallScore: number }
  sllmFactCheckResult: Annotation({
    reducer: (_, action) => action,
    default: () => null,
  }),

  // sLLM 개선된 답변 (검증 후 수정)
  sllmRefinedAnswer: Annotation({
    reducer: (_, action) => action,
    default: () => "",
  }),

  // sLLM 최종 답변 (Thinking Mode 출력)
  sllmFinalAnswer: Annotation({
    reducer: (_, action) => action,
    default: () => "",
  }),

  // sLLM Thinking Mode 활성화 여부
  sllmThinkingEnabled: Annotation({
    reducer: (_, action) => action,
    default: () => false,
  }),
});

module.exports = { ChatbotAnnotation };
