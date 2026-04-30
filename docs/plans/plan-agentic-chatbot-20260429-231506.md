---
plan_contract: "1.1.0"
plan_id: "plan-20260429-agentic-chatbot"
run_id: "20260429-231506"
spec_path: "docs/srs/srs-qna-20260429-145531.md"
feasibility_path: "docs/srs/feasibility-report-20260429-155523.md"
code_path: "."
mode: "normal"
auto: true
generated_at: "2026-04-29"
scope_freeze: true
change_log:
  - date: "2026-04-29"
    reason: "초기 산출 — r1 평가에서 발견된 CRITICAL 3 + HIGH 6 + MEDIUM 4 보정 후 r2 양 평가자 PASS, validator EXIT=0 통과로 확정"
    diff_summary: "rm -rf rollback 제거(git-reset 교체); FR-21+Δ-10 결합 wrap-order AC; Reflexion-context editing 페어링 AC 신규(P1-015 stub); cache 무효화 AC; arm64/musl 매트릭스; Standard fallback retrievalCount=5; path traversal forbidden_patterns; source_anchors 9건 정규화; JA14 cmd 분리"
    approved_by: "evaluator-r2-pass + validator-exit-0"
---

# DocLight 에이전틱 챗봇 재설계 — 구현 계획서

## §1 개요

본 계획서는 SRS `docs/srs/srs-qna-20260429-145531.md`(2198 lines, FR-1~FR-21 + NFR-1~NFR-13, Δ-1~Δ-14 적용 완료)와 Feasibility Report `docs/srs/feasibility-report-20260429-155523.md`(합의 점수 76.8 / Conditionally Feasible)를 입력으로 한다. 목표는 기존 RAG Standard 그래프의 광역 질의 timeout(map-summarize)을 해소할 LangGraph 기반 ReAct + Reflexion 하이브리드 에이전틱 챗봇을 3 Phase로 재설계 도입하는 것이다(Phase 1 MVP 15 TASK / Phase 2 베타 8 TASK / Phase 3 GA 13 TASK, 총 36 TASK). Feasibility 결정 후 잔존 위험은 5건(베타 헤더 deprecation·SLO 미실측·골든셋 라벨 비용·`@langchain/anthropic` 패스스루 미검증·better-sqlite3 OS 매트릭스)으로 모두 deployment-blocking 아님. NFR-1 wall-clock p95 ≤ 45s SLO는 Δ-14에 따라 베타=best-effort, GA=hard SLO로 단계화한다.

## §2 선행 조건 및 전제

- Node.js ≥ 20 LTS, Windows 11 / Linux x64 / macOS x64 동시 지원(better-sqlite3 prebuilt 매트릭스).
- LangGraph 1.x, `@langchain/anthropic` 1.x, `@langchain/openai` 1.x, `@langchain/ollama` 1.x 설치 완료(`package.json` 확인).
- Feasibility Δ-1~Δ-14가 SRS에 반영 완료.
- Anthropic API key는 환경변수 또는 `config.json5`에서 로드(neither hardcoded nor checked in).
- 사용자 결정 Q1~Q5(soft-disable / Citations text document block / nightly 골든셋 / better-sqlite3 / 60k 단일 임계 등)는 SRS에 봉인되어 본 plan은 결정 사항을 변경하지 않는다.
- 골든셋 30/60문항 라벨링은 개발자 + 사용자 협업(Phase 2 시작 시점에 30건 라벨 완료 필요).
- `.github/workflows/`는 현재 비어 있음 → Phase 1에서 신규 도입.

## §3 프로젝트 온보딩 컨텍스트 (주니어/AI 에이전트 필독)

### 프로젝트 정체성

DocLight는 마크다운/PDF 문서 뷰어 + 관리 + LangGraph 챗봇이 통합된 Node.js/Express 애플리케이션이다. 챗봇은 RAG(Retrieval-Augmented Generation) 기반이며, 본 재설계 이전에는 단일 Standard 그래프(`src/services/chatbot/workflow/graph.js`)에서 retrieval → grade → generate 흐름이 고정 분기된다. 광역 질의("문서 전체에서 X 관련 내용 정리")가 map-summarize 노드에서 timeout이 빈번하여 본 재설계 동기가 발생했다.

### 주요 디렉토리 맵

| 경로 | 용도 |
|---|---|
| `src/services/chatbot/` | 챗봇 핵심 (chatbot-service.js, llm-factory.js, vector-store.js, workflow/) |
| `src/services/chatbot/workflow/` | LangGraph 그래프 정의 (graph.js, sllm-graph.js, state.js, nodes/) |
| `src/services/chatbot/workflow/nodes/` | LangGraph 노드 단위 함수 (analyze-request, classify, contextualize, retrieve, grade, rewrite, generate, evaluate, summarize, map-summarize, deep-read, thinking/) |
| `src/services/agent-tools/` | **(신규 — Phase 1 도입)** 에이전트 도구 핸들러 분리 |
| `src/services/mcp/` | MCP 도구 구현(query-document-service, summarize-document-service, smart-search-service, project-resolver-service, code-block-extractor, section-extractor) |
| `src/routes/chatbot.js` | 챗봇 SSE 라우터 (POST /chat) |
| `src/routes/mcp.js` | MCP JSON-RPC 라우터 (866 LOC — 도구 핸들러 임베드) |
| `src/controllers/chatbot-controller.js` | SSE 스트림 핸들러 |
| `src/utils/logger.js` | winston 로거 (현재 plain text — Phase 1에서 JSONL 채널 분리) |
| `src/middleware/rate-limiter.js` | express-rate-limit 적용 (login/signup/verify — 챗봇 미적용 → Phase 3 신규) |
| `test/`, `test/chatbot/`, `test/mcp/`, `test/e2e/` | 단위/통합/E2E 테스트 |
| `scripts/` | 운영 스크립트 (reset-admin.js, audit-config-capture.js) |
| `docs/srs/` | SRS·Feasibility |
| `docs/plans/` | 본 계획서 |

### 핵심 규칙 (CLAUDE.md 발췌)

- **§0-0 Node 프로세스 보호**: `taskkill /IM node.exe`, `Stop-Process -Name node`, `pkill node` 절대 금지. DocLight 프로세스 종료는 PID 기반 선별 종료만 허용.
- **§0 브라우저 다이얼로그 금지**: `alert/confirm/prompt` 대신 인앱 모달 컴포넌트 사용.
- **§0-1 커밋 서명 금지**: `Co-Authored-By:`, `Generated with Claude Code` 류 trailer 절대 추가 금지. Haiku 서브에이전트 commit-message 리뷰 루프 의무.
- **§0-2 코드 리뷰 루프**: 모든 코드 변경은 picky reviewer 서브에이전트(`superpowers:code-reviewer` 등) 통과 후에만 완료 선언.

### 빌드 / 테스트 치트시트

| 작업 | 명령 (bash / pwsh) |
|---|---|
| 의존성 설치 | `npm install` |
| 개발 서버 (nodemon) | `npm run dev` |
| 단위 테스트 (현재) | `npm test` (현재 'echo Error … exit 1' — Phase 1 Δ-12로 정비) |
| 챗봇 단위 테스트 | `node test/chatbot/llm-factory.test.js` 등 (현재 ad-hoc) |
| Playwright E2E | `npx playwright test` |
| Lint (없음) | Phase 1에서 ESLint 도입 검토 |

### 참고 문서

- `docs/srs/srs-qna-20260429-145531.md` (요구사항 명세)
- `docs/srs/feasibility-report-20260429-155523.md` (구현가능성 + Δ-1~Δ-14)
- `CLAUDE.md` (프로젝트 행동 가이드)
- `README.md` (프로젝트 README)
- `config.example.json5` (설정 예시)

## §4 AI 에이전트 실행 가드

- `scope_freeze`: false (평가자 통과 후 true 승격)
- `change_log`: []
- `pre_commit_gate`:
  1. `npm test` (Δ-12로 Phase 1 끝나면 실제 동작) — exit 0
  2. `node -c <변경 파일>` 또는 `npm run lint` (Phase 2부터) — exit 0
  3. `npx playwright test --grep <관련 spec>` (E2E 변경 시) — exit 0
  4. (Windows 병행) `pwsh -c "npm test; if ($?) { Write-Host PASS }"` — `$?` 진리값 점검
- `forbidden_patterns`:
  - `(?i)\b(rm\s+-rf|sudo\s|chmod\s+777)\b` — 표준 안전성 시드
  - `(?i)taskkill\s+/IM\s+node` — 프로젝트 §0-0 노드 프로세스 보호
  - `(?i)Stop-Process\s+.*-Name\s+node` — 동일
  - `(?i)\bpkill\s+node\b` — 동일
  - `(?i)\b(probably|should\s+work|maybe|i\s+think|seems\s+to)\b` — verification 회피 표현
  - `(적절히|필요\s*시|알아서|상황에\s*맞게|기존\s*방식대로|어떻게든)` — 모호 한국어
  - `Co-Authored-By:` — 프로젝트 §0-1 커밋 서명 금지
  - `Generated\s+with\s+Claude\s+Code` — 동일
  - `\b(alert|confirm|prompt)\s*\(` — §0 브라우저 다이얼로그 금지 (단, JS comment / docstring 제외)
  - `read\(\)[^\n]{0,30}수정` — CLIP 금기 (read 직후 수정)
  - `^\+\s*model:\s*"claude-(?!sonnet|opus|haiku)` — 모델 ID 하드코딩 금지(NFR-5 AC-3)
  - `\.\./` — path traversal 안전성 시드 (도구 인자 경로 정규화 검증용)
  - `\.\.\\\\` — path traversal Windows 백슬래시 변형
  - `(?i)/etc/passwd` — Unix 시스템 파일 접근 시도
  - `(?i)c:\\\\windows` — Windows 시스템 디렉토리 접근 시도

## §5 Phase 1 — MVP (베타 직전 골격)

### 목표

LangGraph 기반 Agentic 그래프 골격 + 16 read-only 도구 + C/U/D 격리 + SSE 9종 + soft-disable Anthropic 4종 + feature flag A/B + GitHub Actions PR 게이트 + AsyncLock 90s 상향 + llm-fallback 신설 + tool_use/tool_result 페어링 트리밍 stub을 도입하여 기존 Standard 그래프와 병행 가동 가능한 베타-직전 골격을 완성한다.

### 선행 조건

- §2 충족.
- Δ-1, Δ-3, Δ-8, Δ-12, Δ-13, Δ-14 흡수.

### TASK 목록

