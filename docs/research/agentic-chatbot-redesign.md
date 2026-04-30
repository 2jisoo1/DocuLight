---
title: 에이전틱 챗봇 재설계 연구
description: RAG timeout 문제 분석 및 read-only tool use 기반 에이전트 챗봇 재설계 방향
date: 2026-04-29
tags: [chatbot, rag, agentic, mcp, tool-use, research]
---

# 에이전틱 챗봇 재설계 연구

## 배경 및 문제 정의

DocLight 챗봇은 현재 모든 질문을 RAG 파이프라인으로 처리한다. "이곳의 문서들은 어떤 것이 있나요?" 같은 **광역(broad) 질문**에 대해서도 벡터 검색으로 다수 문서를 가져온 뒤 map-reduce 요약을 시도하다가 **timeout이 발생**한다.

**목표**: LLM에게 read-only 파일 검색 도구 세트를 쥐어주고, LLM이 직접 도구를 선택·호출(plan → act → verify → re-search)하여 답하는 **에이전틱 챗봇**으로 전환한다. C/U/D 도구는 **절대 노출 금지**.

본 문서는 3개 서브에이전트의 병렬 연구 결과를 통합한 것이다.

---

## 1. 현재 RAG 파이프라인 구조 분석

### 1.1 진입 경로

```
POST /api/chatbot/chat
  → src/routes/chatbot.js:32
  → src/controllers/chatbot-controller.js:81 (chat 메서드, SSE 헤더 102, 워크플로우 호출 175)
  → src/services/chatbot/chatbot-service.js:305 (그래프 선택 350-361, graph.stream 378)
  → src/services/chatbot/workflow/graph.js:81 (워크플로우 그래프 정의)
```

세션 동시성은 AsyncLock으로 60초 timeout이 걸려 있고(`chatbot-service.js:50`), 클라이언트 측 timeout은 5분이다(`public/js/chatbot.js:21`).

### 1.2 광역 질문 처리 흐름

`graph.js:81~212`에 정의된 LangGraph 기반 워크플로우는 다음 순서로 실행된다.

1. `contextualizeQuery` — 질문 정규화
2. `classifyQuery` — 쿼리 타입 분류(광역 질문은 `summary`로 판정, graph.js:173)
3. `analyzeRequest` — 요약 요구사항 추출 (graph.js:182)
4. `retrieveDocs` — 벡터 검색 (graph.js:174, 기본 retrievalCount=20)
5. `gradeDocuments` — 관련성 평가
6. **`mapSummarize`** — 검색된 각 문서를 LLM으로 부분 요약 (graph.js:183, `nodes/map-summarize.js:93~174`)
7. **`reduceSummaries`** — 부분 요약 병합 (graph.js:184)
8. END

### 1.3 Timeout이 발생하는 정확한 메커니즘

**병목은 `nodes/map-summarize.js:140`의 `llm.invoke()`**에 있다. 3중 메커니즘으로 실패한다.

| # | 원인 | 위치 |
|---|---|---|
| 1 | **토큰 폭발**: 검색 문서·부분 요약이 모두 상태 객체에 누적되어 입력 토큰이 기하급수적으로 증가 | `token-estimator.js:18~63` |
| 2 | **병렬도 제한**: `maxParallelMaps=3` 으로 N개 문서를 N/3 배치로 순차 처리 | `map-summarize.js:119~162` |
| 3 | **LLM 자체 timeout 부재**: `maxTokens=4096` 만 설정, 호출 자체에 wall-clock 한계 없음 | `llm-factory.js:39~100` |

결과적으로 100개 문서가 검색되면 약 33–34 배치가 직렬로 누적되며, SSE 응답이 5분 클라이언트 timeout을 넘긴다.

### 1.4 LLM·벡터 스택

- LLM 팩토리 (`llm-factory.js:39`): OpenAI / Azure OpenAI / Ollama 지원
- 벡터 저장소 (`vector-store.js:118`): chunkSize=1000, chunkOverlap=200
- FilteredRetriever (`filtered-retriever.js:136`): 오버샘플링 ×3, minSimilarityScore=0.3
- 시스템 프롬프트 (`workflow/prompts.js:13~35`): 한·영 자동 감지, `[Source: filename.md]` 인용 형식

### 1.5 프런트엔드

`public/js/chatbot.js`. SSE 이벤트 `step / retrieval / thinking / token / done / error`를 수신하며 마크다운을 스트리밍 렌더링한다.

---

## 2. 기존 Read-Only 도구 인벤토리

DocLight는 이미 두 개의 **JSON-RPC 2.0 MCP 서버**를 제공하고 있어 에이전트 도구로 그대로 재활용 가능하다.

- `/mcp` — 메인 MCP (11개 도구)
- `/context` — 컨텍스트 MCP (3개 도구)

### 2.1 노출 가능한 read-only 도구

