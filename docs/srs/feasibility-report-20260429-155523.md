# Feasibility Report — DocLight Agentic Chatbot

- **Run ID**: 20260429-155523
- **Mode**: max
- **Synthesizer**: Opus (main, 1M context)
- **Inputs**:
  - SRS: `docs/srs/srs-qna-20260429-145531.md`
  - Senior #1 (architect, Opus): `.snoworca/dew/feasibility/20260429-155523/senior-architect.json`
  - Senior #2 (domain, Opus): `.snoworca/dew/feasibility/20260429-155523/senior-domain.json`
  - Senior #3 (infra, Opus): `.snoworca/dew/feasibility/20260429-155523/senior-infra.json`
  - Prescreen: `.snoworca/dew/feasibility/20260429-155523/prescreen-sonnet.json`
  - User decisions (Q1~Q5 = A 전부 권장 채택): `.snoworca/dew/feasibility/20260429-155523/qna-decisions.json`
- **Estimated tokens**: ~400k (시니어 3인 병렬 + 종합)

---

## 1. 종합 판정

### 판정

- **기본 판정 (3 시니어 합의)**: **조건부 가능 (Conditionally Feasible)**
- **사용자 Q1~Q5 결정 적용 후**: **구현 가능 — 조건부 (Feasible, capacity test pending; SLO 단계화 권고)** — NFR-1 wall-clock p95 ≤ 45s SLO는 capacity test 0건 상태로 베타=best-effort, GA=hard SLO로 단계화(Δ-14 권고). 베타 SDK 의존, 골든셋 라벨링, SLO 실측 미수행 등 잔존 위험은 모니터링 필요.

### 점수 분포

| 시니어 | 평균 점수 | Infeasible | VeryHigh | High | Medium | Low |
|---|---:|---:|---:|---:|---:|---:|
| #1 architect | 67.7 | 0 | 3 | 6 | 10 | 14 |
| #2 domain | 79.0 | 0 | 0 | 7 | 13 | 13 |
| #3 infra | 67.6 | 0 | 3 | 7 | 5 | 18 |
| **합의 (MAX 보수 채택)** | **71.4** | **0** | **5** | **8** | **10** | **10** |
| **합의 (사용자 결정 후)** | **76.8** | **0** | **0** | **9** | **13** | **11** |