#### TASK-P1-001 — Agentic LangGraph 그래프 골격 신설

- **REQ-ID**: FR-1
- **파일**: `src/services/chatbot/workflow/agentic-graph.js`(신규), `src/services/chatbot/workflow/state.js`(수정 — `ChatbotAnnotation` 확장)
- **시그니처**:
  - `function createAgenticGraph({ llm, tools, retriever, config, logger, checkpointer }) → CompiledStateGraph`
  - `state.js`에 `reflexion_active: boolean`, `iteration: number`, `thinking_budget: number`, `dedup_hashes: Set<string>` 필드 추가.
- **참고 패턴**: 기존 `workflow/graph.js`의 `createChatbotGraph` (StateGraph + addNode + addEdge + MemorySaver). ReAct 루프는 `analyze-request → tool_call → observe → self_check → (iter < N) ? loop : finalize`. iter ≥ 4 시 Reflexion self-critique 노드 진입(Madaan 2023 Self-Refine 권고 추가 트리거: iter 3 'no-progress' 검토).
- **source_anchors**: `["src/services/chatbot/workflow/graph.js:81-202", "src/services/chatbot/workflow/state.js:1-200", "src/services/chatbot/workflow/index.js:12-50"]`
- **구현 가이드**:
  1. `state.js` `ChatbotAnnotation`에 reflexion_active, iteration, dedup_hashes(Set) 필드 추가 (Annotation.Root({...}) 확장).
  2. 신규 `agentic-graph.js`에서 nodes: `analyze`, `tool_call`, `observe`, `self_check`, `reflexion`, `finalize` 정의.
  3. `addConditionalEdges("self_check", routeByIteration)` — iter < 4 → tool_call / iter ≥ 4 → reflexion / done → finalize.
  4. MemorySaver checkpointer 연결.
- **Rationale**: ReAct(Yao 2022) + Reflexion(Shinn 2023) 하이브리드는 광역 질의에서 self-critique를 통한 iteration 효율을 입증. 기존 Standard 그래프와 병행 운영(FR-14 feature flag)으로 회귀 위험 제거.
- **함정**: (a) MemorySaver `thread_id`가 그래프 컴파일 단위 격리 → 같은 sessionId라도 그래프 전환 시 history 단절(AR-3). agenticMode 변경은 다음 세션부터 적용(Δ-9). (b) Reflexion self-critique 메시지가 context editing(FR-10)과 같은 messages 배열을 공유 → tool_use/tool_result 페어링 깨짐 주의.
- **테스트**: 성공(iter 2 finalize) / 실패(iter 4 reflexion 진입) / 경계(iter 3 no-progress 보조 트리거).
- **검증 명령**: 단위 테스트 `node test/chatbot/agentic-graph.test.js` 실행, `console.log` 대신 winston logger로 iteration 추적 확인.
- **acceptance_tests**:
  - `[{"shell":"bash","cmd":"node test/chatbot/agentic-graph.test.js","expected_exit":0,"stdout_regex":"PASS|✓.*agentic"}, {"shell":"pwsh","cmd":"node test/chatbot/agentic-graph.test.js","expected_exit":0,"stdout_regex":"PASS|✓.*agentic"}, {"shell":"bash","cmd":"node test/chatbot/agentic-graph-pairing.test.js","expected_exit":0,"stdout_regex":"tool_use/tool_result pairing OK"}, {"shell":"pwsh","cmd":"node test/chatbot/agentic-graph-pairing.test.js","expected_exit":0,"stdout_regex":"tool_use/tool_result pairing OK"}]`
- **DoD**: agentic-graph.js 단위 테스트 ≥ 5 케이스 통과, state.js 신규 필드 회귀 테스트 통과, **Reflexion 트리거(iter≥4) 후 다음 LLM 호출 시 messages 배열에 tool_use/tool_result 미페어링 항목 0건** 검증 단위 테스트 통과 (agentic-graph-pairing.test.js).
- **rollback**: `{"strategy":"git-reset","command":"git restore src/services/chatbot/workflow/state.js && git rm -f src/services/chatbot/workflow/agentic-graph.js"}`

#### TASK-P1-002 — 16개 read-only 도구 레지스트리 + Δ-8 wire 매핑

- **REQ-ID**: FR-2, AR-6, Δ-8
- **파일**: `src/services/agent-tools/registry.js`(신규), `src/services/agent-tools/handlers/`(신규 디렉토리)
- **시그니처**:
  - `function buildToolRegistry({ mcpClient, logger }) → { internalName: ToolDef[] }`
  - `ToolDef = { internal: string, wire: string, schema: ZodSchema, description: string, handler: async (args, ctx) => result }`
- **참고 패턴**: `src/routes/mcp.js`의 `buildTools(prefix)` 함수가 도구 메타데이터 생성. 본 TASK는 그 메타를 LangGraph tool 형태로 어댑트하고 internal(`mcp.list_documents`) ↔ wire(`mcp_list_documents`) 분리 매핑을 추가한다.
- **source_anchors**: `["src/routes/mcp.js:51-330", "src/services/mcp/index.js:1-50"]`
- **구현 가이드**:
  1. registry.js에서 16종 도구(list_full_tree, list_documents, search_documents, query_document, summarize_document, smart_search, resolve_project, extract_code_block, extract_section, list_recent, get_metadata, read_section, get_doc_tree, get_breadcrumb, list_categories, list_tags) 정의.
  2. wire name은 `internal.replace('.', '_')` — Anthropic regex `^[a-zA-Z0-9_-]{1,64}$` 호환.
  3. 도구 description은 'when to use / when NOT / example' 3섹션 한·영 병기.
  4. 부팅 헬스체크: `validateToolRegistry()` 1회 dry-run. 16개 모두 등록 실패 시 winston warn.
- **Rationale**: AR-6 — Anthropic tool name regex 위반 시 부팅 실패. registry 분리로 라우팅 휴리스틱(FR-7) 단위 테스트 용이.
- **함정**: 신규 3종(list_recent / get_metadata / read_section) JSON schema는 SRS 부록 동결 필요. 동적 tool-list는 부팅 1회 캡쳐 후 frozen.
- **테스트**: 16종 등록 / wire 매핑 / 부팅 dry-run 실패 시 warn.
- **acceptance_tests**:
  - `[{"shell":"bash","cmd":"node test/chatbot/tool-registry.test.js","expected_exit":0,"stdout_regex":"16 tools registered"}, {"shell":"pwsh","cmd":"node test/chatbot/tool-registry.test.js","expected_exit":0,"stdout_regex":"16 tools registered"}]`
- **DoD**: 16종 도구 등록 + wire 매핑 + JSON schema 동결 + 단위 테스트 통과.
- **rollback**: `{"strategy":"git-reset","command":"git checkout HEAD -- src/services/agent-tools/ && git clean -fd src/services/agent-tools/"}`

#### TASK-P1-003 — C/U/D 도구 격리 정규식 강화

- **REQ-ID**: FR-3
- **파일**: `src/services/agent-tools/registry.js`(수정)
- **시그니처**: `function isReadOnlyTool(name: string) → boolean`
- **참고 패턴**: 정규식 prefix anchor `^(create|update|delete|remove|upload|write|edit|patch)_` — `post-process` / `post_filter` false positive 회피. 부팅 1회 frozen list 캡쳐 후 동적 tool-list 변경 거부.
- **source_anchors**: `["src/routes/mcp.js:338-356"]`
- **구현 가이드**: prefix anchor 정규식 + frozen Set 확정. Agentic 그래프 tool_call 노드에서 isReadOnlyTool 통과 못 하면 즉시 throw.
- **Rationale**: 이중 방어 — registry 단계 + tool_call 진입 단계 모두 차단.
- **함정**: `post`로 시작하는 합법 도구 false positive 회피.
- **acceptance_tests**:
  - `[{"shell":"bash","cmd":"node -e \"const{isReadOnlyTool}=require('./src/services/agent-tools/registry');process.exit(isReadOnlyTool('post_filter')?0:1)\"","expected_exit":0}, {"shell":"pwsh","cmd":"node -e \"const{isReadOnlyTool}=require('./src/services/agent-tools/registry');process.exit(isReadOnlyTool('post_filter')?0:1)\"","expected_exit":0}]`
- **DoD**: false positive 0건 단위 테스트 통과.
- **rollback**: `{"strategy":"git-reset","command":"git restore src/services/agent-tools/registry.js"}`

#### TASK-P1-004 — 예산·루프 통제 + dedup hash + path canonicalization

- **REQ-ID**: FR-8
- **파일**: `src/services/chatbot/workflow/agentic-graph.js`(수정), `src/services/agent-tools/budget.js`(신규)
- **시그니처**:
  - `class BudgetController { constructor(maxIterations, wallClockMs); shouldContinue(state) → boolean; recordToolCall(name, args) → bool /*dedup hit*/ }`
  - `function canonicalizePath(p: string) → string` (`./guide` ↔ `guide` 통일)
- **source_anchors**: `["N/A — 신규"]`
- **구현 가이드**: dedup hash = SHA-1(name + JSON.stringify(canonicalArgs)). 턴 단위 reset(FR-18 보강). wall-clock 인터럽트는 LangGraph 노드 진입 시 BudgetController.shouldContinue 호출 패턴.
- **Rationale**: 무한 루프·중복 호출 방지. 광역 질의 max_iterations=4 차등 예산.
- **함정**: path canonicalization 누락 시 `./guide`와 `guide`가 별도 호출로 dedup 우회.
- **acceptance_tests**:
  - `[{"shell":"bash","cmd":"node test/chatbot/budget.test.js","expected_exit":0,"stdout_regex":"PASS"}, {"shell":"pwsh","cmd":"node test/chatbot/budget.test.js","expected_exit":0,"stdout_regex":"PASS"}]`
- **DoD**: dedup hit 단위 테스트 + path canon 단위 테스트 통과.
- **rollback**: `{"strategy":"file-delete","command":"rm -f src/services/agent-tools/budget.js"}`

#### TASK-P1-005 — SSE 9종 정규화 이벤트 (신규 4종 추가)

