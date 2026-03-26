# SRS: DocLight Step 19 — LLM 기반 디렉토리 자동 요약 (.summary.md)

## 메타데이터
- **버전**: step19
- **생성일**: 2026-03-18
- **이전 버전**: docs/srs/plan18.join.md (Step 18: 회원가입 모드 확장 및 활동 로그 강화)
- **평가 라운드**: 3회 (만장일치 A+)

---

## 1. 개요

### 1.1 목적

DocLight의 문서 디렉토리에 `.summary.md` 파일을 자동 생성하여:
1. **디렉토리 수준 요약** — 하위 디렉토리에 문서가 업로드/변경되면 백그라운드에서 LLM을 호출하여 해당 디렉토리의 모든 `.md` 파일을 요약
2. **MCP 폴백 통합** — `query_document`/`summarize_document`에 디렉토리 경로가 전달될 때 `.summary.md`가 존재하면 이를 대표 파일로 사용 (Step 19에서 구현된 디렉토리 폴백 로직과 연계)
3. **Frontmatter 기반 최적화** — 하위 문서에 `description`/`summary` 필드가 있으면 전체 내용 대신 이 메타데이터만 수집하여 요약 (LLM 토큰 절약)

### 1.2 범위

| 포함 | 제외 |
|------|------|
| `config.json5`에 `summary` 설정 섹션 추가 | 실시간 스트리밍 요약 |
| LLM 기반 백그라운드 요약 생성 | 요약 결과의 UI 표시/편집 |
| `.summary.md` 파일 자동 생성/갱신 | 다국어 요약 |
| YAML frontmatter 포함 (갱신 날짜, 메타데이터) | 이미지/첨부파일 요약 |
| 하위 문서 frontmatter `description`/`summary` 활용 | 벡터 저장소 연동 (RAG 요약과 별도) |
| 기존 `chatbot.llm` 설정 재사용 | 새로운 LLM 제공자 추가 |

### 1.3 이전 버전 대비 변경사항

| 항목 | Step 18 (현재) | Step 19 (변경) |
|------|---------------|---------------|
| 디렉토리 처리 | MCP에서 디렉토리 경로 전달 시 폴백으로 대표 파일 선택 | + LLM 기반 `.summary.md` 자동 생성으로 폴백 품질 향상 |
| 설정 | `chatbot.llm` (챗봇 전용) | + `summary` 섹션 (독립 활성화, `chatbot.llm` 재사용) |
| 문서 감시 | `doc-watcher`가 벡터 저장소 동기화 전용 | + 요약 생성 트리거 추가 |

### 1.4 전제 조건

- `chatbot.llm` 설정이 유효해야 함 (LLM 인스턴스 생성 가능)
- `summary.enabled: true`로 활성화되어 있어야 함
- 두 조건 중 하나라도 실패 시 요약 기능 비활성화 + 경고 로그

---

## 2. 기능 요구사항

### FR-19-001: 요약 설정 (`config.json5`)

- **설명**: `config.json5`에 `summary` 섹션을 추가하여 자동 요약 기능 제어
- **입력**: `config.json5` 설정값
  ```json5
  summary: {
    // 자동 요약 기능 활성화 (기본값: false)
    enabled: false,

    // 요약 최대 라인 수 (기본값: 200)
    maxLines: 200,

    // 요약 생성 디바운스 시간 (밀리초, 기본값: 30000 = 30초)
    // 문서 변경 후 이 시간 동안 추가 변경이 없으면 요약 생성
    debounceMs: 30000,

    // 동시 요약 생성 최대 수 (기본값: 1)
    // 1이면 순차 처리, 높은 값은 LLM API 부하 증가
    concurrency: 1,

    // 요약에서 제외할 디렉토리 패턴 (gitignore 호환)
    // 기본값: [] (excludes 설정은 상속됨)
    excludeDirs: [],

    // LLM 설정 (선택사항)
    // 미지정 시 chatbot.llm 설정을 재사용
    // 요약 전용 모델을 별도로 지정하고 싶을 때 사용
    // llm: {
    //   type: "openai",
    //   endpoint: "...",
    //   apiKey: "...",
    //   model: "gpt-4o-mini",
    //   temperature: 0.3,
    //   maxTokens: 2048
    // }
  }
  ```
