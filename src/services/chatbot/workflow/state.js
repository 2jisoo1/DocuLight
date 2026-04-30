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

// === Agentic Graph State (FR-1, TASK-P1-001) ===

const AgenticAnnotation = Annotation.Root({
  // 대화 메시지 히스토리 (tool_use / tool_result 포함)
  messages: Annotation({
    reducer: messagesStateReducer,
    default: () => [],
  }),

  // LLM이 선택한 미처리 tool_use 블록 목록 (tool_call 노드 진입 전 대기)
  // Schema: Array<{ id: string, name: string, input: object }>
  agenticToolCalls: Annotation({
    reducer: (_, action) => action,
    default: () => [],
  }),

  // ReAct 루프 반복 횟수 — Reflexion 트리거 기준(iter ≥ 4) + 예산 제어 기준
  iteration: Annotation({
    reducer: (_, action) => action,
    default: () => 0,
  }),

  // Reflexion self-critique 활성 여부 (self_check → reflexion 진입 시 true)
  reflexion_active: Annotation({
    reducer: (_, action) => action,
    default: () => false,
  }),

  // 최대 반복 예산 (TASK-P1-004 BudgetController 확장 지점)
  thinking_budget: Annotation({
    reducer: (_, action) => action,
    default: () => 10,
  }),

  // 중복 도구 호출 방지 해시 테이블 (SHA-1(name+args) → true)
  // TASK-P1-004에서 BudgetController가 채움 — LangGraph 직렬화를 위해 object 사용
  dedup_hashes: Annotation({
    reducer: (_, action) => action,
    default: () => ({}),
  }),

  // 명시적 종료 신호 (finalize 노드 진입 조건)
  agenticDone: Annotation({
    reducer: (_, action) => action,
    default: () => false,
  }),

  // === Double-Check 상태 (FR-5, TASK-P2-001) ===

  // 현재까지 수집된 비-에러 도구 결과 수 (인용 근거 카운트 근사)
  citation_count: Annotation({
    reducer: (_, action) => action,
    default: () => 0,
  }),

  // self_check 품질 점수 (0.0~1.0). 기본 1.0 (불이익 없음).
  // no-progress 감지 시 낮게 설정.
  self_check_score: Annotation({
    reducer: (_, action) => action,
    default: () => 1.0,
  }),

  // 마지막으로 호출된 도구 이름 (double-check 시 차단 대상 결정)
  last_tool_name: Annotation({
    reducer: (_, action) => action,
    default: () => "",
  }),

  // double-check 이미 실행됨 (무한 루프 방지)
  double_check_triggered: Annotation({
    reducer: (_, action) => action,
    default: () => false,
  }),

  // === Routing Heuristic 결과 (FR-7, TASK-P3-002) ===

  // 라우팅 휴리스틱이 제안한 첫 도구 후보 (0~3개, internal name 목록)
  heuristicHints: Annotation({
    reducer: (_, action) => action,
    default: () => [],
  }),

  // === 한정 답변 모드 (FR-9, TASK-P3-003) ===

  // 한정 답변 모드 이미 실행됨 (idempotent 보장)
  limited_mode_triggered: Annotation({
    reducer: (_, action) => action,
    default: () => false,
  }),

  // === Pre-flight Query Classification (chitchat fast-path) ===

  // 질의 분류 결과: "question" | "summary" | "chitchat" | "unknown"
  queryType: Annotation({
    reducer: (_, action) => action,
    default: () => "unknown",
  }),

  // 분류 신뢰도 (0.0~1.0)
  confidence: Annotation({
    reducer: (_, action) => action,
    default: () => 0,
  }),
});

module.exports = { ChatbotAnnotation, AgenticAnnotation };