- **REQ-ID**: FR-11
- **파일**: `src/controllers/chatbot-controller.js`(수정), `src/routes/chatbot.js`(수정)
- **시그니처**: `function emitSseEvent(res, event: 'plan'|'tool_use_start'|'tool_use_result'|'citation'|'token'|'error'|'end'|'retrieval'|'evaluation', data: object) → void`
- **참고 패턴**: 기존 retrieval/evaluation 이벤트 보존, 신규 4종(plan / tool_use_start / tool_use_result / citation) 추가. streamMode='messages' 사용 시 token 이벤트 손실 회피.
- **source_anchors**: `["src/routes/chatbot.js:1-86", "src/controllers/chatbot-controller.js:1-50"]`
- **구현 가이드**: tool_use_id 1:1 페어링 race condition(R-6) 회피 — Map<tool_use_id, startTime> 유지. citation inline 마커는 `{citationId, quote ≤ 50자, path:line}`.
- **Rationale**: UX 향상 + 기존 이벤트 semantic 유지.
- **함정**: streamMode='messages' 미사용 시 토큰별 이벤트 손실.
- **acceptance_tests**:
  - `[{"shell":"bash","cmd":"node test/chatbot/sse-events.test.js","expected_exit":0,"stdout_regex":"9 event types"}, {"shell":"pwsh","cmd":"node test/chatbot/sse-events.test.js","expected_exit":0,"stdout_regex":"9 event types"}]`
- **DoD**: 9종 이벤트 단위 테스트 + race condition 회귀 테스트 통과.
- **rollback**: `{"strategy":"git-reset","command":"git restore src/controllers/chatbot-controller.js src/routes/chatbot.js"}`

#### TASK-P1-006 — Feature Flag A/B (agenticMode) + 그래프 라우팅

- **REQ-ID**: FR-14, Δ-9
- **파일**: `src/services/chatbot/chatbot-service.js`(수정), `config.example.json5`(수정)
- **시그니처**: `ChatbotService.constructor`에서 `chatbotConfig.agenticMode: 'A'|'B'|'auto'` 읽고, `'B'`면 `createAgenticGraph`, `'A'`면 기존 `createChatbotGraph`. `'auto'`는 라우팅 휴리스틱(FR-7) 결과 사용.
- **source_anchors**: `["src/services/chatbot/chatbot-service.js:50-100", "src/services/chatbot/workflow/index.js:12-50"]`
- **구현 가이드**: agenticMode 변경 시 다음 세션부터만 적용(Δ-9 — MemorySaver thread_id 격리). 같은 sessionId 내 전환 금지(throw 또는 winston warn).
- **Rationale**: 회귀 위험 제거 + 점진 롤아웃.
- **함정**: 같은 sessionId 그래프 전환 시 history 단절(AR-3).
- **acceptance_tests**:
  - `[{"shell":"bash","cmd":"node test/chatbot/feature-flag.test.js","expected_exit":0,"stdout_regex":"agenticMode=B"}, {"shell":"pwsh","cmd":"node test/chatbot/feature-flag.test.js","expected_exit":0,"stdout_regex":"agenticMode=B"}]`
- **DoD**: A/B 모드 진입 + 세션 내 전환 차단 단위 테스트 통과.
- **rollback**: `{"strategy":"git-reset","command":"git restore src/services/chatbot/chatbot-service.js"}`

#### TASK-P1-007 — Anthropic 4종 soft-disable + 3계층 폴백 (Δ-1)

- **REQ-ID**: FR-16, Δ-1, AR-1, AR-2
- **파일**: `src/services/chatbot/anthropic-features.js`(신규), `src/services/chatbot/llm-factory.js`(수정)
- **시그니처**:
  - `async function probeAnthropicFeatures(client) → { extendedThinking: boolean, interleaved: boolean, citations: boolean, contextEditing: boolean }`
  - `function applySoftDisable(probeResult, logger) → enabledFeatures`
- **참고 패턴**: 부팅 시 1회 dry-run으로 4종 패스스루 검증. 미통과 항목은 winston warn + 비활성화. Layer1: Anthropic 내부 4종 자동 비활성. Layer2: provider fallback. Layer3: Standard 그래프.
- **source_anchors**: `["src/services/chatbot/llm-factory.js:39-119"]`
- **구현 가이드**:
  1. `@langchain/anthropic` bindTools dry-run으로 cache_control / context_management / Citations document block / interleaved beta header 통과 확인.
  2. 미통과 시 raw `@anthropic-ai/sdk` 어댑터 fallback (Anthropic provider 한정 BaseChatModel 부분 호환). **단 Phase 1에서는 raw SDK 어댑터는 stub만 — 실 구현은 Phase 3로 이연**.
  3. 베타 헤더는 `process.env.ANTHROPIC_BETA_HEADERS` 외부화.
- **Rationale**: AR-1/AR-2 CRITICAL — fail-fast 폐기. soft-disable 통일.
- **함정**: 4종 동시 활성 단일 장애점. 베타 헤더 deprecation 모니터링. **Anthropic 4종 OFF/ON 전이 시 system+tools breakpoint 위치가 변경되어 직전 캐시가 silently invalidate됨 — cache_creation_input_tokens 폭증 + 첫 응답 latency SLO(45s) 초과 위험**.
- **soft-disable 캐시 정책 (NFR-13 결합)**: (1) probe 결과 변경 시 cache_control breakpoint 재계산 후 winston warn 채널로 'cache-invalidate-on-soft-disable-transition' 1건 emit. (2) 직후 5분 grace period — 첫 호출 cache miss(`cache_read_input_tokens=0`) 허용 + baseline.json 재산정. (3) grace period 종료 후에도 미스가 지속되면 winston error.
- **acceptance_tests**:
  - `[{"shell":"bash","cmd":"node test/chatbot/anthropic-features.test.js","expected_exit":0,"stdout_regex":"soft-disable"}, {"shell":"pwsh","cmd":"node test/chatbot/anthropic-features.test.js","expected_exit":0,"stdout_regex":"soft-disable"}, {"shell":"bash","cmd":"node test/chatbot/anthropic-cache-transition.test.js","expected_exit":0,"stdout_regex":"cache_read_input_tokens=0.*breakpoint recalculated"}, {"shell":"pwsh","cmd":"node test/chatbot/anthropic-cache-transition.test.js","expected_exit":0,"stdout_regex":"cache_read_input_tokens=0.*breakpoint recalculated"}]`
- **DoD**: 4종 probe 단위 테스트 + soft-disable 회귀 테스트 + OFF→ON 전이 시 cache_read_input_tokens=0 검증 + breakpoint 재계산 + grace period 정책 통과.
- **rollback**: `{"strategy":"file-delete","command":"rm -f src/services/chatbot/anthropic-features.js && git restore src/services/chatbot/llm-factory.js"}`

#### TASK-P1-008 — 도구 핸들러 위치 분리 (`src/services/agent-tools/`)

- **REQ-ID**: FR-20
- **파일**: `src/services/agent-tools/handlers/*.js`(신규 19파일 또는 카테고리 grouping), `src/routes/mcp.js`(리팩터)
- **시그니처**: 각 handler는 `async function handle(args, ctx) → ToolResult`.
- **참고 패턴**: routes/mcp.js 866 LOC에서 도구 비즈니스 로직만 추출. 라우터는 JSON-RPC 응답, 어댑터는 agent tool_result 포맷 변환.
- **source_anchors**: `["src/routes/mcp.js:51-770"]`
- **구현 가이드**: 카테고리 grouping 허용(예: `handlers/document.js`, `handlers/search.js`, `handlers/code.js`, `handlers/metadata.js`). parity test로 라우터 응답 vs 어댑터 응답 동치성 검증.
- **Rationale**: 단일 책임 + 재사용 + 테스트 용이.
- **함정**: JSON-RPC 응답 vs tool_result 포맷 비대칭. 어댑터 분리 필수.
- **acceptance_tests**:
  - `[{"shell":"bash","cmd":"node test/mcp/handler-parity.test.js","expected_exit":0,"stdout_regex":"parity OK"}, {"shell":"pwsh","cmd":"node test/mcp/handler-parity.test.js","expected_exit":0,"stdout_regex":"parity OK"}]`
- **DoD**: **카테고리당 1건 smoke parity** (예: document/search/code/metadata 카테고리 각 1종 도구만 동치 검증 — 16종 전수는 Phase 3 P3-008에서 강화) + routes/mcp.js LOC < 400.
- **rollback**: `{"strategy":"git-reset","command":"git restore src/routes/mcp.js && git checkout HEAD -- src/services/agent-tools/handlers/ && git clean -fd src/services/agent-tools/handlers/"}`

#### TASK-P1-009 — 성능 SLO best-effort 측정 (Δ-14 베타)

- **REQ-ID**: NFR-1, Δ-14
- **파일**: `scripts/agent-load-test.mjs`(신규), `logs/chatbot-metrics.jsonl`(런타임 자동 생성)
- **시그니처**: `node scripts/agent-load-test.mjs --requests 100 --concurrency 5`
- **source_anchors**: `["N/A — 신규"]`
- **구현 가이드**: 100~500건 합성 부하. p50/p95/p99 wall-clock + TTFT 측정. baseline.json에 동결. 베타 단계는 측정·보고만, 차단 X.
- **Rationale**: capacity test 0건 상태 해소. GA hard SLO 진입 전 baseline 동결 필수.
- **함정**: Anthropic API rate limit 충돌 — staggered concurrency.
- **acceptance_tests**:
  - `[{"shell":"bash","cmd":"node scripts/agent-load-test.mjs --requests 10 --concurrency 2 --dry-run","expected_exit":0,"stdout_regex":"baseline"}, {"shell":"pwsh","cmd":"node scripts/agent-load-test.mjs --requests 10 --concurrency 2 --dry-run","expected_exit":0,"stdout_regex":"baseline"}]`
- **DoD**: --dry-run 통과 + baseline.json 생성.
- **rollback**: `{"strategy":"file-delete","command":"rm -f scripts/agent-load-test.mjs"}`

#### TASK-P1-010 — 보안 다층 방어 골격