- **처리**:
  1. `summary` 섹션 미지정 또는 `enabled: false` → 요약 기능 비활성화 (기본 동작)
  2. `summary.enabled: true` 시:
     a. `summary.llm` 존재 → 이 설정으로 LLM 생성
     b. `summary.llm` 미지정 → `chatbot.llm` 설정 재사용
     c. 사용할 LLM 설정이 없거나 유효하지 않으면 → 경고 로그 + 요약 비활성화
  3. `maxLines` 유효성: 1 이상 정수, 아니면 기본값 200
  4. `debounceMs` 유효성: 5000 이상, 아니면 기본값 30000
  5. `concurrency` 유효성: 1~5 범위, 아니면 기본값 1
- **출력**: 정규화된 설정 객체
- **예외**:
  - LLM 설정 없음 + `enabled: true` → `logger.warn('Summary enabled but no LLM config. Disabling summary.')` + `enabled` 강제 `false`
- **우선순위**: P0

### FR-19-002: 디렉토리 요약 트리거

- **설명**: 문서 파일이 추가/변경/삭제되면 해당 디렉토리의 `.summary.md`를 재생성
- **입력**: `doc-watcher` 이벤트 (`add`, `change`, `remove`)
- **처리**:
  1. 이벤트 발생 시 변경된 파일의 부모 디렉토리 식별
  2. 변경 대상이 `.summary.md` 자체면 무시 (무한 루프 방지)
  3. 디바운스 적용: 동일 디렉토리에 대해 `debounceMs` 이내 추가 변경이 있으면 타이머 리셋
  4. 디바운스 완료 후 요약 생성 큐에 추가
  5. 큐 처리: `concurrency` 설정에 따라 동시 실행 제한
- **출력**: 요약 생성 작업이 큐에 등록됨
- **예외**:
  - 디렉토리에 `.md` 파일이 0개 (`.summary.md` 제외) → 기존 `.summary.md` 삭제
  - LLM 호출 실패 → 에러 로그 + 해당 디렉토리 건너뛰기 (재시도 없음)
- **우선순위**: P0

### FR-19-003: 하위 문서 수집 및 Frontmatter 최적화

- **설명**: 요약 대상 디렉토리의 `.md` 파일 정보를 수집하되, frontmatter 메타데이터가 있으면 우선 활용
- **입력**: 디렉토리 절대 경로
- **처리**:
  1. 디렉토리 내 `.md` 파일 목록 조회 (`.summary.md` 제외)
  2. 각 파일에 대해 frontmatter 파싱 (`parseFrontmatterFromFile` 재사용)
  3. 파일별 정보 수집:
     - frontmatter에 `description` 또는 `summary` 필드가 존재 → **해당 값만 수집** (파일 전체 읽기 생략)
     - frontmatter에 해당 필드 없음 → **파일 전체 내용 읽기** (최대 앞부분 4000자)
  4. 수집된 정보를 LLM 프롬프트 입력으로 구성
- **출력**: `{ files: [{ name, description?, content? }] }`
- **예외**:
  - 파일 읽기 실패 → 해당 파일 건너뛰기 + 경고 로그
- **우선순위**: P0

### FR-19-004: LLM 요약 생성

- **설명**: 수집된 문서 정보를 LLM에 전달하여 디렉토리 요약 생성
- **입력**: `FR-19-003`에서 수집된 파일 정보 배열
- **처리**:
  1. 시스템 프롬프트 구성:
     ```
     You are a technical documentation summarizer.
     Summarize the following directory of documents.
     Include: overview (what this directory is about), purpose (why these documents exist),
     and structure (how the documents are organized).
     Output in Korean. Keep it concise: under {maxLines} lines.
     Do NOT include YAML frontmatter in your output.
     ```
  2. 사용자 프롬프트: 파일명 + description/content 목록
  3. LLM 호출 (`createLLM`으로 생성된 인스턴스 사용)
  4. 응답 검증: 라인 수가 `maxLines` 초과 시 경고 로그 (잘라내지 않음)
- **출력**: 요약 텍스트 (마크다운)
- **예외**:
  - LLM 타임아웃/에러 → 에러 로그 + 요약 생성 실패 처리 (기존 `.summary.md` 유지)
  - 빈 응답 → 경고 로그 + 기존 파일 유지
- **우선순위**: P0

### FR-19-005: .summary.md 파일 생성

- **설명**: LLM 요약 결과를 YAML frontmatter와 함께 `.summary.md` 파일로 저장
- **입력**: 요약 텍스트, 디렉토리 경로, 소스 파일 목록
- **처리**:
  1. YAML frontmatter 구성:
     ```yaml
     ---
     name: {디렉토리명}
     description: {첫 문장 또는 요약 첫 줄, 최대 200자}
     type: auto-summary
     updated: {YYYY-MM-DDTHH:mm:ssZ, ISO 8601}
     sources:
       - file1.md
       - file2.md
     ---
     ```
  2. frontmatter 뒤에 요약 본문 추가
  3. 파일 쓰기: `{디렉토리}/.summary.md`
  4. 쓰기 후 `doc-watcher`가 이 변경을 감지하지만, `FR-19-002`의 `.summary.md` 필터링으로 무한 루프 방지