| 도구 | 카테고리 | 입력 | 반환 | 위치 |
|---|---|---|---|---|
| `list_documents` | 트리 | path, useDisplayName | 단일 레벨 목록 | routes/mcp.js:423 |
| `list_full_tree` | 트리 | path, maxDepth, useDisplayName | 재귀 트리 | routes/mcp.js:457 |
| `read_document` | 본문 | path | .md 전체 | routes/mcp.js:503 |
| `{prefix}_get_config` | 메타 | section | 설정 JSON | routes/mcp.js:560 |
| `{prefix}_search` | 검색 | query, limit, path, mode | 키워드 결과 | routes/mcp.js:576 |
| `query_document` | 검색 | path, query, maxTokens | 문서 내 섹션 | routes/mcp.js:646 |
| `summarize_document` | 요약 | path | 목차+핵심점+통계 | routes/mcp.js:666 |
| `{prefix}_smart_search` | 검색 | query, mode(auto/semantic/keyword), … | 하이브리드 검색 | routes/mcp.js:681 |
| `resolve_project` | 메타 | name, version, limit | 프로젝트→경로 매핑 | routes/mcp.js:705 |
| `query_code_examples` | 코드 | query, language, … | 코드 블록 | routes/mcp.js:728 |
| `list_context_documents` | 컨텍스트 | path | description 있는 문서 | routes/context-mcp.js:91 |
| `read_document (ctx)` | 컨텍스트 | path | frontmatter 제외 본문 | routes/context-mcp.js:117 |
| `search_documents (ctx)` | 컨텍스트 | query, … | 텍스트 검색 | routes/context-mcp.js:131 |

추가로 read-only HTTP API: `/api/tree`, `/api/tree/full`, `/api/raw`, `/api/html`, `/api/search`, `/api/download/*`, `/api/admin/tree`, `/api/admin/content`, `/api/admin/file` 등이 존재한다.

### 2.2 절대 노출 금지(C/U/D)

| 도구 | 인증 | 위치 |
|---|---|---|
| `create_document` | X-API-Key | routes/mcp.js:515 ⛔ |
| `delete_document` | X-API-Key | routes/mcp.js:539 ⛔ |
| `POST /api/upload` | Bearer | routes/api.js:32 ⛔ |
| `DELETE /api/entry` | Bearer | routes/api.js:37 ⛔ |
| `PUT /api/admin/content` | Admin | routes/admin-api.js:116 ⛔ |
| `POST /api/admin/create` | Admin | routes/admin-api.js:134 ⛔ |

권한 분리는 **에이전트 도구 레지스트리에 mutating 도구를 등록조차 하지 않음**으로 구현해야 한다(코드 경로 자체가 격리).

### 2.3 누락된 후보 도구

- `list_top_level_dirs` — 최상위 프로젝트 인벤토리
- `get_doc_outline` — 헤딩만 추출 (빠른 탐색)
- `get_file_metadata` — 수정일·크기·태그
- `get_related_docs` — 태그/카테고리 기반 연관
- `count_docs_in_dir` — 디렉토리별 통계

---

## 3. 에이전틱 재설계 방향

### 3.1 아키텍처 다이어그램

```
[User Query]
    │
    ▼
[System Prompt: plan-first 강제]
    │
    ▼
┌── Agent Loop (max N iterations) ─────────────────┐
│  ① PLAN     : <plan> 1-3줄 계획                   │
│  ② ACT      : tool_use 발행 (read-only만)         │
│  ③ OBSERVE  : tool_result 수신                    │
│  ④ VERIFY   : <self_check> 답변 충분?             │
│       └─ 부족 → ② 로 복귀                         │
│       └─ 충분 → ⑤                                 │
│  ⑤ DOUBLE-CHECK : 강제 1회 추가 탐색              │
│  ⑥ ANSWER   : 최종 응답 + 출처(path:line)         │
└──────────────────────────────────────────────────┘
    │
    ▼
[Streamed Response to UI]
```

### 3.2 권장 도구 세트 (read-only)

| 도구 | 용도 | 질문 유형 |
|---|---|---|
| `list_tree(path, depth)` | 디렉토리 트리 | 광역 |
| `list_recent(limit)` | 최근 수정 문서 | 광역 |
| `get_metadata(path)` | 제목/태그/요약 | 둘 다 |
| `search_filename(pattern)` | 파일명 글롭 | 둘 다 |
| `search_fulltext(query, k)` | 본문 키워드 | 핀포인트 |
| `semantic_search(query, k)` | **RAG를 도구로 강등** | 핀포인트 |
| `read_section(path, range)` | 부분 본문 (우선) | 핀포인트 |
| `read_document(path)` | 전체 본문 (마지막 수단) | 핀포인트 |

### 3.3 시스템 프롬프트 골격