- **REQ-ID**: NFR-3
- **파일**: `src/services/agent-tools/security.js`(신규)
- **시그니처**: `function redactPII(args) → args` (이메일/전화 정규식), `function auditLog(toolName, args, result, sessionId) → void`, `function validateToolPath(p: string, { rootAllowlist: string[] }) → string` (path traversal 차단 — `../`, 절대경로, `/etc/passwd`, `c:\\windows` 등 forbidden_patterns 매칭 시 throw + audit warn)
- **source_anchors**: `["src/utils/activity-logger.js:1-50"]`
- **구현 가이드**: agent-audit.jsonl 1라인/도구호출. PII redaction 이메일 `[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}` + 전화 `\b\d{2,4}-\d{3,4}-\d{4}\b`. **도구 인자 path canonicalization + allowlist root 검증은 보안 검증용으로 본 TASK가 담당. P1-004의 `canonicalizePath`는 dedup 용도일 뿐이며 분리한다.** 16종 read-only 도구의 모든 path 인자를 진입 시점에 `validateToolPath`로 1차 정규화 후 도구 핸들러로 전달.
- **Rationale**: red-team 50건 시작점 — Microsoft PyRIT 통합은 Phase 3로 이연. Opus H4 — 도구 인자 path traversal 분리 방어 추가(NFR-3).
- **acceptance_tests**:
  - `[{"shell":"bash","cmd":"node test/chatbot/security.test.js","expected_exit":0,"stdout_regex":"redact OK"}, {"shell":"pwsh","cmd":"node test/chatbot/security.test.js","expected_exit":0,"stdout_regex":"redact OK"}, {"shell":"bash","cmd":"node test/chatbot/path-traversal-guard.test.js","expected_exit":0,"stdout_regex":"4 traversal patterns blocked"}, {"shell":"pwsh","cmd":"node test/chatbot/path-traversal-guard.test.js","expected_exit":0,"stdout_regex":"4 traversal patterns blocked"}]`
- **DoD**: PII redaction + audit log 무결성 + path traversal 4종(`../`, `..\\`, `/etc/passwd`, `c:\\windows`) 차단 단위 테스트 통과.
- **rollback**: `{"strategy":"file-delete","command":"rm -f src/services/agent-tools/security.js"}`

#### TASK-P1-011 — Multi-provider 추상화 매트릭스 부록 + 모델 ID 하드코딩 grep 게이트

- **REQ-ID**: NFR-5, Δ-1
- **파일**: `docs/srs/srs-qna-20260429-145531.md`(부록 추가 — 본 plan은 인용만), `.github/workflows/agent-ci.yml`(신규 grep step)
- **시그니처**: GitHub Actions step `Block hardcoded model IDs` — `grep -rn "claude-3" src/ && exit 1 || exit 0`.
- **source_anchors**: `["src/services/chatbot/llm-factory.js:39-119"]`
- **구현 가이드**: provider × feature 매트릭스(anthropic / openai / azure / ollama × extendedThinking / interleaved / citations / contextEditing). Ollama tool-use 미지원 시 Agentic OFF 자동 폴백.
- **Rationale**: AC-NFR-5-3 모델 ID 하드코딩 금지.
- **acceptance_tests**:
  - `[{"shell":"bash","cmd":"bash scripts/ci/check-no-hardcoded-models.sh","expected_exit":0,"stdout_regex":"NONE"}, {"shell":"pwsh","cmd":"pwsh -File scripts/ci/check-no-hardcoded-models.ps1","expected_exit":0,"stdout_regex":"NONE"}]`
- **구현 부속물**: `scripts/ci/check-no-hardcoded-models.sh`(bash 래퍼 — `grep -rn 'claude-3-' src/`을 실행하고 test/ 제외 라인 없으면 'NONE' echo + exit 0, 있으면 exit 1) + 동등 기능의 `scripts/ci/check-no-hardcoded-models.ps1`(pwsh 래퍼). 단일 acceptance cmd 내 `&&`/`;`/`||` 체이닝을 회피하기 위함(JA14 준수).
- **DoD**: grep 게이트 0건 + NFR-5 매트릭스 부록 SRS 반영 + 두 래퍼 스크립트 추가.
- **rollback**: `{"strategy":"manual","command":"docs/srs 부록 수동 제거 후 .github/workflows/agent-ci.yml grep step 제거 (2단계 수동)"}`

#### TASK-P1-012 — GitHub Actions PR 게이트 (Δ-3 + Δ-12)

- **REQ-ID**: NFR-9, Δ-3, Δ-12, RISK-INFRA-01, RISK-INFRA-12
- **파일**: `.github/workflows/agent-ci.yml`(신규), `package.json`(scripts.test 정비)
- **시그니처**: `npm test` → node:test 또는 Jest 러너 호출. PR 차단: unit + integration 빠른 게이트만. nightly 별도 워크플로(Phase 2 도입).
- **source_anchors**: `["package.json:1-60"]`
- **구현 가이드**:
  1. package.json scripts.test을 `node --test test/` 또는 `jest` 명시.
  2. agent-ci.yml: matrix(win32-x64/linux-x64/darwin-x64) × Node 20.x. steps: install → lint → test → grep gate.
  3. baseline.json 동결 PR 거버넌스 — 변경 PR은 별도 라벨 필수.
- **Rationale**: CI 인프라 0→1.
- **함정**: Anthropic API key secret 주입 — secrets.ANTHROPIC_API_KEY. rate-limit 회피로 nightly만 실 호출.
- **acceptance_tests**:
  - `[{"shell":"bash","cmd":"test -f .github/workflows/agent-ci.yml","expected_exit":0}, {"shell":"bash","cmd":"npm test","expected_exit":0,"stdout_regex":"pass(es|ed)|✓"}, {"shell":"pwsh","cmd":"Test-Path .github/workflows/agent-ci.yml","expected_exit":0,"stdout_regex":"True"}, {"shell":"pwsh","cmd":"npm test","expected_exit":0,"stdout_regex":"pass(es|ed)|✓"}]`
- **DoD**: agent-ci.yml 작동 + npm test 1개 이상 케이스 통과.
- **rollback**: `{"strategy":"file-delete","command":"rm -f .github/workflows/agent-ci.yml && git restore package.json"}`

#### TASK-P1-013 — AsyncLock 60s → 90s 상향

- **REQ-ID**: NFR-10
- **파일**: `src/services/chatbot/chatbot-service.js`
- **시그니처**: `this.sessionLock = new AsyncLock({ timeout: 90000 });` (1줄 수정)
- **source_anchors**: `["src/services/chatbot/chatbot-service.js:50"]`
- **구현 가이드**: 60000 → 90000. 글로벌 동시 에이전트 한도(예: 10) 환경변수 `CHATBOT_MAX_CONCURRENT` 추가는 후속 TASK.
- **Rationale**: wall-clock 45s SLO 마진 확보 + lock 만료 위험 회피(AR-8).
- **acceptance_tests**:
  - `[{"shell":"bash","cmd":"grep -n 'timeout: 90000' src/services/chatbot/chatbot-service.js","expected_exit":0,"stdout_regex":"50:.*90000"}, {"shell":"pwsh","cmd":"Select-String -Path src/services/chatbot/chatbot-service.js -Pattern 'timeout: 90000' | ForEach-Object { $_.Line }","expected_exit":0,"stdout_regex":"90000"}]`
- **DoD**: 1줄 수정 + lock 만료 단위 테스트 통과.
- **rollback**: `{"strategy":"git-reset","command":"git restore src/services/chatbot/chatbot-service.js"}`

#### TASK-P1-014 — llm-fallback 신설 + 재시도 3회 (Δ-13)

- **REQ-ID**: NFR-11, Δ-13, RISK-INFRA-05
- **파일**: `src/services/chatbot/llm-fallback.js`(신규), `src/services/chatbot/llm-factory.js`(수정 — fallback chain export)
- **시그니처**:
  - `function createLLMWithFallback(primaryConfig, fallbackConfigs[], { retries: 3, logger }) → Runnable`
- **참고 패턴**: LangChain `Runnable.withFallbacks()` 또는 수동 try/catch. 1차 재시도 1회 → 3회 상향. Standard 그래프 폴백 시 retrievalCount=5 제한 + wall-clock 잔여 < 15s면 즉시 한정 답변.
- **source_anchors**: `["src/services/chatbot/llm-factory.js:39-119"]`
- **구현 가이드**: exponential backoff(100ms, 400ms, 1600ms). circuit breaker 도입은 Phase 3.
- **Rationale**: Anthropic API spike 1회 일시 장애 흡수.
- **함정**: fallback 체인이 자기 자신 호출 무한 루프 회피.
- **acceptance_tests**:
  - `[{"shell":"bash","cmd":"node test/chatbot/llm-fallback.test.js","expected_exit":0,"stdout_regex":"3 retries"}, {"shell":"pwsh","cmd":"node test/chatbot/llm-fallback.test.js","expected_exit":0,"stdout_regex":"3 retries"}, {"shell":"bash","cmd":"node test/chatbot/standard-fallback-bounds.test.js","expected_exit":0,"stdout_regex":"retrievalCount=5.*wallclock<15s"}, {"shell":"pwsh","cmd":"node test/chatbot/standard-fallback-bounds.test.js","expected_exit":0,"stdout_regex":"retrievalCount=5.*wallclock<15s"}]`
- **DoD**: 3회 재시도 + Standard 폴백 단위 테스트 통과 + **Standard fallback 진입 시 retrievalCount=5 강제 + 잔여 wall-clock < 15s면 즉시 한정 답변** 검증 + fallback 체인 누적 wall-clock < 잔여 budget 가드 단위 테스트 통과.
- **rollback**: `{"strategy":"file-delete","command":"rm -f src/services/chatbot/llm-fallback.js && git restore src/services/chatbot/llm-factory.js"}`

#### TASK-P1-015 — tool_use/tool_result 페어링 단위 트리밍 stub (Phase 1 선제 도입)

- **REQ-ID**: FR-10 (선제), Δ-5
- **파일**: `src/services/chatbot/anthropic-features.js`(신규 stub 함수 추가) 또는 `src/services/agent-tools/messages-trim.js`(신규)
- **시그니처**: `function trimMessagesPairwise(messages: Message[], { keepLastN: number }) → Message[]` — tool_use/tool_result를 단위(쌍)로 보존/제거.
- **source_anchors**: `["N/A — 신규"]`
- **dependencies**: `["TASK-P1-001"]`
- **구현 가이드**: Phase 1에서는 정식 60k 임계 트리밍(P3-004) 대신 **stub 알고리즘**만 도입. Reflexion 트리거 또는 lock timeout 임박 시 즉시 호출되어 messages 배열에서 tool_use/tool_result 페어링이 깨진 항목을 0건으로 정규화한다 (4xx/AbortError 노출 차단). Phase 3에서 P3-004가 본 stub을 인계받아 60k 임계 + 자동화 알고리즘으로 확장.
- **Rationale**: Opus C3 평가 — P3-004가 Phase 3로 이연되어 Phase 1~2에서 60k 미만 광역 질의에 페어링 깨짐 → 4xx 경로 노출 위험. Phase 1에 페어링 단위 트리밍의 최소 stub을 선제 도입하여 경로 차단.
- **함정**: tool_use_id가 없는 도구 호출(legacy)을 잘못 트리밍하면 컨텍스트 손실. id 누락 항목은 보수적으로 보존.
- **acceptance_tests**:
  - `[{"shell":"bash","cmd":"node test/chatbot/messages-trim.test.js","expected_exit":0,"stdout_regex":"pairing-unit trim OK"}, {"shell":"pwsh","cmd":"node test/chatbot/messages-trim.test.js","expected_exit":0,"stdout_regex":"pairing-unit trim OK"}]`
