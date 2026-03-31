---
title: DocLight MCP 도구명을 config ui.title 기반 동적 생성으로 변경
project: DocLight
date: 2026-03-29
type: enhancement
tech_stack: Node.js + Express (CJS)
code_path: C:\Work\git\DocLight\src\routes\mcp.js
---

# DocLight MCP 도구명을 config ui.title 기반 동적 생성으로 변경

## 1. 의도 및 요구사항

### 1.1 목적
DocLight MCP 서버의 하드코딩된 "DocuLight" 도구명/서버명을 `config.json5`의 `ui.title` 값으로 동적 생성하여, DocuLightViewer MCP 서버와의 명칭 충돌을 해소한다.

### 1.2 배경
- DocLight 웹앱(context0 MCP)과 DocuLightViewer(doculight MCP)가 동시에 등록되어 있다
- context0 MCP의 도구명(`DocuLight_search` 등)과 doculight MCP의 설명문("DocuLight viewer")이 모두 "DocuLight"를 포함한다
- Claude가 "도큐라이트"를 매칭할 때 양쪽 서버를 혼동할 수 있다
- `config.json5`에 `ui.title: "DOCU LIGHT"`가 설정되어 있으나, MCP 서버는 이 값을 사용하지 않고 하드코딩된 "DocuLight"를 사용 중이다

### 1.3 기능 요구사항
- FR-1: MCP 도구명 3개의 접두사를 `config.ui.title` 기반으로 동적 생성한다 (`DocuLight_get_config` → `{prefix}_get_config`)
- FR-2: MCP 서버 `serverInfo.name`을 `config.ui.title` 기반으로 동적 생성한다
- FR-3: MCP 도구 설명문 내 교차 참조(`DocuLight_smart_search` 등)를 동적 이름으로 변경한다

### 1.4 비기능 요구사항
- NFR-1: `ui.title` 미설정 시 기존 동작 유지 (fallback: `"DocuLight"`)
- NFR-2: `ui.title`에 공백이나 특수문자가 있으면 MCP 도구명 호환 형식으로 변환한다 (공백 → `_`, 특수문자 제거)

### 1.5 제약사항
- `TOOLS` 배열이 모듈 레벨 `const`로 정의되어 있어, `config`(요청 시 `req.app.locals.config`로 접근)를 참조할 수 없다
- `case` 문에서 하드코딩된 도구명으로 분기하므로, 동적 매칭 방식으로 변경이 필요하다
- 기존 Claude Desktop MCP 클라이언트가 재연결 시 `tools/list`로 새 이름을 자동 반영하므로, 하위 호환 문제는 없다

## 2. 현행 코드 분석

### 2.1 영향 범위
| 파일 | 변경 유형 | 설명 |
|------|----------|------|
| `src/routes/mcp.js` | 수정 | 도구명 동적화, case 핸들러 동적화, serverInfo 동적화, 설명문 동적화 |

### 2.2 재사용 가능 코드
- `req.app.locals.config` — 라우터 핸들러 내에서 config 접근 패턴이 이미 확립되어 있다 (line 741)
- `getConfig()` 서비스 — config 객체를 이미 다루고 있어 참조 가능

### 2.3 주의사항
- `TOOLS` 배열은 모듈 로드 시점에 1회 평가되므로, config 의존적 값은 함수로 감싸야 한다
- `requiresReadAuth()` 함수(line 322-326)에서도 하드코딩된 도구명을 사용하므로 함께 동적화해야 한다
- `executeTool()` 함수(line 370)의 switch-case에서 하드코딩된 도구명을 사용하므로 동적 분기로 변경해야 한다
- `instructions` 문자열(line 806)에서도 `DocuLight_smart_search`를 참조하므로 함께 변경해야 한다

### 2.4 변경 포인트 상세

| # | 위치 | 현재 값 | 변경 내용 |
|---|------|---------|----------|
| C1 | Line 54 (TOOLS 배열) | `const TOOLS = [...]` 모듈 레벨 상수 | 함수 `buildTools(prefix)` 로 변경 |
| C2 | Line 71 | 설명문 `DocuLight_search` 참조 | `${prefix}_search` |
| C3 | Line 89 | 설명문 `DocuLight_smart_search` 참조 | `${prefix}_smart_search` |
| C4 | Line 134 | `name: 'DocuLight_get_config'` | `name: \`${prefix}_get_config\`` |
| C5 | Line 149 | `name: 'DocuLight_search'` | `name: \`${prefix}_search\`` |
| C6 | Line 150 | 설명문 `DocuLight_smart_search` 참조 | `${prefix}_smart_search` |
| C7 | Line 180 | 설명문 `DocuLight_smart_search` 참조 | `${prefix}_smart_search` |
| C8 | Line 216 | `name: 'DocuLight_smart_search'` | `name: \`${prefix}_smart_search\`` |
| C9 | Line 252 | 설명문 `DocuLight_smart_search` 참조 | `${prefix}_smart_search` |
| C10 | Line 322-325 | `requiresReadAuth()` 하드코딩 도구명 | 동적 도구명으로 변경 |
| C11 | Line 526 | `case 'DocuLight_get_config':` | 동적 분기 (`prefix + '_get_config'`) |
| C12 | Line 542 | `case 'DocuLight_search':` | 동적 분기 (`prefix + '_search'`) |
| C13 | Line 647 | `case 'DocuLight_smart_search':` | 동적 분기 (`prefix + '_smart_search'`) |
| C14 | Line 803 | `name: 'DocuLight'` (serverInfo) | `name: prefix` |
| C15 | Line 806 | `instructions` 내 `DocuLight_smart_search` 참조 | 동적 이름 |

