# DocLight 에이전틱 챗봇 마이그레이션 가이드

> NFR-7, Δ-9 — agenticMode 전환 절차 및 세션 호환성

## 개요

DocLight 에이전틱 챗봇은 기존 Standard RAG 그래프(단일 retrieval → grade → generate 루프)에서 LangGraph 기반 ReAct + Reflexion 하이브리드 그래프로 전환됩니다. 두 그래프는 **Feature Flag A/B**(`agenticMode`)로 병행 운영되며, 사용자별·세션별로 단계적 전환이 가능합니다.

---

## 1. agenticMode 전환 타이밍 (Δ-9)

**`agenticMode` 변경은 다음 세션부터 적용됩니다.**

- 현재 세션 중에 `config.json5`의 `agenticMode` 값을 변경해도 진행 중인 세션에 즉시 반영되지 않습니다.
- 변경 사항은 새 세션(`POST /chat` 첫 요청, 즉 새 `threadId` 생성 시점)부터 적용됩니다.
- 이는 LangGraph MemorySaver가 `thread_id` 단위로 상태를 격리하기 때문입니다(아래 §3 참조).

### 운영 절차

```
1. config.json5 수정: chatbot.agenticMode = "B"   (또는 "A")
2. 애플리케이션 재시작 불필요
3. 기존 세션: 기존 그래프(Standard) 계속 사용
4. 신규 세션: 변경된 그래프(Agentic) 사용 시작
```

---

## 2. 세션 스키마 호환성

Standard 그래프와 Agentic 그래프는 **공통 상태 스키마**를 공유합니다.

### 공통 필드 (두 그래프 모두 사용)

| 필드 | 타입 | 설명 |
|---|---|---|
| `messages` | `BaseMessage[]` | 대화 히스토리 (messagesStateReducer) |
| `threadId` | `string` | 세션 식별자 |
| `error` | `object\|null` | 에러 정보 |
| `queryType` | `string` | 질의 분류 결과 |
| `retrievedDocs` | `Document[]` | 검색된 문서 |
| `currentStep` | `string` | 현재 워크플로우 단계 |
| `summary` | `string` | 대화 요약 |

### Agentic 전용 필드 (Standard에서는 기본값 사용)

| 필드 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| `reflexion_active` | `boolean` | `false` | Reflexion self-critique 활성 여부 |
| `iteration` | `number` | `0` | ReAct 루프 현재 반복 횟수 |
| `thinking_budget` | `number` | `0` | 사용된 thinking 예산 |
| `dedup_hashes` | `object` | `{}` | 도구 호출 dedup 해시 테이블 |

Standard → Agentic 전환 시 추가 필드는 자동으로 기본값으로 초기화됩니다.  
Agentic → Standard 역전환 시 추가 필드는 무시됩니다(하위 호환).

---

## 3. MemorySaver 격리 (Δ-9)

LangGraph MemorySaver는 **`thread_id` 단위로 체크포인트를 격리**합니다.

```
thread_id = sessionId  (예: "sess_abc123")
```

- Standard 그래프와 Agentic 그래프는 각각 별도의 MemorySaver 인스턴스를 사용합니다.
- 동일한 `sessionId`로도 그래프 전환 시 이전 히스토리가 인계되지 않습니다.
- 따라서 agenticMode 변경은 기존 세션의 대화 흐름에 영향을 주지 않습니다.

### 다이어그램

```
세션 A (Standard 그래프)
  threadId="sess_001" → MemorySaver[Standard] → checkpoint 격리

세션 B (Agentic 그래프, agenticMode 변경 후 신규 세션)
  threadId="sess_002" → MemorySaver[Agentic] → 독립 checkpoint
```

---

## 4. 토큰 한도 단일화 (Δ-5, NFR-2)

`src/services/agent-tools/token-guard.js`가 토큰 한도의 **단일 출처(Single Source of Truth)**입니다.

| 항목 | 한도 | 상수 |
|---|---|---|
| 최대 입력 토큰 | **60,000** | `MAX_INPUT_TOKENS` |
| 최대 출력 토큰 | **4,000** | `MAX_OUTPUT_TOKENS` |

코드에서 60,000 또는 4,000을 하드코딩하지 말고 `token-guard.js`를 import하여 사용하십시오.

```js
const { MAX_INPUT_TOKENS, checkInputLimit } = require('../agent-tools/token-guard');

if (!checkInputLimit(estimatedTokens)) {
  // 입력 토큰 한도 초과 처리
}
```

---

## 5. 전환 체크리스트

- [ ] `config.json5`의 `chatbot.agenticMode` 값 확인 (`"A"`: Standard, `"B"`: Agentic)
- [ ] 기존 세션 사용자에게 세션 재시작 안내 (필요 시)
- [ ] Agentic 그래프 feature flag 활성화 후 SSE 이벤트 정상 수신 확인
- [ ] `token-guard.js`의 60k 한도가 모든 토큰 체크 경로에서 사용되는지 확인
- [ ] 롤백 시 `agenticMode = "A"` 복원 → 기존 Standard 그래프 즉시 적용(신규 세션부터)

---

## 6. 관련 문서

- `docs/srs/srs-qna-20260429-145531.md` — NFR-2, NFR-7, Δ-5, Δ-9 원본 요구사항
- `src/services/agent-tools/token-guard.js` — 토큰 한도 단일 출처
- `src/services/chatbot/workflow/agentic-graph.js` — Agentic 그래프 구현
- `src/services/chatbot/chatbot-service.js` — Feature Flag A/B 라우팅