- **출력**: `.summary.md` 파일 생성/갱신
- **예외**:
  - 파일 쓰기 실패 (권한 등) → 에러 로그
- **우선순위**: P0

### FR-19-006: 서버 시작 시 초기 요약 생성

- **설명**: 서버 시작 시 `.summary.md`가 없거나 오래된 디렉토리에 대해 요약 생성
- **입력**: `docsRoot` 전체 디렉토리 트리
- **처리**:
  1. `summary.enabled: true`이고 LLM 유효 시에만 실행
  2. `docsRoot` 하위 모든 디렉토리 순회
  3. 각 디렉토리에 대해:
     - `.md` 파일이 1개 이상 존재 (`.summary.md` 제외)
     - `.summary.md`가 없거나, 소스 파일 중 하나라도 `.summary.md`보다 새로움
     - → 요약 생성 큐에 추가
  4. 큐를 순차 처리 (서버 시작 부하 분산)
  5. 완료 로그: `Summary init: {생성}개 생성, {스킵}개 최신, {실패}개 실패`
- **출력**: 필요한 디렉토리에 `.summary.md` 생성
- **예외**:
  - 초기화 실패 → 에러 로그 + 서버 시작은 계속 (요약은 선택 기능)
- **우선순위**: P1

### FR-19-007: .summary.md를 excludes 패턴에서 보호

- **설명**: `.summary.md` 파일은 숨김 파일(`.`으로 시작)이므로, 일부 excludes 패턴에 의해 무시될 수 있음
- **입력**: 기존 `excludes` 설정
- **처리**:
  1. `excludes`에 `.summary.md`를 명시적으로 제외하는 패턴이 없는지 확인
  2. 문서 목록/트리 API에서 `.summary.md`는 표시하되, 일반 문서와 구분되는 메타데이터 제공
  3. MCP `list_documents`에서 `.summary.md` 파일은 `type: "summary"` 플래그 추가
- **출력**: `.summary.md`가 API/MCP에서 접근 가능
- **우선순위**: P1

---

## 3. 비기능 요구사항

### NFR-19-001: 백그라운드 처리 성능

- LLM 호출은 비동기로 수행, 서버 요청 처리에 영향 없음
- 요약 큐는 FIFO 순서, 동시 실행 수는 `concurrency` 설정 준수
- 단일 디렉토리 요약 시 LLM 호출 1회만 수행 (다중 호출 금지)
- 수집한 문서 데이터가 LLM 컨텍스트 길이 초과 시 앞부분만 사용 (경고 로그)

### NFR-19-002: 파일 크기 제한

- `.summary.md` 출력: `maxLines` 설정 이하 (기본 200라인)
- frontmatter 포함 전체 파일 크기: 최대 50KB
- 문서 수집 시 파일당 최대 4000자만 읽기 (frontmatter 없는 경우)

### NFR-19-003: 하위 호환성

- `summary` 설정 미지정 시 기존 동작 유지 (요약 생성 안 함)
- 기존 `chatbot.llm` 설정 변경 없음
- 기존 `doc-watcher` 이벤트 핸들러 체이닝에 영향 없음
- `.summary.md` 파일이 없는 디렉토리는 기존 폴백 로직 그대로 동작

### NFR-19-004: 안정성

- LLM 호출 실패가 서버 크래시를 일으키지 않음
- 요약 생성 큐 처리 중 에러 발생 시 해당 작업만 건너뛰고 다음 작업 계속
- 동시에 같은 디렉토리에 대해 중복 요약 요청 방지 (진행 중 표시)

### NFR-19-005: 로깅

- 요약 생성 시작/완료/실패를 `logger.info`/`logger.error`로 기록
- 로그 형식: `[SUMMARY] action dir={dirPath} files={count} duration={ms}`
- 활동 로그 (Step 18): `[DOC] SUMMARY_GENERATE path={dirPath} files={count}`

---

## 4. 데이터 요구사항

### DR-19-001: config.json5 summary 섹션

```json5
summary: {
  enabled: false,          // 활성화 여부 (기본: false)
  maxLines: 200,           // 최대 라인 수 (기본: 200)
  debounceMs: 30000,       // 디바운스 밀리초 (기본: 30000)
  concurrency: 1,          // 동시 처리 수 (기본: 1)
  excludeDirs: []          // 제외 디렉토리 패턴
  // llm: { ... }          // 선택: 요약 전용 LLM (미지정 시 chatbot.llm)
}
```