- **DoD**: stub 함수 + 페어링 단위 트리밍 단위 테스트(성공/실패/경계 3종) 통과. Phase 3 P3-004 인계 인터페이스 명세서 작성.
- **rollback**: `{"strategy":"file-delete","command":"rm -f src/services/agent-tools/messages-trim.js"}`

### Phase 1 테스트 전략

- 단위 테스트: 각 TASK 별 `test/chatbot/<task>.test.js` (node:test 러너).
- 통합 테스트: `test/chatbot/agentic-integration.test.js` — 그래프 골격 + 도구 + 폴백.
- E2E: Playwright 신규 spec `test/e2e/agentic-chat-mvp.spec.js`.
- **테스트에서 Mock/Stub 사용 금지 — 실 구현 대상만 테스트한다** (plan contract 정합).

### Phase 1 DoD

- 15 TASK 모두 통과 + agent-ci.yml 녹색 + Standard 그래프 회귀 0건 + agenticMode='B' 진입 시 광역 질의 1건이라도 finalize 도달 + tool_use/tool_result 페어링 stub 트리밍 동작.

## §6 Phase 2 — 베타 안정화

### 목표

Conditional Double-Check + Citations API document block(text 일괄 래핑) + 골든셋 30/60문항 + Indirect injection 방어 + 멀티턴 요약 + caching/parallel/context editing + JSONL 관측성 + MVP 환각률 ≤5% 도입.

### TASK 목록

#### TASK-P2-001 — Conditional Double-Check (citation < 2 시)

- **REQ-ID**: FR-5
- **파일**: `src/services/chatbot/workflow/agentic-graph.js`(수정), `src/services/chatbot/workflow/nodes/double-check.js`(신규)
- **시그니처**: `async function doubleCheckNode(state) → state` — 직전 도구와 다른 도구 강제 사용.
- **source_anchors**: `["N/A — 신규"]`
- **dependencies**: `["TASK-P1-001"]`
- **구현 가이드**: citation < 2 OR self_check 점수 < threshold 2-factor 트리거. 직전 semantic_search → list_full_tree+read_section 강제.
- **Rationale**: Huang 2024(LLM cannot self-correct reasoning) 회피.
- **acceptance_tests**:
  - `[{"shell":"bash","cmd":"node test/chatbot/double-check.test.js","expected_exit":0,"stdout_regex":"trigger=citation<2"}, {"shell":"pwsh","cmd":"node test/chatbot/double-check.test.js","expected_exit":0,"stdout_regex":"trigger=citation<2"}]`
- **DoD**: 2-factor 트리거 단위 테스트 + 직전 도구 차단 회귀 테스트 통과.
- **rollback**: `{"strategy":"file-delete","command":"rm -f src/services/chatbot/workflow/nodes/double-check.js"}`

#### TASK-P2-002 — Citations API + FR-21 어댑터 (Δ-2)

- **REQ-ID**: FR-6, FR-21, Δ-2, DR-1
- **파일**: `src/services/agent-tools/citations-adapter.js`(신규)
- **시그니처**: `function wrapAsDocumentBlock(toolResult) → { type: 'document', source: { type: 'text', data: string }, citations: { enabled: true } }`
- **source_anchors**: `["docs/srs/srs-qna-20260429-145531.md:1088-1123", "docs/srs/feasibility-report-20260429-155523.md:137-141"]`
- **구현 가이드**: JSON 결과는 JSON.stringify, 본문은 텍스트 그대로. start_char/end_char grounding. **`@langchain/anthropic` bindTools가 document block + citations.enabled:true 통과 미보장 → 부팅 시 dry-run 실패하면 raw `@anthropic-ai/sdk` 어댑터 우회 분기**. **결합 순서 못박음 (AR-7 회피, Δ-2 + Δ-10 정합)**: user 메시지 내 Citations document block의 `source.data` 텍스트 자체를 `wrapToolResultData()`(TASK-P2-004의 `<UNTRUSTED_TOOL_RESULT>...</UNTRUSTED_TOOL_RESULT>` wrapping — Δ-10과 일관)로 둘러싼 뒤 그 결과 문자열을 `wrapAsDocumentBlock()`의 `source.data`에 그대로 주입한다. 의사코드: `wrapAsDocumentBlock(wrapToolResultData(rawText))`. grounding offset 보정 — wrap prefix 길이만큼 `start_char`/`end_char`를 가산하여 `expected_citations` path:line이 일치하도록 한다.
- **Rationale**: DR-1 CRITICAL 해소. 50자 quote는 '본문 50자 OR 메타는 path 정확 일치'로 완화. AR-7(Citations document block 내부가 system 격리 우회 가능)을 indirect injection wrapping과 결합하여 단일 어댑터 경로로 흡수.
- **함정**: AR-7 — wrap을 document block 외부(별도 user 메시지)로 분리하면 Anthropic Citations API가 grounding하지 않는다. wrapping은 반드시 `source.data` 내부에 들어가야 한다. offset 보정 누락 시 인용 정확도 0%.
- **acceptance_tests**:
  - `[{"shell":"bash","cmd":"node test/chatbot/citations-adapter.test.js","expected_exit":0,"stdout_regex":"document block"}, {"shell":"pwsh","cmd":"node test/chatbot/citations-adapter.test.js","expected_exit":0,"stdout_regex":"document block"}, {"shell":"bash","cmd":"node test/chatbot/citations-wrap-order.test.js","expected_exit":0,"stdout_regex":"wrapped document block.*UNTRUSTED_TOOL_RESULT.*offset OK"}, {"shell":"pwsh","cmd":"node test/chatbot/citations-wrap-order.test.js","expected_exit":0,"stdout_regex":"wrapped document block.*UNTRUSTED_TOOL_RESULT.*offset OK"}]`
- **DoD**: 어댑터 단위 테스트 + raw SDK fallback dry-run 통과 + wrap-order 통합 테스트(wrapped document block payload assertion + grounding offset 보정 검증).
- **rollback**: `{"strategy":"file-delete","command":"rm -f src/services/agent-tools/citations-adapter.js"}`

#### TASK-P2-003 — Golden-set 30/60문항 + nightly 채점 (Δ-3)

- **REQ-ID**: FR-13, Δ-3, RISK-INFRA-07
- **파일**: `test/chatbot/golden-set/30-mvp.jsonl`(신규), `scripts/golden-set-runner.mjs`(신규), `.github/workflows/golden-nightly.yml`(신규)
- **시그니처**: 각 항목 `{ id, query, expected_citations: [{path, line_range}], refusal_keywords: [], category }`.
- **source_anchors**: `["N/A — 신규"]`
- **구현 가이드**: MVP 30문항 → 베타 14일 안정화 후 60문항 확대(DR-7). 결정적 채점(path:line 매칭 + 도구 호출 수 + refusal 키워드)만 차단. LLM-as-judge advisory.
- **Rationale**: PR 30~45분 차단 회피.
- **acceptance_tests**:
  - `[{"shell":"bash","cmd":"node scripts/golden-set-runner.mjs --suite 30-mvp --dry-run","expected_exit":0,"stdout_regex":"30 cases"}, {"shell":"pwsh","cmd":"node scripts/golden-set-runner.mjs --suite 30-mvp --dry-run","expected_exit":0,"stdout_regex":"30 cases"}]`
- **DoD**: 30문항 라벨 완료 + nightly 워크플로 작동.
- **rollback**: `{"strategy":"manual","command":"1) git checkout HEAD -- test/chatbot/golden-set/ 후 git clean -fd 2) git rm -f scripts/golden-set-runner.mjs .github/workflows/golden-nightly.yml 3) git commit"}`

#### TASK-P2-004 — Indirect Prompt Injection 방어 (Δ-10)

- **REQ-ID**: FR-17, Δ-10, AR-7, DR-6
- **파일**: `src/services/agent-tools/injection-guard.js`(신규)
- **시그니처**:
  - `function wrapToolResultData(text: string) → string` (`<UNTRUSTED_TOOL_RESULT>...</UNTRUSTED_TOOL_RESULT>` wrapping — Δ-10 명세)
  - `function detectInjectionPatterns(text: string) → boolean`
- **source_anchors**: `["N/A — 신규"]`
- **dependencies**: `["TASK-P2-002"]` (P2-002 Citations 어댑터의 `source.data` 내부에 본 함수 결과를 주입 — `wrapAsDocumentBlock(wrapToolResultData(raw))` 결합 순서 준수)
- **구현 가이드**: user 메시지 내 wrapping + system 프롬프트 지시 패턴(Spotlight Anthropic 권장). 정규식 1차 방어("ignore previous", "you are now", "system:" 등). v2: 1차 LLM 분류기. **wrap 결과는 반드시 Citations document block의 `source.data` 내부에 위치해야 한다 (P2-002 결합 순서 참조)**.
- **Rationale**: AR-7 — Citations document block 내부 텍스트가 system 격리 우회 가능.
- **acceptance_tests**:
  - `[{"shell":"bash","cmd":"node test/chatbot/injection-guard.test.js","expected_exit":0,"stdout_regex":"50 patterns"}, {"shell":"pwsh","cmd":"node test/chatbot/injection-guard.test.js","expected_exit":0,"stdout_regex":"50 patterns"}]`
- **DoD**: 50건 골든셋(indirect injection) 차단 + wrapping 단위 테스트 통과.
- **rollback**: `{"strategy":"file-delete","command":"rm -f src/services/agent-tools/injection-guard.js"}`

#### TASK-P2-005 — 멀티턴 요약 메모리

- **REQ-ID**: FR-18
- **파일**: `src/services/chatbot/workflow/nodes/summarize.js`(수정), `src/services/chatbot/multi-turn-memory.js`(신규)
- **시그니처**: `async function summarizePreviousTurns(messages: Message[], { maxLines: 5, maxTokens: 200 }) → string`
- **source_anchors**: `["src/services/chatbot/workflow/nodes/summarize.js:1-152"]`
- **구현 가이드**: '5줄 또는 200토큰' 동적 한도. 요약 LLM 호출은 비동기 prefetch — 다음 턴 latency 0. provider != anthropic 시 요약 모델 fallback.
- **Rationale**: 광역 답변(8개 문서 list) 정보 손실 회피.
- **acceptance_tests**:
  - `[{"shell":"bash","cmd":"node test/chatbot/multi-turn.test.js","expected_exit":0,"stdout_regex":"PASS"}, {"shell":"pwsh","cmd":"node test/chatbot/multi-turn.test.js","expected_exit":0,"stdout_regex":"PASS"}]`