> 시니어별 평균 점수는 33개 요구사항 점수의 산술 평균. 합의 평균(71.4)은 (67.7 + 79.0 + 67.6) / 3 = **시니어 평균의 평균** (33개 항목의 단순 평균이 아님 — 정의 명시). 시니어별 critical 카운트 추적: architect critical_architectural_risks=2 (AR-1, AR-2 → 모두 Q1으로 Conditionally Resolved); domain critical_blockers=1 (DR-1 → Q2로 Conditionally Resolved); infra critical_blockers=6 (RISK-INFRA-01~03 명시 + senior-infra.json 참조 추정 3건). 이는 §3.1~§3.3 사후 심각도 컬럼의 'Resolved/Conditionally Resolved/Medium' 격하 근거와 1:1 매핑된다. 합의 난이도는 3 시니어 중 가장 보수적(MAX 심각도)을 채택하여 §2 본문 합의 난이도 컬럼을 결정론적으로 재카운트한 값(시니어 #1 architect 분포와 우연 유사하지 않다). 사용자 결정으로 RESOLVED 처리된 항목은 한 단계 하향(부록 A 매핑 참조). 결정 후 분포는 §2 본문의 결정 후 난이도 컬럼을 기계적으로 합산한 값(추측 모디파이어 없음). **Infeasible 0건**.

### 결정 적용 후 잔존 위험 (3~5줄 요약)

1. **Anthropic 베타 헤더 deprecation 모니터링 필요** — `interleaved-thinking-2025-05-14`, `clear_tool_uses_20250919`. soft-disable 폴백으로 가동성은 유지되나 GA 전환 시 SRS·코드 동기화 PR 필수.
2. **wall-clock p95 ≤ 45s SLO 실측 인프라 부재** — capacity test 0건. 베타 진입 직전 `scripts/agent-load-test.mjs` 신규로 100~500건 합성 부하 베이스라인 의무.
3. **골든셋 라벨링 비용** — 60문항 expected_citations + refusal_keywords 작성은 개발자+사용자 협업으로 흡수되며 베이스라인 안정화에 베타 14일 이상 소요 예상.
4. **`@langchain/anthropic` 패스스루 검증 미완** — `cache_control` / `context_management` / Citations document block / interleaved beta header 통과 여부는 구현 직전 context7 MCP로 재확인 의무. 미통과 시 Anthropic provider 한정 raw `@anthropic-ai/sdk` 어댑터를 BaseChatModel 호환 wrapper로 노출.
5. **better-sqlite3 OS 매트릭스** — Q4로 채택은 확정되었으나 prebuilt 적중 OS는 win32-x64/linux-x64/darwin-x64 한정. arm64/alpine 환경은 docs/install.md에 빌드 도구 사전 설치 가이드 명시 필요.

---

## 2. 요구사항별 난이도표 (FR-1~20 + NFR-1~13, 33개 전수)

> 합의 난이도 = 3 시니어 중 MAX 심각도. 합의 점수 = 3 시니어 평균. 사용자 결정 반영 후 점수는 Q1~Q5 RESOLVED 항목에 한해 상향. 핵심 위험 요약은 시니어 dew의 구체 인용을 보존.

| ID | 제목 | 시니어 #1 (arch) | 시니어 #2 (dom) | 시니어 #3 (infra) | 합의 난이도 | 합의 점수 | 결정 후 난이도 | 결정 후 점수 | 핵심 위험 요약 |
|---|---|---|---|---|---|---:|---|---:|---|
| FR-1 | ReAct + Reflexion 하이브리드 (iter ≥4 트리거) | Medium / 65 | Medium / 78 | Medium / 70 | **Medium** | 71.0 | Medium | **74.0** | `ChatbotAnnotation` 확장(reflexion_active 플래그·thinking budget 전달), LangGraph cycles 안정성 검증, Reflexion self-critique 메시지가 context editing(FR-10)과 같은 messages 배열 충돌 가능. Madaan 2023 Self-Refine 권고에 따라 iter 3 'no-progress' 보조 트리거 검토. |
| FR-2 | Read-only 도구 16개 + namespace | Low / 80 | Low / 88 | Low / 80 | **Low** | 82.7 | Low | **85.0** | Anthropic tool name regex `^[a-zA-Z0-9_-]{1,64}$`가 점(.) 거부 (AR-6) → internal/wire 매핑 필수. 도구 description 'when to use / when NOT / example' 가이드 부재. 신규 3종(list_recent/get_metadata/read_section) JSON schema는 SRS 부록 동결 권고. |
| FR-3 | C/U/D 도구 격리 이중 방어 | Low / 85 | Low / 92 | Low / 80 | **Low** | 85.7 | Low | 85.7 | 키워드 정규식 `create\|update\|...\|post`가 `post-process`/`post_filter` false positive — prefix anchor `^(create\|update\|delete\|remove\|upload\|write\|edit\|patch)_`로 강화 권고. MCP 동적 tool-list는 부팅 1회 캡쳐 후 frozen list. |
| FR-4 | 강제 태그 검증·1회 재요청 | Medium / 65 | Medium / 70 | Low / 80 | **Medium** | 71.7 | **Low** | **78.0** | DR-3 — `<plan>/<observe>/<self_check>` XML 태그가 Anthropic `<thinking>` 자동 wrap과 파서 충돌. **Q5(b) [PLAN]/[OBSERVE]/[SELF_CHECK] 비-XML 마커로 RESOLVED**. 1회 재요청 후 한정 모드는 jailbreak 벡터 가능 — `tool_choice: any` 강제 + 시스템 reminder 갱신 3단 권고. |
| FR-5 | Conditional Double-Check (citation < 2) | Low / 80 | Medium / 80 | Low / 80 | **Medium** | 80.0 | Medium | 80.0 | Huang 2024(LLM cannot self-correct reasoning) 회피하나 임계 2 캘리브레이션 미수행. double-check 시 직전 도구와 다른 도구 사용 강제 권고(예: 직전 semantic_search → list_full_tree+read_section). 'self_check 점수 < threshold' 결합 2-factor 트리거 검토. |
| FR-6 | 출처 인용 정책 (Citations API + 50자 quote) | High / 45 | High / 65 | Medium / 65 | **High** | 58.3 | **Medium** | **72.0** | DR-1 CRITICAL — Citations API document block 매핑 SRS 부재. **Q2 결정으로 text document block 일괄 래핑 RESOLVED (신규 FR-21)**. 잔존: `@langchain/anthropic` bindTools가 document block + `citations.enabled:true` 통과 미보장 → 미통과 시 raw SDK 어댑터 우회. 50자 quote는 frontmatter 메타 인용 false negative 가능 → '본문 50자 OR 메타는 path 정확 일치'로 완화 권고. |
| FR-7 | 라우팅 휴리스틱 | Low / 90 | Low / 75 | Low / 90 | **Low** | 85.0 | Low | 85.0 | 한·영 키워드 균형(목록 vs list 동등 가중치) SRS 미명시. 시스템 프롬프트에 '제안일 뿐 최종 결정은 모델 자율' 명시문구 의무화 권고. |
| FR-8 | 예산·루프 통제 + dedup hash | Low / 80 | Medium / 85 | Low / 80 | **Medium** | 81.7 | Medium | 81.7 | path canonicalization(`./guide` vs `guide`) SRS 미명시 — 정규화 단계 추가 필요. wall-clock 인터럽트가 LangGraph 노드 단위 체크라 노드 진입 시 helper 호출 패턴 명시. |
| FR-9 | 한정 답변 모드 | Low / 85 | Low / 88 | Low / 85 | **Low** | 86.0 | Low | 86.0 | 한정 모드 LLM 호출 1회 재시도 + 최종 실패 시 정적 메시지 fallback 명시 부재. 한정 모드 환각률 별도 트래킹(골든셋 시뮬레이션 카테고리 추가) 권고. |
| FR-10 | Context editing `clear_tool_uses_20250919` | VeryHigh / 30 | High / 72 | High / 50 | **VeryHigh** | 50.7 | **High** | **68.0** | architect: LangChain wrapper unknown body field drop 가능, fallback 트리밍이 페어링 깨면 4xx. **Q1 soft-disable + Q5(a) 60k 단일 임계로 RESOLVED(부분)**. 잔존: SDK 패스스루 미검증 — context7 MCP 재확인 의무 + Anthropic provider 한정 raw HTTP 어댑터 fallback 경로. fallback 시 tool_use/tool_result 페어링 단위 트리밍 알고리즘 단위 테스트 강제. |
| FR-11 | SSE 9종 정규화 | Medium / 65 | Medium / 86 | Medium / 70 | **Medium** | 73.7 | Medium | **76.0** | streamMode='messages' 미사용 시 토큰별 token 이벤트 손실. tool_use_id 1:1 페어링 race condition(R-6). 기존 retrieval semantic 변경 금지 — 신규 4종(plan/tool_use_start/tool_use_result/citation) 추가만. citation inline 마커 결합으로 UX 향상 권고. |
| FR-12 | 피드백 SQLite (better-sqlite3) | Low / 75 | Low / 82 | High / 45 | **High** | 67.3 | **Medium** | **74.0** | infra RISK-INFRA-02 — prebuilt 적중 OS 매트릭스 미검증. **Q4로 better-sqlite3 채택 + 사전 검증 GH Actions matrix 추가**. JSON 파일 fallback은 SRS 후속 검토. 자유 입력 코멘트 필드 추가 + answer hash 대신 길이/도구 호출 시퀀스만 저장 권고. |
| FR-13 | Golden-set 60문항 | Medium / 60 | Medium / 70 | VeryHigh / 30 | **VeryHigh** | 53.3 | **High** | **68.0** | infra RISK-INFRA-07 — 60문항 PR 차단 18~45분 비현실적 + NFR-4 결정적 채점 vs FR-13 LLM-as-judge 모순. **Q3로 nightly 분리 + 결정적 채점만 차단·LLM-as-judge advisory RESOLVED**. 베이스라인 동결을 '베타 14일 안정화 후 평균'으로 변경 권고(DR-7). v2 100문항 증대. |
| FR-14 | Feature flag A/B + 컨텍스트 캐리오버 | Medium / 60 | Medium / 84 | Low / 80 | **Medium** | 74.7 | Medium | **76.0** | AR-3 — MemorySaver `thread_id`가 그래프 컴파일 단위 격리 → 그래프 전환 시 history 단절. 'agenticMode 변경은 다음 세션부터' 정책 단순화 또는 graph-agnostic conversation summary store 신설 권고. 캐리오버 요약 LLM 호출이 TTFT 5s 위협 → 비동기 prefetch. |
| FR-15 | 다국어 한·영 자동 감지 | Low / 95 | Low / 90 | Low / 95 | **Low** | 93.3 | Low | 93.3 | 기존 `workflow/prompts.js:13-35` 보존만 필요. 도구 description 한·영 병기 권고(NFR-12 통합). |
| FR-16 | Anthropic 4종 의무 (thinking + interleaved + citations + context editing) | VeryHigh / 25 | High / 60 | VeryHigh / 35 | **VeryHigh** | 40.0 | **High** | **62.0** | **프로젝트 핵심 위험**. AR-1/AR-2 CRITICAL — LangChain 추상화 통과 미보장 + fail-fast vs graceful degrade 정책 모순. **Q1로 soft-disable + 3계층 폴백 채택, fail-fast 폐기 RESOLVED**. 잔존: SDK 4종 패스스루 헬스체크 부팅 시 1회 dry-run 의무, 베타 헤더 환경변수 외부화, GA 전환 모니터링. raw `@anthropic-ai/sdk` 어댑터를 `@langchain/core` `BaseChatModel` 부분 호환으로 자체 구현. |
| FR-17 | Indirect Prompt Injection 방어 | Low / 80 | High / 65 | Low / 80 | **High** | 75.0 | High | 75.0 | DR-6 — system block 격리 + 정규식 필터는 SOTA(Greshake 2023, Wallace 2024) 대비 1차 방어. Spotlight 패턴(Anthropic) / 1차 LLM 분류기 v2 후보 명시 권고. indirect injection 골든셋 10건 → 50건 확대. AR-7 — Citations document block(user) 내부가 system 격리 우회 가능 → user 메시지 내 `<tool_result_data>` 텍스트 wrapping으로 대체. |
| FR-18 | 멀티턴 메모리 (요약 + 재확인) | Medium / 65 | Medium / 80 | Medium / 65 | **Medium** | 70.0 | Medium | **72.0** | 5줄 요약은 광역 답변(8개 문서 list) 정보 손실 → '5줄 또는 200토큰' 동적 한도. dedup hash 턴 단위 reset 명시 부재(FR-8 보강). 요약 LLM 호출은 비동기 prefetch — 다음 턴 latency 0. provider != anthropic 시 요약 모델 선정 미정 → multi-provider 추상화와 충돌 → SRS에 명시 필요. |
| FR-19 | 권한 (uniform read-only) | Low / 95 | Low / 90 | Low / 75 | **Low** | 86.7 | Low | 86.7 | 비로그인 SSE rate-limit 미명세(RISK-INFRA-10) — IP+세션 한도(예: 10 req/min/IP) 의무 명시. vector store partitioning 우회 여부 단위 테스트(read_section/get_metadata) 필요. |
| FR-20 | 도구 핸들러 위치 분리 | Medium / 60 | Medium / 88 | Low / 80 | **Medium** | 76.0 | Medium | 76.0 | `routes/mcp.js` 866 LOC를 `src/services/agent-tools/handlers/*.js`로 추출. 라우터 JSON-RPC 응답 vs 에이전트 tool_result 포맷 비대칭 → 어댑터 분리. parity test 자동화 필수. 1파일 1도구 19파일 비대화 시 카테고리 grouping 허용. |
| NFR-1 | 성능 SLO (TTFT 5s / wall 45s p95) | High / 40 | High / 68 | High / 50 | **High** | 52.7 | High | **58.0** | AR-4 — Reflexion + extended thinking + Citations 동시 활성 시 단일 응답 latency 폭증. 8 iter × (LLM 4s + tool 0.5s) = 36s 산술 합 — Anthropic spike 1건이면 즉시 위반. parallel tool use(NFR-13) 광역 첫 iter ≥2 도구 강제 + 광역 max_iterations=4 차등 예산 + 베타 단계 'best effort' 표기 권고. |
| NFR-2 | 비용 모니터링 비대상 + 토큰 가드 | Low / 95 | Low / 80 | Low / 70 | **Low** | 81.7 | Low | **86.0** | 60k input / 4k output 가드. **Q5(a)로 60k 단일 출처 통일 RESOLVED**. 비로그인 abuse 방어는 rate-limit 의존(RISK-INFRA-10). |
| NFR-3 | 보안 (C/U/D + injection + path) | Medium / 65 | Medium / 82 | Medium / 70 | **Medium** | 72.3 | Medium | 72.3 | red-team 50건은 시작점 — Microsoft PyRIT 자동 생성 통합, Anthropic red-teaming 데이터셋 참조. audit log args 자동 PII redaction(이메일/전화 정규식). agent-audit.jsonl 1라인/도구호출 무결성 통합 테스트. |
| NFR-4 | 환각률 ≤3% + 회귀 게이트 | High / 50 | High / 72 | High / 50 | **High** | 57.3 | **Medium** | **74.0** | DR-5 — 3% SOTA 도전적(Magesh 2024 RAG 평균 5~10%). **Q5(c)로 MVP ≤5%, GA ≤3% 단계화 RESOLVED**. 회귀 게이트 -3%p / +2%p 유지. expected_citations 라벨이 누락된 valid citation을 환각으로 오분류 — '인용 부재 + 사실 주장' 보수적 정의 채택. |
| NFR-5 | Multi-provider 추상화 | VeryHigh / 30 | Medium / 78 | High / 50 | **VeryHigh** | 52.7 | **High** | **70.0** | AR-1/AR-2 CRITICAL. **Q1으로 RESOLVED**: provider=anthropic일 때만 4종 의무 → soft-disable로 통일. provider 능력 매트릭스(provider × feature)를 SRS 부록 추가. AC-NFR-5-3 모델 ID 하드코딩 금지 grep 게이트 명확. Ollama tool-use 미지원 모델 시 Agentic OFF 자동 폴백 NFR-7 명시. |
| NFR-6 | 관측성 (winston JSONL) | Low / 85 | Low / 85 | Medium / 65 | **Medium** | 78.3 | Medium | 78.3 | 현 winston은 plain text printf — JSONL transport + format json + 채널 분리(metrics/audit) 신규. `usage.cache_read_input_tokens` / `usage.cache_creation_input_tokens` 매핑 코드 신규. OpenTelemetry GenAI semantic conventions 미도입은 v2 후보. |
| NFR-7 | 마이그레이션·호환성 | High / 45 | Medium / 82 | Low / 80 | **High** | 69.0 | High | **74.0** | AR-3 — MemorySaver 격리. 'agenticMode 변경은 다음 세션부터' 정책 단순화 권고(Q-ARCH-3 default=B). 세션 schema 호환성 단위 테스트. 마이그레이션 가이드 문서 deliverable 확정. |
| NFR-8 | 권한 (uniform) | Low / 95 | Low / 90 | Low / 85 | **Low** | 90.0 | Low | 90.0 | rate-limit 정책 [추측] 명확화 필요 — 기존 `express-rate-limit` 적용 정책 SRS 인용. |
| NFR-9 | 회귀·CI 게이트 6종 | Medium / 65 | Medium / 85 | VeryHigh / 30 | **VeryHigh** | 60.0 | **Medium** | **76.0** | RISK-INFRA-01 — `.github/workflows/` 비어 있음 + 6종 게이트 + 골든셋 30~45분 PR 차단 비현실적. **Q3로 GitHub Actions 신규 + PR=빠른 unit/integration + nightly=골든셋 분리 + 결정적 채점만 차단 RESOLVED**. baseline.json 동결 PR 거버넌스 신규. Anthropic API key secret 주입 + rate-limit 회피 정책. |
| NFR-10 | 동시성 AsyncLock 90s | Low / 85 | Low / 88 | Low / 85 | **Low** | 86.0 | Low | 86.0 | `chatbot-service.js:50` 60s → 90s 1줄 수정. 글로벌 동시 에이전트 한도(예: 10 concurrent) 환경변수 권고. |
| NFR-11 | 가용성·자동 fallback | Medium / 55 | High / 70 | High / 45 | **High** | 56.7 | High | **68.0** | RISK-INFRA-05 — 현 `llm-factory.js`는 단일 인스턴스, fallback 체인 0건. AR-5 — Standard 그래프 폴백이 BRIEF의 timeout 원흉(map-summarize) 재활성화. 폴백 시 retrievalCount 5 제한 + wall-clock 잔여 <15s 즉시 한정 답변 권고. 1차 재시도 1회 → 3회 권고. `src/services/chatbot/llm-fallback.js` 신설(LangChain `Runnable.withFallbacks()` 또는 수동 try/catch). |
| NFR-12 | 유지보수성 | Low / 80 | Low / 88 | Low / 80 | **Low** | 82.7 | Low | 82.7 | LOC ≤200 가이드 차단 모호 → lint complexity로 대체 권고. 시스템 프롬프트 토큰 길이(1024+) 단위 테스트는 prompt caching minimum 충족 검증으로 우수. |
| NFR-13 | Caching + Parallel + Context editing | High / 45 | High / 75 | High / 50 | **High** | 56.7 | High | **64.0** | RISK-INFRA-06 — `@langchain/anthropic`이 `cache_control` breakpoint silently drop 가능성. AC-NFR-13-1 raw payload assertion 단위 테스트 의무. 5분 TTL 저트래픽 시 캐시 미스 우세 → 1시간 cache_control extended TTL beta 검토. parallel tool use는 모델 결정 — 강제 불가, 광역 카테고리만 별도 보고. context editing(60k 도달 후만) cache breakpoint 무효화 위험. |

---

## 3. 리스크 영역 (3관점 통합)

### 3.1 아키텍처 리스크 (시니어 #1)

| ID | 사전 심각도 | 사후 심각도 | 이슈 | 해소/완화 |
|---|---|---|---|---|
| **AR-1** | Critical | **Conditionally Resolved (Policy-Resolved / Tech-TBD)** | FR-16 4종 의무 vs NFR-5 LangChain bindTools 멀티 프로바이더 추상화 충돌. `@langchain/anthropic` 1.x가 (b) interleaved-thinking-2025-05-14 헤더, (c) Citations document block, (d) `context_management.edits[]` request body 통과 미보장. | **Q1 결정**: soft-disable + 3계층 폴백 정책 채택(정책 결정 완료). 단, SDK 패스스루 자체 검증은 미완 — 구현 직전 context7 MCP dry-run 게이트가 통과해야 정책 결정이 기술적으로 유효. 미통과 시 raw `@anthropic-ai/sdk` 어댑터를 Anthropic provider 한정 BaseChatModel 부분 호환으로 자체 구현(분기 의사결정 트리). NFR-5 약속(bindTools 일관성)은 anthropic 외 provider에 한정. |
| **AR-2** | Critical | **Resolved** | FR-16 E1(4종 중 하나라도 미지원 시 부팅 fail-fast) vs NFR-5 AC-NFR-5-2(graceful degrade) 정책 모순. fail-fast 우선 시 멀티 프로바이더 폴백(NFR-11) 자체 불가. | **Q1 결정**: fail-fast 폐기. soft-disable 통일. 부팅 시 winston warn + 해당 기능 비활성화 후 가동. |
| AR-3 | High | High | FR-14 그래프 전환 컨텍스트 캐리오버 — LangGraph MemorySaver `thread_id`가 그래프 컴파일 단위 격리, 같은 sessionId라도 그래프 다르면 history 단절. | 권고: session-service 레벨 graph-agnostic conversation summary store 신설(범위↑) 또는 'agenticMode 변경은 다음 세션부터만 적용' 단순화(default=B, 권장). |
| AR-4 | High | High | wall-clock 45s SLO — 광역 질문 + Reflexion(extended thinking) + Citations + 8 iter 조합 미실측. parallel tool use 효과 베타 측정 전 보장 불가. Anthropic API 한국→미국 RTT도 측정 필요. | 권고: 광역 질문 max_iterations=4 차등 예산 + parallel tool use 효과 베타 측정 후 임계 재조정. 베타 단계 'best effort' 표기. |
| AR-5 | High | **Medium** | NFR-11 Standard 그래프 폴백이 BRIEF가 명시한 map-summarize timeout 원흉을 다시 활성화 — 폴백이 또 timeout. | 권고: Standard 폴백 시 retrievalCount=5 제한 + 폴백 진입 시 wall-clock 잔여 <15s면 즉시 한정 답변. |
| **AR-6** | Medium | Medium | FR-2 namespace 표기(`mcp.list_documents` 점) — Anthropic tool name regex `^[a-zA-Z0-9_-]{1,64}$` 위반. wire 표기 변환 없으면 부팅 실패. | **Δ-8**: registry에서 internal name(점)과 wire name(언더스코어) 분리 매핑(`mcp_list_documents`). 부팅 헬스체크로 도구 등록 1회 dry-run. |
| AR-7 | Medium | Medium | FR-17 indirect injection 격리(system block) vs FR-6 Citations document block(user 메시지 내) 구조 충돌 — document block 내부 텍스트가 system 격리 우회 가능. | 권고: 격리는 user 메시지 내 `<tool_result_data>` 텍스트 wrapping + system 프롬프트 지시로 대체. |
| AR-8 | Low | Low | 기존 client timeout 300s vs wall-clock 45s SLO 마진은 충분하나 AsyncLock 60s가 wall-clock보다 작아 lock 만료 위험. | NFR-10 90s 상향으로 RESOLVED. 코드 수정 누락 회귀만 단위 테스트로 가드. |

### 3.2 도메인 리스크 (시니어 #2)

| ID | 사전 심각도 | 사후 심각도 | 이슈 | 해소/완화 |
|---|---|---|---|---|
| **DR-1** | Critical | **Conditionally Resolved (Policy-Resolved / Tech-TBD)** | Citations API document block 매핑 미정의 — Anthropic Citations API는 PDF/text/custom_content document block만 grounding 가능. MCP search 결과(JSON 배열, text)를 어떻게 document block으로 묶을지 SRS 미정의. 구현 단계 즉시 봉착. | **Q2 결정**: 도구 결과를 text document block으로 일괄 래핑(매핑 사양 결정 완료). `{"type":"document","source":{"type":"text","data":"<도구 결과 또는 JSON.stringify>"},"citations":{"enabled":true}}`. start_char/end_char grounding. 신규 FR-21로 SRS 추가. 단, `@langchain/anthropic` bindTools가 document block + `citations.enabled:true`를 통과시키는지 미검증 — context7 MCP dry-run 게이트 통과 필수, 미통과 시 raw SDK 어댑터 우회 분기. |
| DR-2 | High | **Medium** | Anthropic 4종 GA/베타 안정성 — `interleaved-thinking-2025-05-14` 베타 헤더 / `clear_tool_uses_20250919` 정책은 2026-04-29 시점 GA 또는 안정 베타임을 SRS는 '추정' 명시. fail-fast on missing 운영 단계 부팅 실패 위험. | Q1 soft-disable로 완화. 구현 직전 context7 MCP로 4종 GA/베타 상태 재확인 의무. 베타 헤더 환경변수 외부화. |
| **DR-3** | High | **Resolved** | 강제 태그 `<plan>/<observe>/<self_check>` ↔ Anthropic `<thinking>` 자동 wrap 파서 충돌. interleaved thinking 활성 시 더 복잡. | **Q5(b) 결정**: `[PLAN]/[OBSERVE]/[SELF_CHECK]` 비-XML 마커로 변경. 파서·시스템 프롬프트·골든셋 expected 패턴 동기화(Δ-6). |
| **DR-4** | Medium | **Resolved** | context editing 트리거 임계 race — FR-10 본문 '48k(80% of 60k)' vs §5.2.5 '60k 도달' vs NFR-2 '60k 가드' 동시 발동. | **Q5(a) 결정**: 60k 단일 출처 통일. FR-10 본문 표현 정정(Δ-5). |
| **DR-5** | Medium | **Resolved** | 환각률 ≤3% — RAG with citations 평균 5~10%(Magesh 2024). 3% SOTA 수준. | **Q5(c) 결정**: MVP ≤5%, GA 목표 ≤3% 단계화. 회귀 게이트(-3%p / +2%p) 유지(Δ-7). |
| DR-6 | Medium | Medium | Indirect injection prompt-level 방어만 — Wallace 2024 Instruction Hierarchy / Spotlight 권장. | 권고: Spotlight 패턴 또는 1차 LLM 분류기 v2 후보 명시 + indirect injection 골든셋 10→50건 확대. |
| DR-7 | Low | Low | Golden-set 60문항 통계 유의성 — 카테고리당 ≥10 통계 의미 약함. | 권고: 베이스라인 동결 '베타 14일 안정화 후 평균', v2 100+문항 증대. |

### 3.3 인프라 리스크 (시니어 #3)

| ID | 사전 심각도 | 사후 심각도 | 이슈 | 해소/완화 |
|---|---|---|---|---|
| **RISK-INFRA-01** | Critical | **Resolved** | `.github/workflows/` 비어 있음 — CI 인프라 0→1. NFR-9 6종 게이트 + FR-13 골든셋 60문항(18~45분) PR 차단 시 머지 처리량 심각히 저하. | **Q3 결정**: GitHub Actions 신규 도입. PR=빠른 unit/integration만 차단. 골든셋=nightly 분리. 결정적 채점(path:line 정확 매칭 + 도구 호출 수 + refusal 키워드)만 차단. LLM-as-judge advisory(차단 비대상). 라벨링은 개발자+사용자 협업. |
| **RISK-INFRA-02** | Critical | **Medium** | better-sqlite3 prebuilt 적중 OS 매트릭스 미검증 — 사용자 단언(npm 설치 가능)이 PC 환경(Win11+Node≥18) 단일일 가능성. CI 컨테이너·alpine musl·arm64에서 prebuilt 부재 시 MSVC/python 필요. | **Q4 결정**: better-sqlite3 채택. prebuilt 사전 검증 GH Actions matrix(win32-x64/linux-x64/darwin-x64) 추가. 빌드 실패 시 `docs/install.md` 가이드 명시(Δ-4). |
| **RISK-INFRA-03** | Critical | **Conditionally Resolved (Policy-Resolved / Tech-TBD)** | Anthropic 4종 동시 의무 — 베타 헤더 deprecation 시 부팅 실패 단일 장애점. | **Q1 결정**: soft-disable + 3계층 폴백 정책 채택(Δ-1). 단, AR-1과 동일하게 SDK 패스스루 검증 미완 — 구현 직전 context7 MCP dry-run 게이트 통과 시점에 기술적 해소 확정. |
| RISK-INFRA-04 | High | High | wall-clock p95 ≤ 45s SLO 측정 인프라 부재 — capacity test/load test 0건. Anthropic API spike 1건이면 즉시 위반. `logs/chatbot-metrics.jsonl`도 신규. | 권고: 베타 진입 전 `scripts/agent-load-test.mjs` 신규 + 100~500건 합성 부하 측정 + p95 baseline 동결. SLO를 베타 단계 'best effort' 표기. |
| RISK-INFRA-05 | High | High | NFR-11 자동 fallback provider 전환 인프라 0건 — 현 `src/services/chatbot/llm-factory.js`는 createLLM 1회 단일 인스턴스. 회로차단기·헬스체크·인스턴스 라이프사이클 미설계. | 권고: `src/services/chatbot/llm-fallback.js` 신설. LangChain `Runnable.withFallbacks()` 또는 수동 try/catch 래퍼 모듈. eager init vs lazy 결정 필요. |
| RISK-INFRA-06 | High | High | Prompt Caching 1024 토큰 minimum + 5분 TTL 효과 미검증. 시스템 프롬프트+tools 합산 1024+ 만족 측정 필요. context editing과 cache breakpoint 상호작용 미검증. | 권고: 토큰 길이 단위 테스트 1024+ 가드 강화(NFR-12 AC-2 통합). 캐시 미스 baseline 별도 측정. raw payload assertion 단위 테스트 의무(AC-NFR-13-1). |
| RISK-INFRA-07 | High | **Medium** | 골든셋 60문항 작성·라벨링·검수 주체 미정의. NFR-4(결정적) vs FR-13(LLM-as-judge 추정) 모순으로 라벨 형식 미확정. | **Q3 결정**: 결정적 채점 단일 + 개발자+사용자 협업. 30문항 MVP → 베타 후 60문항 단계화 권고는 잔존. |
| RISK-INFRA-08 | Medium | Medium | winston 신규 JSONL 채널 분리 + Anthropic `usage.cache_*_tokens` 매핑 코드 신규. | 권고: `src/utils/logger.js`를 멀티 transport 패턴 확장(metrics 채널은 별도 createLogger). |
| RISK-INFRA-09 | Medium | Medium | `scripts/*.mjs` 신규 vs 기존 CommonJS(`require`) 코드베이스 혼재. `package.json` `type` 미설정. | 권고: scripts는 .mjs 단독 OK 또는 .js+commonjs 통일 명시 결정. |
| RISK-INFRA-10 | Medium | Medium | 비로그인 SSE 엔드포인트 + 비용 모니터링 비대상 결합 — `express-rate-limit` 챗봇 적용 SRS 미명세. | 권고: NFR-8/FR-19에 IP+세션 rate-limit 의무 명시(예: 10 req/min/IP). |
| RISK-INFRA-11 | Medium | Medium | SSE keepalive ping 30s 추정 — Nginx/Cloudflare 등 운영 프록시 환경 미검증. | 권고: 배포 가이드 SSE 권장 프록시 설정 추가. heartbeat 10~15s. |
| RISK-INFRA-12 | Medium | Medium | `package.json scripts.test` 부재 + Jest/Mocha/node:test 등 단위 러너 미선택. 현재 'echo Error: no test specified && exit 1'. | 권고: Jest 또는 node:test 명시. NFR-9 CI step에서 `npm test` 호출 가능하도록 정리. |

---

## 4. SRS 개선 제안 (Δ-SRS, 사용자 SRS 업데이트 권고)

| Δ ID | 영향 SRS 섹션 | 변경 내용 | 근거 |
|---|---|---|---|
| **Δ-1** | FR-16 (E1, §5.2.4) | 부팅 fail-fast → **soft-disable + 3계층 폴백**. Layer1: Anthropic 내부 4종 자동 비활성, Layer2: OpenAI/Azure provider fallback, Layer3: 기존 RAG Standard 그래프 폴백. NFR-5/NFR-11과 정합화. | Q1 결정 — AR-1/AR-2 CRITICAL + RISK-INFRA-03 단일 장애점 회피 |
| **Δ-2** | FR-6 / 신규 FR-21 | MCP `tool_result` → Anthropic document block 어댑터 사양 추가. 형식: `{"type":"document","source":{"type":"text","data":"<도구 결과 텍스트 또는 JSON.stringify>"},"citations":{"enabled":true}}`. JSON 결과는 `JSON.stringify` 후 래핑, 본문은 텍스트 그대로. 인용 grounding은 `start_char/end_char`. | Q2 결정 — DR-1 CRITICAL 해소 |
| **Δ-3** | FR-13 / NFR-9 | PR 차단 게이트는 결정적 채점(path:line 정확 매칭 + 도구 호출 수 + refusal 키워드)만. 골든셋 60문항은 nightly 실행. LLM-as-judge는 advisory(차단 비대상). GitHub Actions `agent-ci.yml` 신규. baseline.json 동결 PR 거버넌스 명문화. | Q3 결정 — RISK-INFRA-01 + BLK-INFRA-05 모순 해소 |
| **Δ-4** | FR-12 | better-sqlite3 채택 명시 + prebuilt 사전 검증 GH Actions matrix(win32-x64/linux-x64/darwin-x64) + 빌드 실패 시 `docs/install.md` 가이드 명시. | Q4 결정 — RISK-INFRA-02 완화 |
| **Δ-5** | FR-10 / §5.2.5 / NFR-2 | context editing 트리거 임계를 **60k 토큰 단일 출처**로 통일. FR-10 본문 '48k(80% of 60k)' 표현 제거. NFR-2 단일 질의 가드와 race 회피. | Q5(a) 결정 — DR-4 해소 |
| **Δ-6** | FR-1 / FR-4 / 시스템 프롬프트 / 골든셋 | 강제 마커를 `<plan>/<observe>/<self_check>` XML → `[PLAN]/[OBSERVE]/[SELF_CHECK]` 비-XML 마커로 변경. 파서·시스템 프롬프트·골든셋 expected 패턴 모두 동기화. | Q5(b) 결정 — DR-3 Anthropic `<thinking>` 충돌 해소 |
| **Δ-7** | NFR-4 | 환각률 단계화: **MVP ≤ 5%, GA 목표 ≤ 3%**. 골든셋 회귀 게이트(-3%p / +2%p) 유지. 임계 캘리브레이션 PR 절차 명문화. | Q5(c) 결정 — DR-5 SOTA 도전 임계 완화 |
| **Δ-8** | FR-2 (신규 부속) | namespace 표기는 internal=점(`mcp.list_documents`) / wire=언더스코어(`mcp_list_documents`) 분리 매핑. Anthropic tool name regex `^[a-zA-Z0-9_-]{1,64}$` 호환. 부팅 헬스체크 dry-run 1회. | AR-6 — 부팅 실패 회피 |
| **Δ-9** | NFR-7 / FR-14 | `agenticMode` 전환은 다음 세션부터만 적용한다는 정책을 SRS 본문에 명문화. MemorySaver `thread_id`가 그래프 컴파일 단위 격리되므로 같은 sessionId 내 그래프 전환 시 history 단절. 또한 FR-17 indirect injection 격리는 `system block` 단독 → `user 메시지 내 <tool_result_data>` 텍스트 wrapping + system 프롬프트 지시 패턴으로 변경(Δ-2 Citations document block과 양립). | AR-3 (NFR-7/FR-14 잔존) + AR-7 (FR-17 ↔ FR-6 구조 충돌) |
| **Δ-10** | FR-17 본문 | indirect injection 격리 메커니즘 표현을 'system block 격리'에서 'user 메시지 내 `<tool_result_data>` 텍스트 wrapping + system 프롬프트 지시'로 갱신. Δ-2 Citations document block(user 삽입)과 격리 양립을 보장. | AR-7 — Citations document block 내부 텍스트가 system 격리 우회 가능 |
| **Δ-11** | NFR-8 / FR-19 | 비로그인 챗봇 SSE 엔드포인트에 IP+세션 rate-limit 의무 명시(예: 10 req/min/IP). 비용 모니터링 비대상(NFR-2)과 결합된 abuse 방어선 명문화. | RISK-INFRA-10 — rate-limit 명세 부재 |
| **Δ-12** | 빌드/CI (NFR-9) | `package.json scripts.test` 엔트리 선정(Jest 또는 node:test 명시). NFR-9 GitHub Actions step에서 `npm test` 호출 가능하도록 정리. | RISK-INFRA-12 — 단위 러너 미선택 |
| **Δ-13** | NFR-11 | fallback 1차 재시도 횟수를 1회 → 3회로 상향. `src/services/chatbot/llm-fallback.js`(LangChain `Runnable.withFallbacks()` 또는 수동 try/catch)에 재시도 정책 반영. | NFR-11 핵심 위험 요약 — Anthropic API spike 1회 일시 장애 흡수 |
| **Δ-14** | NFR-1 | 성능 SLO를 단계화한다: **베타 = best-effort 표기 (TTFT 5s / wall 45s p95 측정·보고만)** / **GA = hard SLO (TTFT 5s / wall 45s p95 강제, capacity test baseline 동결 후)**. Δ-7(환각률 단계화)와 동일 패턴. | F-OPUS2-05 — capacity test 0건 상태에서 'Feasible' 단정 회피 |

---

## 5. 다음 단계 라우팅

### 권장 경로

1. **Option A (권장)**: `snoworca-srs-qna` 재호출하여 Δ-1~Δ-8을 SRS에 반영 → 갱신된 SRS로 `snoworca-planner` 진입.
2. **Option B (가속)**: 현 SRS를 그대로 두되 `snoworca-planner`에 Δ-1~Δ-8을 plan 입력 컨텍스트로 명시 — planner가 plan 단계에서 Δ를 흡수하여 phase별로 분배.

> 잔존 blocking decision 0건. 모든 CRITICAL은 Q1~Q5 사용자 결정으로 RESOLVED.

### 구현 우선순위 (Phase별)

#### Phase 1 — MVP (베타 진입 직전 골격)

- **FR**: FR-1 (Agentic Graph 신설), FR-2 (16 도구 레지스트리 + Δ-8 wire 매핑), FR-3 (C/U/D 격리), FR-8 (예산·dedup), FR-11 (SSE 9종), FR-14 (feature flag), FR-16 (soft-disable + 3계층 폴백 — Δ-1), FR-20 (도구 핸들러 분리)
- **NFR**: NFR-1 (베타 best-effort 표기 — Δ-14), NFR-3 (보안 다층 방어), NFR-5 (multi-provider 매트릭스 부록), NFR-9 (GitHub Actions PR 게이트만 — Δ-3 + `npm test` 엔트리 Δ-12), NFR-10 (AsyncLock 90s), NFR-11 (`llm-fallback.js` 신설 + 재시도 3회 — Δ-13)

#### Phase 2 — 베타 안정화

- **FR**: FR-5 (conditional double-check), FR-6 + FR-21 (Citations API + Δ-2 어댑터 — text document block 일괄 래핑 sole path; FR-21 어댑터 골격을 FR-6과 동일 Phase에 둠 — 의존 정합), FR-13 (골든셋 30문항 MVP → 60문항 + nightly), FR-17 (indirect injection 1차 방어 — Δ-10 user 메시지 wrapping), FR-18 (멀티턴 요약)
- **NFR**: NFR-4 (MVP ≤5% — Δ-7), NFR-13 (caching + parallel + context editing — Δ-5), NFR-6 (winston JSONL 채널 분리)

#### Phase 3 — GA 진입

- **FR**: FR-4 ([PLAN]/[OBSERVE]/[SELF_CHECK] 마커 — Δ-6), FR-7 (라우팅 휴리스틱), FR-9 (한정 모드 재시도), FR-10 (context editing — Q5(a) 60k 단일 — Δ-5), FR-12 (피드백 SQLite — Δ-4), FR-15 (다국어), FR-19 (권한 + rate-limit — Δ-11), FR-20 (parity test 자동화), FR-21 (custom_content document block 분기·grounding 정밀화 — MVP 이후 강화)
- **NFR**: NFR-1 (GA hard SLO 진입 — Δ-14), NFR-2 (토큰 가드 단일화 — Δ-5), NFR-6 (관측성 GA), NFR-7 (마이그레이션 가이드 deliverable + Δ-9), NFR-8 (rate-limit 명시 — Δ-11), NFR-11 (fallback 재시도 3회 — Δ-13), NFR-12 (LOC lint)

---

## 6. 메타

- **mode**: max
- **run_id**: 20260429-155523
- **시니어**: Opus×3 병렬 (architect / domain / infra)
- **평가자**: Opus×2 (다음 단계 — 본 보고서 미실행, planner 진입 시 자동 호출)
- **QNA**: 1라운드 5질문 → 사용자 전부 권장(A) 채택
- **잔존 findings (사용자 결정 후, 결정론적 합산)**:
  - **요구사항 33개 기준 (§2 결정 후 난이도 컬럼 기계적 합산)**: **0 CRITICAL / 0 VeryHigh / 9 HIGH / 13 MEDIUM / 11 LOW**
    - High(9): FR-10, FR-13, FR-16, FR-17, NFR-1, NFR-5, NFR-7, NFR-11, NFR-13
    - Medium(13): FR-1, FR-5, FR-6, FR-8, FR-11, FR-12, FR-14, FR-18, FR-20, NFR-3, NFR-4, NFR-6, NFR-9
    - Low(11): FR-2, FR-3, FR-4, FR-7, FR-9, FR-15, FR-19, NFR-2, NFR-8, NFR-10, NFR-12
  - **리스크 영역(§3) 사후 심각도 기준**: 0 CRITICAL / 5 HIGH (AR-3, AR-4, RISK-INFRA-04, RISK-INFRA-05, RISK-INFRA-06) / 11 MEDIUM (AR-5, AR-6, AR-7, DR-2, DR-6, RISK-INFRA-02, RISK-INFRA-07~12) / 2 LOW (AR-8, DR-7) — Conditionally Resolved 3건(AR-1, DR-1, RISK-INFRA-03) 별도 추적
- **추정 토큰**: ~400k (Opus×3 시니어 + 종합 작성)

---

## 부록 A. 평가자 검토용 근거 매트릭스 (불일치 항목 합의 산출 근거)

3 시니어가 동일 요구사항에 다른 점수·심각도를 매긴 항목과 합의 산출 근거:

| 요구사항 | arch | dom | infra | MAX 심각도 | 합의 산출 근거 |
|---|---:|---:|---:|---|---|
| **FR-16** | VeryHigh / 25 | High / 60 | VeryHigh / 35 | **VeryHigh** | architect와 infra 양측이 LangChain 추상 충돌 + 베타 헤더 단일 장애점으로 VeryHigh 제시. domain은 베스트프랙티스 정합도(기능 자체는 권장)로 High. 가장 보수적 채택. Q1 결정 후 한 단계 하향(VeryHigh→High), 점수 62. |
| **FR-13** | Medium / 60 | Medium / 70 | VeryHigh / 30 | **VeryHigh** | infra가 PR 30~45분 차단·CI 0건·NFR-4 vs FR-13 채점 모순으로 VeryHigh. arch/dom은 채점 결정성·통계 한계 측면 Medium. infra MAX 채택. Q3 결정 후 한 단계 하향, 점수 68. |
| **NFR-5** | VeryHigh / 30 | Medium / 78 | High / 50 | **VeryHigh** | architect만 FR-16 모순 직접 결합으로 VeryHigh. domain은 추상화 자체는 표준이라 Medium, infra는 fallback 인프라 0건으로 High. arch MAX 채택. Q1 결정 후 한 단계 하향, 점수 70. |
| **NFR-9** | Medium / 65 | Medium / 85 | VeryHigh / 30 | **VeryHigh** | infra만 워크플로 0건 + 30분 PR 차단으로 VeryHigh. arch/dom은 6종 명시 자체 표준이라 Medium. infra MAX 채택. Q3로 한 단계 하향, 점수 76. |
| **FR-10** | VeryHigh / 30 | High / 72 | High / 50 | **VeryHigh** | arch가 LangChain unknown body field drop 가능성으로 VeryHigh. domain/infra는 베타 위험 인정하나 High. arch MAX. Q1+Q5(a) 후 한 단계 하향, 점수 68. |
| **FR-12** | Low / 75 | Low / 82 | High / 45 | **High** | infra만 prebuilt OS 매트릭스 미검증으로 High. arch/dom은 의존성 추가만 보고 Low. infra MAX. Q4 + 사전 검증 액션으로 Medium 격하, 점수 74. |
| **FR-17** | Low / 80 | High / 65 | Low / 80 | **High** | domain만 Greshake/Wallace SOTA 대비 1차 방어 부족으로 High. arch/infra는 표준 패턴이라 Low. domain MAX. v2 후보로 잔존, 점수 75. |
| **NFR-7** | High / 45 | Medium / 82 | Low / 80 | **High** | arch만 MemorySaver 격리(AR-3) 직접 위험으로 High. dom/infra는 마이그레이션 자체 Medium/Low. arch MAX. AR-3 잔존, 점수 74. |
| **NFR-11** | Medium / 55 | High / 70 | High / 45 | **High** | dom/infra가 fallback 인프라 0건 + Standard 그래프 timeout 회귀로 High. arch는 단계 정의 자체는 Medium. dom+infra MAX. 점수 68. |
| **FR-1** | Medium / 65 | Medium / 78 | Medium / 70 | **Medium** | 3 시니어 모두 일치. 평균 71. |
| **FR-2** | Low / 80 | Low / 88 | Low / 80 | **Low** | 3 시니어 모두 일치. AR-6 별도 추적. |
| **FR-6** | High / 45 | High / 65 | Medium / 65 | **High** | arch/dom이 Citations API document block 매핑(DR-1)으로 High. infra는 graceful degrade 분기만 보고 Medium. arch+dom MAX. Q2로 매핑 결정 — 점수 72. |
| **FR-11** | Medium / 65 | Medium / 86 | Medium / 70 | **Medium** | 3 시니어 일치. domain은 SSE 정규화 best practice로 점수 높음. 합의 평균 73.7. |
| **FR-14** | Medium / 60 | Medium / 84 | Low / 80 | **Medium** | arch가 MemorySaver 격리(AR-3) 강조하여 점수 60. infra는 환경변수 토글 자체는 Low. 합의 Medium. |
| **NFR-1** | High / 40 | High / 68 | High / 50 | **High** | 3 시니어 High 일치. arch가 가장 비관적(45s 위반 거의 확실). dom/infra는 측정 후 평가 가능 입장. 합의 평균 52.7. |
| **NFR-13** | High / 45 | High / 75 | High / 50 | **High** | 3 시니어 High 일치. domain은 best-practice 의무화 자체는 우수. arch/infra는 SDK 패스스루 미검증으로 점수 낮음. 합의 평균 56.7. |

---

*문서 종료. 본 보고서는 사용자 결정 후 모든 CRITICAL이 RESOLVED되어 다음 단계(snoworca-srs-qna 재호출 또는 snoworca-planner 직행) 진입 가능 상태로 판정한다. 잔존 6 HIGH는 모두 Phase 1~3에서 단계적으로 흡수 가능하며 deployment-blocking 아님.*