### DR-19-002: .summary.md 파일 구조

```markdown
---
name: AnnotaQL
description: AnnotaQL은 주석 기반 쿼리 언어로, 구조적 데이터를 선언적으로 질의합니다.
type: auto-summary
updated: 2026-03-18T14:30:00Z
sources:
  - 01-overview.md
  - 02-syntax.md
  - 03-examples.md
---

# AnnotaQL

## 개요

AnnotaQL은 주석 기반 쿼리 언어입니다. ...

## 목적

이 문서 디렉토리는 AnnotaQL의 ...

## 문서 구조

| 파일 | 내용 |
|------|------|
| 01-overview.md | 전체 개요 및 설계 철학 |
| 02-syntax.md | 문법 정의 및 BNF |
| 03-examples.md | 사용 예제 모음 |
```

### DR-19-003: Frontmatter 필드 확장

기존 `parseFrontmatter`가 인식하는 필드에 `summary` 추가:

| 필드 | 타입 | 용도 |
|------|------|------|
| `name` | string | 문서 이름 (기존) |
| `description` | string | 문서 설명 (기존) — 요약 수집 시 활용 |
| `summary` | string | 문서 요약 (신규) — `description`보다 우선 |
| `aliases` | string | 별칭 (기존) |
| `version` | string | 버전 (기존) |

**우선순위**: `summary` > `description` (둘 다 있으면 `summary` 사용)

---

## 5. 인터페이스 요구사항

### IR-19-001: doc-watcher 이벤트 연동

- `doc-watcher`의 기존 이벤트(`add`, `change`, `remove`)에 요약 트리거를 추가 리스너로 등록
- 기존 벡터 저장소 동기화 리스너에 영향 없음 (별도 리스너)

### IR-19-002: MCP 디렉토리 폴백 연계

- `resolveRepresentativeFile` 함수의 우선순위 2번(.summary.md)은 이미 구현됨
- LLM 요약이 `.summary.md`를 생성하면 자동으로 MCP 폴백에 활용됨
- 추가 코드 변경 불필요 (기존 폴백 로직이 이미 `.summary.md`를 최우선 선택)

### IR-19-003: config-loader 연동

- `config-loader`에서 `summary` 섹션 정규화 추가
- LLM 설정 유효성 검증: `createLLM` 팩토리의 기존 검증 로직 재사용

---

## 6. 제약사항

| 항목 | 제약 |
|------|------|
| 런타임 | Node.js (Express 기반) |
| LLM 의존성 | `chatbot.llm` 또는 `summary.llm` 설정 필수 |
| 파일 시스템 | `.summary.md`는 `docsRoot` 내부에만 생성 |
| 토큰 비용 | 디렉토리당 LLM 호출 1회, 파일 수가 많으면 입력 토큰 증가 |
| 동시성 | 최대 5개 동시 요약 (LLM API 부하 제한) |
| 파일 감시 | `chokidar` 패키지 필요 (기존 optionalDependency) |

---

## 7. 인수 조건

### AC-19-001: 요약 기능 활성화

- **Given**: `config.json5`에 `summary.enabled: true`, `chatbot.llm` 설정 유효
- **When**: 서버 시작
- **Then**:
  - 로그에 `Summary service initialized` 출력
  - `docsRoot` 하위 디렉토리 중 `.summary.md`가 없는 곳에 자동 생성 시작

### AC-19-002: 요약 기능 비활성화 (기본)

- **Given**: `config.json5`에 `summary` 섹션 없음 (또는 `enabled: false`)
- **When**: 서버 시작
- **Then**: 요약 관련 로그 없음, `.summary.md` 파일 생성 안 함

### AC-19-003: LLM 설정 없이 활성화 시도

- **Given**: `summary.enabled: true`, `chatbot.llm` 미설정, `summary.llm` 미설정
- **When**: 서버 시작
- **Then**:
  - `logger.warn('Summary enabled but no LLM config. Disabling summary.')`
  - 요약 기능 비활성화

### AC-19-004: 문서 추가 시 요약 자동 생성

- **Given**: 요약 기능 활성화, 디렉토리 `/guides/`에 `.summary.md` 없음
- **When**: `/guides/setup.md` 파일 업로드
- **Then**:
  - 30초(debounceMs) 후 `/guides/.summary.md` 생성
  - YAML frontmatter에 `updated` 필드가 현재 시간
  - `sources`에 `setup.md` 포함
  - 본문에 개요/목적/구조 포함

### AC-19-005: Frontmatter description 활용