- **DoD**: 5줄/200토큰 동적 한도 + 비동기 prefetch 단위 테스트 통과.
- **rollback**: `{"strategy":"git-reset","command":"git restore src/services/chatbot/workflow/nodes/summarize.js && rm -f src/services/chatbot/multi-turn-memory.js"}`

#### TASK-P2-006 — 환각률 MVP ≤ 5% 게이트 (Δ-7)

- **REQ-ID**: NFR-4, Δ-7
- **파일**: `scripts/golden-set-runner.mjs`(수정 — 임계값 추가)
- **시그니처**: `--max-hallucination-rate 0.05`. 회귀 게이트 -3%p / +2%p.
- **source_anchors**: `["N/A — 신규"]`
- **dependencies**: `["TASK-P2-003"]`
- **구현 가이드**: 환각 정의 보수적 — '인용 부재 + 사실 주장'. expected_citations 라벨 누락은 환각 카운트 제외.
- **Rationale**: Magesh 2024 RAG 평균 5~10% — MVP 5% 도전.
- **acceptance_tests**:
  - `[{"shell":"bash","cmd":"node scripts/golden-set-runner.mjs --suite 30-mvp --max-hallucination-rate 0.05 --dry-run","expected_exit":0,"stdout_regex":"hallucination"}, {"shell":"pwsh","cmd":"node scripts/golden-set-runner.mjs --suite 30-mvp --max-hallucination-rate 0.05 --dry-run","expected_exit":0,"stdout_regex":"hallucination"}]`
- **DoD**: nightly에서 환각률 ≤ 5% 측정.
- **rollback**: `{"strategy":"git-reset","command":"git restore scripts/golden-set-runner.mjs"}`

#### TASK-P2-007 — Caching + Parallel + Context Editing (Δ-5)

- **REQ-ID**: NFR-13, Δ-5
- **파일**: `src/services/chatbot/anthropic-features.js`(수정)
- **시그니처**: cache_control breakpoint 적용 + parallel tool use 보고 + context editing 60k 단일 임계.
- **source_anchors**: `["N/A — 신규"]`
- **dependencies**: `["TASK-P1-007"]`
- **구현 가이드**: raw payload assertion 단위 테스트(AC-NFR-13-1) — `cache_control` 필드가 silently drop되지 않는지 점검. 5분 TTL 저트래픽 시 캐시 미스 우세 → 1시간 extended TTL beta 검토(향후). parallel은 모델 결정 — 강제 불가, 광역 카테고리 별도 보고. context editing은 60k 도달 후만 — cache breakpoint 무효화 위험 모니터링. **soft-disable on→off 전이 회귀 테스트 추가 (P1-007 정책 인계)**: 4종 OFF→ON 또는 ON→OFF 전이 직후 첫 호출에서 `cache_control` breakpoint가 보존되며 baseline.json이 갱신되는지 검증.
- **Rationale**: RISK-INFRA-06 + DR-4 해소.
- **acceptance_tests**:
  - `[{"shell":"bash","cmd":"node test/chatbot/caching.test.js","expected_exit":0,"stdout_regex":"cache_control"}, {"shell":"pwsh","cmd":"node test/chatbot/caching.test.js","expected_exit":0,"stdout_regex":"cache_control"}]`
- **DoD**: raw payload assertion + 60k 단일 임계 단위 테스트 통과.
- **rollback**: `{"strategy":"git-reset","command":"git restore src/services/chatbot/anthropic-features.js"}`

#### TASK-P2-008 — winston JSONL 채널 분리 (관측성)

- **REQ-ID**: NFR-6, RISK-INFRA-08
- **파일**: `src/utils/logger.js`(수정 — 멀티 transport)
- **시그니처**: `createLogger({ channels: ['main','metrics','audit'] })` — metrics/audit는 별도 createLogger + JSONL format.
- **source_anchors**: `["src/utils/logger.js:11-145"]`
- **구현 가이드**: `usage.cache_read_input_tokens` / `usage.cache_creation_input_tokens` 매핑. OpenTelemetry GenAI semantic conventions는 v2 후보(Phase 3 NFR-6 GA에서 검토).
- **Rationale**: 현 winston은 plain text printf — JSONL transport 신규.
- **acceptance_tests**:
  - `[{"shell":"bash","cmd":"node test/utils/logger.test.js","expected_exit":0,"stdout_regex":"3 channels"}, {"shell":"pwsh","cmd":"node test/utils/logger.test.js","expected_exit":0,"stdout_regex":"3 channels"}]`
- **DoD**: 3 채널 분리 + JSONL format + cache_*_tokens 매핑 단위 테스트 통과.
- **rollback**: `{"strategy":"git-reset","command":"git restore src/utils/logger.js"}`

### Phase 2 테스트 전략

- 단위 테스트: 각 TASK 별 `test/chatbot/<task>.test.js` (node:test 러너).
- 통합 테스트: `test/chatbot/agentic-integration-beta.test.js` — Citations + injection-guard + 멀티턴 + caching.
- E2E: Playwright spec 확장 `test/e2e/agentic-chat-beta.spec.js`.
- **테스트에서 Mock/Stub 사용 금지 — 실 구현 대상만 테스트한다** (plan contract 정합).

### Phase 2 DoD

- 30문항 골든셋 환각률 ≤ 5% + Citations document block 작동 + nightly 워크플로 녹색 + JSONL 관측성 활성.

## §7 Phase 3 — GA 진입

### 목표

[PLAN]/[OBSERVE]/[SELF_CHECK] 마커 + 라우팅 휴리스틱 정밀화 + 한정 모드 재시도 + context editing GA + 피드백 SQLite + 다국어 + rate-limit + parity test 자동화 + custom_content document block 정밀화 + GA hard SLO + 토큰 가드 단일화 + 마이그레이션 가이드 + NFR-12 lint.

### TASK 목록

#### TASK-P3-001 — [PLAN]/[OBSERVE]/[SELF_CHECK] 비-XML 마커 (Δ-6)

- **REQ-ID**: FR-4, Δ-6, DR-3
- **파일**: `src/services/chatbot/workflow/prompts.js`(수정 또는 신규 agentic 프롬프트), `src/services/agent-tools/marker-parser.js`(신규)
- **시그니처**: `function parseMarkers(text: string) → { plan, observe, selfCheck }`
- **source_anchors**: `["src/services/chatbot/workflow/prompts.js:13-35"]`
- **구현 가이드**: `<plan>/<observe>/<self_check>` XML → `[PLAN]/[OBSERVE]/[SELF_CHECK]` 비-XML 마커 변경. 누락 시 1회 재요청(`tool_choice: any` 강제 + 시스템 reminder 갱신 3단). jailbreak 벡터 회피.
- **Rationale**: DR-3 — Anthropic `<thinking>` 자동 wrap 충돌 해소.
- **acceptance_tests**:
  - `[{"shell":"bash","cmd":"node test/chatbot/marker-parser.test.js","expected_exit":0,"stdout_regex":"\\[PLAN\\]"}, {"shell":"pwsh","cmd":"node test/chatbot/marker-parser.test.js","expected_exit":0,"stdout_regex":"\\[PLAN\\]"}]`
- **DoD**: 마커 파서 + 1회 재요청 + 골든셋 expected 패턴 동기화.
- **rollback**: `{"strategy":"git-reset","command":"git restore src/services/chatbot/workflow/prompts.js && rm -f src/services/agent-tools/marker-parser.js"}`

#### TASK-P3-002 — 라우팅 휴리스틱 (한·영 균형)

- **REQ-ID**: FR-7
- **파일**: `src/services/chatbot/workflow/nodes/route.js`(신규 또는 classify.js 수정)
- **시그니처**: `function routeQuery(query: string) → { mode: 'A'|'B', confidence: number }`
- **source_anchors**: `["src/services/chatbot/workflow/nodes/classify.js:1-245"]`
- **구현 가이드**: 한·영 키워드 균형(목록 vs list 동등 가중치). 시스템 프롬프트에 '제안일 뿐 최종 결정은 모델 자율' 명시.
- **Rationale**: 광역 vs 정밀 분기.
- **acceptance_tests**:
  - `[{"shell":"bash","cmd":"node test/chatbot/route.test.js","expected_exit":0,"stdout_regex":"han\\+eng balanced"}, {"shell":"pwsh","cmd":"node test/chatbot/route.test.js","expected_exit":0,"stdout_regex":"han\\+eng balanced"}]`
- **DoD**: 한·영 50:50 라벨된 100건 라우팅 정확도 ≥ 80%.
- **rollback**: `{"strategy":"file-delete","command":"rm -f src/services/chatbot/workflow/nodes/route.js"}`

#### TASK-P3-003 — 한정 답변 모드 재시도 + fallback

- **REQ-ID**: FR-9
- **파일**: `src/services/chatbot/workflow/nodes/refuse.js`(신규)
- **시그니처**: `async function refuseNode(state) → state` — LLM 호출 1회 재시도 + 최종 실패 시 정적 메시지.
- **source_anchors**: `["N/A — 신규"]`
- **구현 가이드**: 한정 모드 환각률 별도 트래킹(골든셋 카테고리 추가).
- **Rationale**: 한정 모드 fallback 부재 회피.
- **acceptance_tests**:
  - `[{"shell":"bash","cmd":"node test/chatbot/refuse.test.js","expected_exit":0,"stdout_regex":"static fallback"}, {"shell":"pwsh","cmd":"node test/chatbot/refuse.test.js","expected_exit":0,"stdout_regex":"static fallback"}]`
- **DoD**: 1회 재시도 + 정적 메시지 fallback 단위 테스트 통과.
- **rollback**: `{"strategy":"file-delete","command":"rm -f src/services/chatbot/workflow/nodes/refuse.js"}`

#### TASK-P3-004 — Context Editing 60k 단일 임계 GA (Δ-5)