## 3. 구현 계획

### Phase 1: prefix 유틸리티 함수 + TOOLS 동적 빌더

- [x] Phase 1-1: `sanitizeForToolName(title)` 함수 추가 — `ui.title`을 MCP 도구명 호환 접두사로 변환 `FR-2` `NFR-1` `NFR-2` ✅ (87점, 2026-03-29)
  - 규칙: 공백 → `_`, 영숫자+언더스코어만 허용, fallback `"DocuLight"`
  - 예: `"DOCU LIGHT"` → `"DOCU_LIGHT"`, `""` → `"DocuLight"`, `undefined` → `"DocuLight"`
- [x] Phase 1-2: `const TOOLS = [...]`를 `function buildTools(prefix) { return [...] }` 함수로 변환 `FR-1` `FR-3` ✅ (87점, 2026-03-29)
  - 도구명 3개를 `${prefix}_get_config`, `${prefix}_search`, `${prefix}_smart_search`로 변경
  - 설명문 내 5곳의 교차 참조를 동적 이름으로 변경 (C2, C3, C6, C7, C9)
- **테스트:** (정상) `buildTools("DOCU_LIGHT")` 호출 시 도구명이 `DOCU_LIGHT_get_config` 등으로 생성됨 / (예외) `buildTools("")` 호출 시 fallback 적용 확인

### Phase 2: 라우터 핸들러 동적화

- [x] Phase 2-1: `createMcpRouter()` 내 `tools/list` 핸들러에서 `config.ui.title`로 prefix를 생성하고 `buildTools(prefix)` 호출 `FR-1` ✅ (87점, 2026-03-29)
- [x] Phase 2-2: `requiresReadAuth(toolName)` 함수 시그니처에 `prefix` 인자 추가 → `requiresReadAuth(toolName, prefix)` `FR-1` ✅ (87점, 2026-03-29)
  - 내부에서 `readTools` 배열의 3개 동적 이름을 `prefix + '_get_config'`, `prefix + '_search'`, `prefix + '_smart_search'`로 생성
  - 호출 측(`tools/call` 핸들러, line 741 부근)에서 `const prefix = sanitizeForToolName(config.ui?.title)`로 prefix를 계산하여 전달
- [x] Phase 2-3: `executeTool()` 시그니처에 `prefix` 파라미터 추가 → `executeTool(config, logger, name, args, req, prefix)` `FR-1` ✅ (87점, 2026-03-29)
  - switch-case 내 3곳을 if/else 체인으로 변경:
    ```javascript
    if (name === prefix + '_get_config') { /* 기존 DocuLight_get_config 로직 */ }
    else if (name === prefix + '_search') { /* 기존 DocuLight_search 로직 */ }
    else if (name === prefix + '_smart_search') { /* 기존 DocuLight_smart_search 로직 */ }
    ```
  - 나머지 도구(list_documents, read_document 등)는 기존 switch-case 유지
- [x] Phase 2-4: `initialize` 핸들러의 `serverInfo.name`과 `instructions` 문자열을 동적 prefix로 변경 `FR-2` `FR-3` ✅ (87점, 2026-03-29)
  - `serverInfo: { name: prefix, version: '1.0.0' }`
  - `instructions` 내 `DocuLight_smart_search` → `${prefix}_smart_search`
- **테스트:** (정상) `ui.title: "DOCU LIGHT"` 설정 → MCP `tools/list` 응답에 `DOCU_LIGHT_search` 반환 / (예외) `ui.title` 미설정 → 기존 `DocuLight_search` 반환 / (경계) `ui.title`에 특수문자(`"My App!@#"`) → `My_App` 으로 정규화

## 4. 검증 기준
- [ ] DocLight 서버 정상 기동 (에러 없음) — `npm start`로 확인
- [ ] `tools/list` 호출 시 새 도구명 반환 확인
- [ ] `tools/call`로 동적 도구명 호출 정상 동작
- [ ] `initialize` 응답의 `serverInfo.name`이 동적 이름
- [ ] `ui.title` 미설정 시 fallback `"DocuLight"` 동작
- [ ] 요구사항 전수 매핑: FR-1 → Phase 1-2, 2-1, 2-2, 2-3 / FR-2 → Phase 1-1, 2-4 / FR-3 → Phase 1-2, 2-4