- **Given**: `/api/` 디렉토리에 3개 파일:
  - `auth.md` — frontmatter에 `description: 인증 API 명세`
  - `users.md` — frontmatter에 `summary: 사용자 관리 CRUD API`
  - `docs.md` — frontmatter 없음
- **When**: 요약 생성 트리거
- **Then**:
  - `auth.md`: `description` 값만 수집 (전체 내용 읽지 않음)
  - `users.md`: `summary` 값만 수집 (`summary`가 `description`보다 우선)
  - `docs.md`: 파일 앞부분 최대 4000자 읽기
  - LLM 프롬프트에 위 정보 전달

### AC-19-006: .summary.md 갱신

- **Given**: `/guides/.summary.md` 이미 존재 (어제 생성)
- **When**: `/guides/advanced.md` 파일 추가
- **Then**:
  - `.summary.md` 재생성
  - `updated` 필드 갱신
  - `sources` 목록에 `advanced.md` 추가
  - 기존 요약과 내용이 달라짐

### AC-19-007: 빈 디렉토리에서 .summary.md 삭제

- **Given**: `/guides/` 디렉토리에 `.summary.md`만 남음 (다른 `.md` 파일 모두 삭제)
- **When**: 마지막 `.md` 파일 삭제 트리거
- **Then**: `.summary.md` 파일 삭제

### AC-19-008: MCP query_document 디렉토리 폴백

- **Given**: `/api/.summary.md` 존재
- **When**: MCP `query_document("api", "인증 방법")`
- **Then**: `.summary.md` 파일이 대표 파일로 선택되어 쿼리 수행

### AC-19-009: 무한 루프 방지

- **Given**: 요약 기능 활성화
- **When**: `.summary.md` 파일이 생성/갱신됨
- **Then**: 해당 변경으로 인한 추가 요약 트리거 없음

### AC-19-010: 동시 요약 제한

- **Given**: `concurrency: 1`, 디렉토리 A와 B 동시 트리거
- **When**: A 요약 진행 중 B 트리거 발생
- **Then**: B는 큐에서 대기, A 완료 후 B 시작

---

## 구현 파일 영향 분석

| 파일 | 변경 유형 | 내용 |
|------|----------|------|
| `src/utils/config-loader.js` | 수정 | `summary` 섹션 정규화, LLM 설정 유효성 검증 |
| `config.example.json5` | 수정 | `summary` 설정 예시 추가 (주석) |
| `src/services/frontmatter-service.js` | 수정 | `summary` 필드 파싱 추가 |
| `src/services/summary/summary-service.js` | **신규** | 요약 생성 핵심 서비스 (큐 관리, LLM 호출, 파일 쓰기) |
| `src/services/summary/summary-collector.js` | **신규** | 디렉토리 내 문서 정보 수집 (frontmatter 최적화) |
| `src/app.js` | 수정 | 서버 시작 시 SummaryService 초기화 |
| `src/services/chatbot/doc-watcher.js` | 수정 | 요약 트리거 리스너 등록 포인트 추가 (또는 외부에서 이벤트 구독) |

---

## 부록: 평가 결과

### 전문가 평가 요약

| 기준 | 기술 아키텍트 | QA 전문가 | 비즈니스 분석가 |
|------|:----------:|:-------:|:------------:|
| 요구사항 완전성 | A+ | A+ | A+ |
| 구현 명확성 | A+ | A+ | A+ |
| 이전 버전 일관성 | A+ | A+ | A+ |
| 보안/안정성 | A+ | A+ | A+ |
| 테스트 가능성 | A+ | A+ | A+ |
| 성능/확장성 | A+ | A+ | A+ |
| 기존 아키텍처 적합성 | A+ | A+ | A+ |

### 평가 상세

**라운드 1 피드백**:
- [기술 아키텍트] `chatbot.llm` 미설정 + `summary.llm` 미설정 시 동작 미명시 → FR-19-001에 명시적 경고/비활성화 추가
- [QA 전문가] `.summary.md` 무한 루프 방지 메커니즘 부재 → FR-19-002에 필터링 명시
- [비즈니스 분석가] frontmatter `summary` vs `description` 우선순위 미정의 → DR-19-003에 우선순위 추가

**라운드 2 피드백**:
- [기술 아키텍트] 서버 시작 시 초기 요약 생성 동작 미명시 → FR-19-006 추가
- [QA 전문가] 빈 디렉토리 엣지케이스 → AC-19-007 추가
- [비즈니스 분석가] 동시 요약 제한 인수 조건 필요 → AC-19-010 추가

**라운드 3**: 만장일치 A+ 달성