- **REQ-ID**: FR-10, Δ-5
- **파일**: `src/services/chatbot/anthropic-features.js`(수정 — 60k 임계 통일)
- **시그니처**: `function shouldEditContext(tokenCount: number) → boolean` (60k 단일 임계, 48k 표현 제거)
- **source_anchors**: `["N/A — 신규"]`
- **dependencies**: `["TASK-P1-007", "TASK-P2-007"]`
- **구현 가이드**: fallback 트리밍 시 tool_use/tool_result 페어링 단위 트리밍 알고리즘 단위 테스트 강제. SDK 패스스루 미검증 시 raw HTTP 어댑터 fallback.
- **Rationale**: DR-4 race 해소 + Δ-5 통일.
- **acceptance_tests**:
  - `[{"shell":"bash","cmd":"node test/chatbot/context-editing.test.js","expected_exit":0,"stdout_regex":"60000"}, {"shell":"pwsh","cmd":"node test/chatbot/context-editing.test.js","expected_exit":0,"stdout_regex":"60000"}]`
- **DoD**: 60k 단일 임계 + tool_use 페어링 트리밍 단위 테스트 통과.
- **rollback**: `{"strategy":"git-reset","command":"git restore src/services/chatbot/anthropic-features.js"}`

#### TASK-P3-005 — 피드백 SQLite (better-sqlite3, Δ-4)

- **REQ-ID**: FR-12, Δ-4, RISK-INFRA-02
- **파일**: `src/services/chatbot/feedback-store.js`(신규), `data/feedback.sqlite`(런타임 생성), `package.json`(better-sqlite3 추가), `docs/install.md`(빌드 도구 가이드)
- **시그니처**:
  - `class FeedbackStore { record({ sessionId, turnId, rating, comment, toolSequence, answerLengthTokens }) → void }`
- **source_anchors**: `["N/A — 신규"]`
- **구현 가이드**: prebuilt 적중 **공식 지원 OS = win32-x64 / linux-x64-glibc / darwin-x64** (3종). **arm64 / linux-musl(alpine)은 본 plan 범위 외 — `docs/install.md`에 'Docker alpine / AWS Graviton 등 arm64·musl 환경에서는 better-sqlite3 소스 빌드 또는 JSON 파일 fallback 라우팅(코드 자동) 사용' 명시**. GH Actions matrix는 3종으로 한정하되, **선택적 옵셔널 matrix로 `linux-arm64` + `linux-alpine(musl)` dry-run 빌드 추가 (failure ≠ PR 차단)**. answer hash 대신 길이 + 도구 호출 시퀀스만 저장(PII 회피). 자유 입력 코멘트 필드 추가.
- **Rationale**: RISK-INFRA-02 매트릭스 검증 + Q4 결정.
- **acceptance_tests**:
  - `[{"shell":"bash","cmd":"node test/chatbot/feedback-store.test.js","expected_exit":0,"stdout_regex":"sqlite OK"}, {"shell":"pwsh","cmd":"node test/chatbot/feedback-store.test.js","expected_exit":0,"stdout_regex":"sqlite OK"}]`
- **DoD**: SQLite CRUD + GH Actions matrix prebuilt 검증 + install.md 가이드 작성.
- **rollback**: `{"strategy":"file-delete","command":"rm -f src/services/chatbot/feedback-store.js data/feedback.sqlite && git restore package.json docs/install.md"}`

#### TASK-P3-006 — 다국어 한·영 자동 감지 유지

- **REQ-ID**: FR-15
- **파일**: `src/services/chatbot/workflow/prompts.js`(보존 검증 only)
- **시그니처**: 변경 없음 — 회귀 단위 테스트만 추가.
- **source_anchors**: `["src/services/chatbot/workflow/prompts.js:13-35"]`
- **구현 가이드**: 도구 description 한·영 병기(NFR-12 통합).
- **acceptance_tests**:
  - `[{"shell":"bash","cmd":"node test/chatbot/lang-detect.test.js","expected_exit":0,"stdout_regex":"han|eng"}, {"shell":"pwsh","cmd":"node test/chatbot/lang-detect.test.js","expected_exit":0,"stdout_regex":"han|eng"}]`
- **DoD**: 한·영 자동 감지 회귀 테스트 통과.
- **rollback**: `{"strategy":"none","command":"N/A — 회귀 테스트 추가만"}`

#### TASK-P3-007 — 권한 + 비로그인 SSE rate-limit (Δ-11)

- **REQ-ID**: FR-19, NFR-8, Δ-11, RISK-INFRA-10
- **파일**: `src/middleware/chatbot-rate-limiter.js`(신규), `src/routes/chatbot.js`(수정 — 미들웨어 적용)
- **시그니처**: `const chatbotLimiter = rateLimit({ windowMs: 60000, max: 10, keyGenerator: req => req.ip + ':' + (req.session?.id || 'anon') })`
- **source_anchors**: `["src/middleware/rate-limiter.js:1-30", "src/routes/chatbot.js:32-86"]`
- **구현 가이드**: vector store partitioning 우회 여부 단위 테스트(read_section / get_metadata).
- **Rationale**: 비용 모니터링 비대상(NFR-2)과 결합된 abuse 방어선.
- **acceptance_tests**:
  - `[{"shell":"bash","cmd":"node test/chatbot/rate-limit.test.js","expected_exit":0,"stdout_regex":"429"}, {"shell":"pwsh","cmd":"node test/chatbot/rate-limit.test.js","expected_exit":0,"stdout_regex":"429"}]`
- **DoD**: 11번째 요청 429 + 단위 테스트 통과.
- **rollback**: `{"strategy":"file-delete","command":"rm -f src/middleware/chatbot-rate-limiter.js && git restore src/routes/chatbot.js"}`

#### TASK-P3-008 — 도구 핸들러 parity test 자동화

- **REQ-ID**: FR-20
- **파일**: `test/mcp/parity-suite.test.js`(신규)
- **시그니처**: 16종 도구 × 라우터 응답 vs 어댑터 응답 동치성.
- **source_anchors**: `["N/A — 신규"]`
- **dependencies**: `["TASK-P1-008"]`
- **구현 가이드**: GH Actions PR 게이트에 추가. **테스트는 3종(성공/실패/경계) 명시**: (1) 성공 — 16/16 도구가 라우터·어댑터 동치(JSON 응답 필드/타입 일치), (2) 실패 — 응답 포맷 불일치 시 diff 출력 후 exit 1, (3) 경계 — 0종 도구 등록(빈 레지스트리) early-exit 0.
- **acceptance_tests**:
  - `[{"shell":"bash","cmd":"node test/mcp/parity-suite.test.js","expected_exit":0,"stdout_regex":"16/16 parity"}, {"shell":"pwsh","cmd":"node test/mcp/parity-suite.test.js","expected_exit":0,"stdout_regex":"16/16 parity"}]`
- **DoD**: **16종 전수 + edge case 강화** — 성공(16/16 동치) + 실패(응답 포맷 불일치 시 diff 출력) + 경계(0종 등록 시 early-exit) 3종 + CI 통합. P1-008의 카테고리당 1건 smoke parity를 본 TASK에서 16종 전수 + edge case로 확장.
- **rollback**: `{"strategy":"file-delete","command":"rm -f test/mcp/parity-suite.test.js"}`

#### TASK-P3-009 — FR-21 custom_content 분기 + grounding 정밀화

- **REQ-ID**: FR-21
- **파일**: `src/services/agent-tools/citations-adapter.js`(수정)
- **시그니처**: `function wrapAsCustomContent(toolResult) → { type: 'document', source: { type: 'custom_content', content: [{type:'text',text}] }, citations: { enabled: true } }`
- **source_anchors**: `["N/A — 신규"]`
- **dependencies**: `["TASK-P2-002"]`
- **구현 가이드**: text 일괄 래핑 sole path 외 custom_content 정밀 분기. start_char/end_char 정확도 향상.
- **acceptance_tests**:
  - `[{"shell":"bash","cmd":"node test/chatbot/citations-precision.test.js","expected_exit":0,"stdout_regex":"custom_content"}, {"shell":"pwsh","cmd":"node test/chatbot/citations-precision.test.js","expected_exit":0,"stdout_regex":"custom_content"}]`
- **DoD**: custom_content 분기 단위 테스트 + grounding 정확도 ≥ 95%.
- **rollback**: `{"strategy":"git-reset","command":"git restore src/services/agent-tools/citations-adapter.js"}`

#### TASK-P3-010 — GA Hard SLO 진입 (Δ-14)

- **REQ-ID**: NFR-1, Δ-14
- **파일**: `scripts/agent-load-test.mjs`(수정 — baseline 동결), `.github/workflows/ga-slo.yml`(신규)
- **시그니처**: `--enforce-slo` 플래그 — TTFT 5s / wall 45s p95 위반 시 exit 1.
- **source_anchors**: `["N/A — 신규"]`
- **dependencies**: `["TASK-P1-009"]`
- **구현 가이드**: capacity test baseline 동결 후 hard SLO 강제. 광역 max_iterations=4 차등 예산.
- **Rationale**: 베타 best-effort → GA hard SLO 단계화.
- **acceptance_tests**:
  - `[{"shell":"bash","cmd":"node scripts/agent-load-test.mjs --enforce-slo --requests 100","expected_exit":0,"stdout_regex":"p95.*<.*45"}, {"shell":"pwsh","cmd":"node scripts/agent-load-test.mjs --enforce-slo --requests 100","expected_exit":0,"stdout_regex":"p95.*<.*45"}]`
- **DoD**: baseline 동결 + hard SLO 워크플로 녹색.
- **rollback**: `{"strategy":"git-reset","command":"git restore scripts/agent-load-test.mjs && rm -f .github/workflows/ga-slo.yml"}`

#### TASK-P3-011 — NFR-2 토큰 가드 단일화 (Δ-5) + 마이그레이션 가이드 (Δ-9)

- **REQ-ID**: NFR-2, NFR-7, Δ-5, Δ-9
- **파일**: `src/services/agent-tools/token-guard.js`(신규), `docs/migration/agentic-chatbot.md`(신규)
- **시그니처**: `function checkInputLimit(tokens: number) → boolean` (60k 단일 출처 통일).
- **source_anchors**: `["src/services/chatbot/token-estimator.js:1-135"]`
- **구현 가이드**: 60k input / 4k output. 마이그레이션 가이드: agenticMode 전환은 다음 세션부터, 세션 schema 호환성, MemorySaver 격리 안내.
- **acceptance_tests**:
  - `[{"shell":"bash","cmd":"node test/chatbot/token-guard.test.js","expected_exit":0,"stdout_regex":"60000"}, {"shell":"pwsh","cmd":"node test/chatbot/token-guard.test.js","expected_exit":0,"stdout_regex":"60000"}]`