```
당신은 DocLight 문서 검색 에이전트입니다. 읽기 전용.
규칙:
1) 답하기 전 반드시 <plan>...</plan> 으로 1-3줄 계획.
2) 도구 호출은 1번에 1개. 결과를 본 뒤 <observe> 1줄 요약.
3) <self_check>에 (a) 현재 근거로 답 가능? (b) 빠진 정보? 명시.
4) 답 가능해 보여도 최소 1회 추가 검증 검색을 수행한다 (over-confidence 방지).
5) 광역 질문("뭐가 있나요/목록")은 list_tree·list_recent 우선.
   핀포인트 질문은 search_fulltext·semantic_search → read_section.
6) 모든 사실 주장은 path:line 출처 인용. 출처 없으면 "확실치 않음".
7) 최대 도구 호출 N회. 초과 시 현재까지 근거로 한정 답변.
```

`<plan>/<self_check>` 태그 누락 시 호스트가 자동 거부·재요청하여 강제력을 높일 수 있다.

### 3.4 라우팅 전략 — 하이브리드 권장

순수 휴리스틱은 오분류 시 막다른 길에, 순수 LLM 위임은 첫 호출이 `read_document` 폭주로 갈 위험이 있다. **질문 길이·키워드(`목록/어떤/전체/recent`)로 첫 도구를 *제안*만 하고, 최종 선택은 LLM에 위임**한다. (추측: 첫 1턴 정확도가 10–20%p 상승하리라 보지만 측정 필요.)

### 3.5 무한루프·예산 통제

| 가드 | 권장값(튜닝 필요) |
|---|---|
| `max_iterations` | 8 |
| `max_tool_calls` | 12 |
| 누적 토큰 budget | 60k input / 4k output |
| 동일 도구·동일 인자 반복 감지 | 2회 시 차단 |
| Per-request wall clock | 45s |

초과 시 "현재까지 근거로 한정 답변" 모드로 전환하고 사용자에게 그 사실을 명시한다.

### 3.6 컨텍스트 폭증 완화

- N턴 이전 `tool_result`는 별도 haiku 호출로 5줄 요약 후 치환
- `read_document`보다 `read_section` 우선
- 토큰 80% 도달 시 자동 요약 트리거
- 매 턴 "지금까지 확인된 사실" scratchpad를 시스템에 주입해 옛 결과를 안전 폐기

### 3.7 UX

- Messages API streaming + 단계별 상태 푸시("계획 중…", "`/guide` 트리 탐색 중…")
- 첫 토큰 5초 내 미수신 시 keepalive ping
- 답변 하단에 호출 도구·인용 path 노출, 👍/👎 버튼으로 회귀 데이터 수집

### 3.8 평가·회귀

- **골든 셋 30–60문항**: 광역 / 핀포인트 / 존재하지 않는 문서 / 모호 질문 / 권한 외 요청
- 메트릭: 정답률, 인용 정확도, 평균 도구 호출 수, 평균 토큰, 환각률, **C/U/D 시도 거부율 = 100%**
- 기존 `test/e2e/` 패턴에 통합, A/B(RAG-only vs Agentic)

### 3.9 핵심 위험과 완화

| 위험 | 완화 |
|---|---|
| 도구 호출 폭주·비용 | iteration·budget 캡 |
| over-confidence 환각 | double-check 강제, 출처 없으면 답변 금지 |
| C/U/D 노출 사고 | 레지스트리 분리 + enum 차단 단위 테스트 |
| 옛 tool_result로 컨텍스트 포화 | 요약·치환 파이프 |
| 첫 도구 오선택 | 휴리스틱 힌트 + few-shot |
| 권한 외 경로 접근 | 도구 내부에서 path 화이트리스트 강제 |

---

## 4. 결론 및 다음 단계

1. **Anthropic Messages API의 `tools` + tool_use loop** 패턴으로 챗봇 핵심을 재구현. 구현 직전 최신 스펙(특히 parallel tool use, tool 정의 prompt caching)은 context7 MCP로 재확인.
2. 기존 MCP 서버 도구를 **그대로 에이전트 도구로 재사용** — 신규 인프라 최소화. `list_tree` / `search_filename` 같은 누락 도구만 추가.
3. RAG는 **`semantic_search` 도구로 강등**하여 광역 질문 timeout 경로를 끊는다.
4. plan / self_check / double-check 태그를 **시스템 프롬프트로 강제**하고 호스트에서 검증.
5. 골든셋과 C/U/D 거부 단위 테스트를 CI에 추가해 회귀 방지.

> 본 문서의 권장값(iteration·token·timeout 수치 등)은 합리적 추정이며 본 구현·측정 단계에서 튜닝이 필요하다.

---

## 부록: 출처

- 현재 RAG 코드 경로 분석: `src/routes/chatbot.js`, `src/controllers/chatbot-controller.js`, `src/services/chatbot/**`, `src/services/chatbot/workflow/**`
- MCP 도구 인벤토리: `src/routes/mcp.js`, `src/routes/context-mcp.js`, `src/routes/api.js`, `src/routes/admin-api.js`, `src/services/mcp/**`, `src/services/tree-service.js`, `src/services/search-service.js`
- 외부 표준: Anthropic Messages API tool use 공개 문서(2024–2025) — 구현 직전 재검증 필요