- **DoD**: 60k 가드 + 마이그레이션 가이드 작성 + 세션 schema 호환성 단위 테스트 통과.
- **rollback**: `{"strategy":"file-delete","command":"rm -f src/services/agent-tools/token-guard.js docs/migration/agentic-chatbot.md"}`

#### TASK-P3-012 — fallback 재시도 3회 GA + circuit breaker (Δ-13)

- **REQ-ID**: NFR-11, Δ-13
- **파일**: `src/services/chatbot/llm-fallback.js`(수정 — circuit breaker 추가)
- **시그니처**: `class CircuitBreaker { onSuccess(); onFailure(); shouldOpen(): boolean }` — 5분 fail-rate ≥ 50% 시 open 30초.
- **source_anchors**: `["N/A — 신규"]`
- **dependencies**: `["TASK-P1-014"]`
- **구현 가이드**: Standard 폴백 시 retrievalCount=5 제한 + 잔여 < 15s 즉시 한정 답변.
- **acceptance_tests**:
  - `[{"shell":"bash","cmd":"node test/chatbot/circuit-breaker.test.js","expected_exit":0,"stdout_regex":"open|closed"}, {"shell":"pwsh","cmd":"node test/chatbot/circuit-breaker.test.js","expected_exit":0,"stdout_regex":"open|closed"}]`
- **DoD**: circuit breaker open/closed 전환 + Standard 폴백 retrievalCount=5 단위 테스트 통과.
- **rollback**: `{"strategy":"git-reset","command":"git restore src/services/chatbot/llm-fallback.js"}`

#### TASK-P3-013 — NFR-12 lint complexity + LOC 가이드

- **REQ-ID**: NFR-12
- **파일**: `.eslintrc.json`(신규), `package.json`(scripts.lint 추가)
- **시그니처**: ESLint complexity rule + cyclomatic ≤ 15. LOC ≤ 200은 lint complexity로 대체.
- **source_anchors**: `["package.json:1-60"]`
- **구현 가이드**: 시스템 프롬프트 토큰 길이(1024+) 단위 테스트 — prompt caching minimum 충족 검증.
- **acceptance_tests**:
  - `[{"shell":"bash","cmd":"npm run lint","expected_exit":0,"stdout_regex":"0 problems|^$"}, {"shell":"pwsh","cmd":"npm run lint","expected_exit":0,"stdout_regex":"0 problems|^$"}]`
- **DoD**: ESLint 0 errors + 토큰 길이 단위 테스트 통과.
- **rollback**: `{"strategy":"file-delete","command":"rm -f .eslintrc.json && git restore package.json"}`

### Phase 3 테스트 전략

- 단위 테스트: 각 TASK 별 `test/chatbot/<task>.test.js` (node:test 러너).
- 통합 테스트: `test/chatbot/agentic-integration-ga.test.js` — 16종 parity + context editing + circuit breaker + rate-limit.
- E2E: Playwright spec 확장 `test/e2e/agentic-chat-ga.spec.js` + GA hard SLO 워크플로.
- **테스트에서 Mock/Stub 사용 금지 — 실 구현 대상만 테스트한다** (plan contract 정합).

### Phase 3 DoD

- 13 TASK 모두 통과 + GA hard SLO 워크플로 녹색 + 60문항 골든셋 환각률 ≤ 3% + circuit breaker 작동.

## §8 스펙 매핑 표 (REQ-ID ↔ TASK-ID, 34행 100% 커버)

| REQ-ID | Phase | TASK-ID | 비고 |
|---|---|---|---|
| FR-1 | 1 | TASK-P1-001 | Agentic Graph |
| FR-2 | 1 | TASK-P1-002 | 16 도구 + Δ-8 |
| FR-3 | 1 | TASK-P1-003 | C/U/D 격리 |
| FR-4 | 3 | TASK-P3-001 | Δ-6 마커 |
| FR-5 | 2 | TASK-P2-001 | Double-Check |
| FR-6 | 2 | TASK-P2-002 | Citations + Δ-2 |
| FR-7 | 3 | TASK-P3-002 | 라우팅 |
| FR-8 | 1 | TASK-P1-004 | 예산·dedup |
| FR-9 | 3 | TASK-P3-003 | 한정 모드 |
| FR-10 | 3 | TASK-P3-004 | Context Editing Δ-5 |
| FR-11 | 1 | TASK-P1-005 | SSE 9종 |
| FR-12 | 3 | TASK-P3-005 | SQLite Δ-4 |
| FR-13 | 2 | TASK-P2-003 | 골든셋 Δ-3 |
| FR-14 | 1 | TASK-P1-006 | Feature flag |
| FR-15 | 3 | TASK-P3-006 | 다국어 |
| FR-16 | 1 | TASK-P1-007 | Anthropic 4종 Δ-1 |
| FR-17 | 2 | TASK-P2-004 | Injection Δ-10 |
| FR-18 | 2 | TASK-P2-005 | 멀티턴 |
| FR-19 | 3 | TASK-P3-007 | 권한 + rate-limit Δ-11 |
| FR-20 | 1+3 | TASK-P1-008 + TASK-P3-008 | 핸들러 분리 + parity |
| FR-21 | 2+3 | TASK-P2-002 + TASK-P3-009 | 어댑터 + custom_content |
| NFR-1 | 1+3 | TASK-P1-009 + TASK-P3-010 | best-effort → hard SLO Δ-14 |
| NFR-2 | 3 | TASK-P3-011 | 60k 단일 Δ-5 |
| NFR-3 | 1 | TASK-P1-010 | 보안 다층 |
| NFR-4 | 2 | TASK-P2-006 | 환각률 Δ-7 |
| NFR-5 | 1 | TASK-P1-011 | Multi-provider |
| NFR-6 | 2 | TASK-P2-008 | JSONL 관측성 |
| NFR-7 | 3 | TASK-P3-011 | 마이그레이션 Δ-9 |
| NFR-8 | 3 | TASK-P3-007 | rate-limit Δ-11 |
| NFR-9 | 1 | TASK-P1-012 | CI Δ-3+Δ-12 |
| NFR-10 | 1 | TASK-P1-013 | AsyncLock 90s |
| NFR-11 | 1+3 | TASK-P1-014 + TASK-P3-012 | fallback + circuit breaker Δ-13 |
| NFR-12 | 3 | TASK-P3-013 | lint |
| NFR-13 | 2 | TASK-P2-007 | Caching+Parallel+Context Edit |

**커버리지: 34/34 (FR 21 + NFR 13) — 100%**.

## §9 리스크 및 완화

| 리스크 | 출처 | 완화 |
|---|---|---|
| Anthropic 베타 헤더 deprecation | Feasibility §1 잔존 #1 | TASK-P1-007 soft-disable + 환경변수 외부화. context7 MCP 모니터링. |
| wall-clock p95 SLO 미실측 | Feasibility §1 잔존 #2, AR-4 | TASK-P1-009 베타 best-effort → TASK-P3-010 GA hard SLO 단계화 (Δ-14). |
| 골든셋 라벨 비용 | Feasibility §1 잔존 #3 | TASK-P2-003 30 MVP → 베타 14일 후 60문항 단계화. |
| `@langchain/anthropic` 패스스루 미검증 | Feasibility §1 잔존 #4 | TASK-P1-007 부팅 dry-run + raw SDK 어댑터 fallback 분기. context7 MCP 사전 확인. |
| better-sqlite3 OS 매트릭스 | Feasibility §1 잔존 #5 | TASK-P3-005 GH Actions matrix 사전 검증 + docs/install.md 가이드. |
| MemorySaver thread_id 격리(AR-3) | Feasibility §3.1 | Δ-9 — agenticMode 전환은 다음 세션부터만. TASK-P1-006에서 정책 강제. |
| Indirect injection vs Citations 충돌(AR-7) | Feasibility §3.1 | Δ-10 — TASK-P2-004 user 메시지 wrapping. |
| nightly 골든셋 baseline drift | DR-7 | TASK-P2-003 + TASK-P2-006 회귀 게이트 -3%p / +2%p + baseline.json 동결 PR 거버넌스. |

## §10 용어집

- **ReAct** (Yao 2022): Reasoning + Acting 루프. LLM이 thought → action → observation 반복.
- **Reflexion** (Shinn 2023): self-critique 메시지로 이전 시도 평가 후 재시도. 본 plan은 iter ≥ 4 시 트리거.
- **MCP** (Model Context Protocol): Anthropic 표준 — 도구·리소스 노출 JSON-RPC 프로토콜. DocLight는 `src/routes/mcp.js`에서 구현.
- **SSE** (Server-Sent Events): HTTP 기반 단방향 스트리밍. 9종 이벤트(plan/tool_use_start/tool_use_result/citation/token/error/end/retrieval/evaluation).
- **LangGraph**: LangChain의 상태 그래프 워크플로 엔진. StateGraph + Annotation + MemorySaver checkpointer.
- **MemorySaver**: LangGraph 체크포인터 — `thread_id` 단위로 그래프 상태 저장. 같은 sessionId라도 그래프 컴파일 단위 격리.
- **Annotation**: LangGraph 상태 schema 정의 (`Annotation.Root({...})`).
- **Citations API** (Anthropic): document block 기반 grounding. `{type:'document', source:{...}, citations:{enabled:true}}`.
- **Context Editing** (`clear_tool_uses_20250919` 베타): 60k 토큰 도달 시 tool_use/tool_result 페어링 단위 자동 트리밍.
- **Interleaved Thinking** (`interleaved-thinking-2025-05-14` 베타): 도구 호출 사이 extended thinking 삽입.
- **Indirect Prompt Injection** (Greshake 2023): tool_result 내부 텍스트가 system 격리 우회 시도.
- **Spotlight Pattern** (Anthropic): user 메시지 내 `<tool_result_data>` wrapping + system 지시.
- **Soft-Disable**: 4종 기능 미통과 시 winston warn + 비활성화 후 가동 (vs fail-fast).
- **Circuit Breaker**: 5분 fail-rate ≥ 50% 시 open 30초 — fallback 회로 보호.

## §11 메타

- **plan_contract**: 1.1.0
- **plan_id**: plan-20260429-agentic-chatbot
- **run_id**: 20260429-231506
- **생성일**: 2026-04-29
- **scope_freeze**: false (평가자 통과 후 true)
- **TASK 총수**: 36 (Phase 1 = 15, Phase 2 = 8, Phase 3 = 13)
- **REQ 커버리지**: 34/34 (100%)
- **잔존 위험 (deployment-blocking 0건)**: 5건 (모두 Phase 진행 중 모니터링/완화)
- **참고 도구**: snoworca-planner v2.2.3
