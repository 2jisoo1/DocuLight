# CLAUDE.md

이 파일은 Claude Code(claude.ai/code)가 이 저장소의 코드 작업 시 참고하는 가이드입니다.

## 프로젝트 개요

DocLight는 Node.js + Express + EJS로 구축된 경량 Markdown 문서 뷰어 및 관리 시스템입니다. Obsidian 스타일의 트리 탐색과 GitHub 스타일의 렌더링으로 Markdown 파일을 탐색, 열람, 관리할 수 있는 웹 기반 인터페이스를 제공합니다.

## 개발 명령어

### 애플리케이션 실행

```bash
# 개발 모드 - 자동 재시작(nodemon)
npm run dev

# 프로덕션 모드
npm start
```

서버는 기본적으로 포트 3000에서 실행됩니다(`config.json5`에서 설정 가능). `http://localhost:3000`에 접속하세요.

### 설정 구성

첫 실행 전:

```bash
# 예제 설정 파일 복사
cp config.example.json5 config.json5

# config.json5 편집하여 설정:
# - docsRoot: 문서 디렉터리의 절대 경로
# - apiKey: API 인증용 안전한 랜덤 문자열
# - port, maxUploadMB, excludes 등
```

`config.json5`가 누락되었거나 잘못된 설정이 포함되어 있으면 애플리케이션 시작이 실패합니다(검증 규칙은 src/utils/config-loader.js:31-40 참조).

## 아키텍처

### 서버 측 구조 (src/)

**진입점: src/app.js**
- `config-loader.js`를 통해 설정 로드
- 일일 로테이션이 있는 Winston 로거 초기화
- EJS 뷰가 있는 Express 앱 설정
- `/api`에 API 라우트 마운트
- SIGTERM/SIGINT에서 우아한 종료 제공

**요청 흐름**:
1. Request → `request-logger.js` 미들웨어 (Winston 로깅)
2. `routes/api.js`에서 라우트 매칭
3. 공개 라우트 (GET /tree, /raw) → 컨트롤러로 직접 이동
4. 보호된 라우트 (POST /upload, DELETE /entry, GET /download/*) → `auth.js` 미들웨어 → 컨트롤러
5. 경로 검증, 파일 작업이 포함된 컨트롤러 로직
6. 응답 또는 오류 → `error-handler.js` 미들웨어

**컨트롤러 (src/controllers/)**:
- `tree-controller.js`: 제외 패턴 필터링이 있는 디렉터리 트리 생성
- `raw-controller.js`: Markdown 파일 콘텐츠 검색
- `upload-controller.js`: 크기 제한이 있는 Multer 기반 파일 업로드
- `delete-controller.js`: 안전을 위해 async-lock을 사용한 파일/디렉터리 삭제
- `download-controller.js`: 단일 파일 및 디렉터리 ZIP 다운로드

**주요 유틸리티 (src/utils/)**:
- `config-loader.js`: 검증 및 기본값이 포함된 JSON5 설정 파싱
- `logger.js`: 일일 파일 로테이션이 있는 Winston 로거 팩토리
- `path-validator.js`: 디렉터리 순회 방지를 위한 보안 검증
- `lock-manager.js`: 동시 작업 안전을 위한 AsyncLock 래퍼

**미들웨어 (src/middleware/)**:
- `auth.js`: X-API-Key 헤더를 통한 API 키 검증
- `error-handler.js`: 상태 코드 매핑이 있는 중앙집중식 오류 처리
- `request-logger.js`: HTTP 요청/응답 로깅

### 클라이언트 측 구조 (public/js/app.js)

**주요 컴포넌트**:
- 트리 상태 및 마지막으로 연 파일을 유지하기 위한 IndexedDB 통합
- 확장/축소 지속성이 있는 파일 트리 렌더링
- DOMPurify 정제가 있는 Markdown 렌더링
- Mermaid.js 다이어그램 지원
- 지수 백오프 재시도 로직이 있는 오류 처리
- 상태 관리 (ErrorHandler, TreeManager, FileViewer 패턴)

**상태 지속성**:
- IndexedDB `treeState` 스토어에 경로별로 트리 확장 상태 저장
- `lastOpened` 스토어에 마지막으로 연 파일을 저장하여 재방문 시 자동 로드

### 보안 모델

**경로 검증** (src/utils/path-validator.js):
- 디렉터리 순회를 방지하기 위해 모든 파일 경로를 `docsRoot`에 대해 검증
- `path.resolve()` 및 포함 검사 사용

**API 인증**:
- 읽기 작업 (GET /tree, /raw): 공개 접근
- 쓰기 작업 (POST /upload, DELETE /entry, GET /download/*): `config.apiKey`와 일치하는 X-API-Key 헤더 필요

**XSS 보호**:
- Markdown 렌더링 전 DOMPurify를 통한 클라이언트 측 HTML 정제

**파일 필터링**:
- config.json5의 제외 패턴은 `ignore` 라이브러리 사용 (gitignore 호환)
- 민감한 파일을 숨기기 위해 트리 생성 시 적용

## 설정 시스템

`config.json5` (주석을 위한 JSON5 형식)은 시작 시 로드됩니다. 필수 필드:
- `docsRoot`: 기존 디렉터리여야 함 (절대 경로 권장)
- `apiKey`: 기본값에서 변경되어야 함

기본값이 있는 선택 필드:
- `maxUploadMB`: 10 (검증 범위 1-1000)
- `port`: 3000
- `excludes`: [] (gitignore 스타일 패턴의 배열)
- `logDir`: "./logs" (없으면 생성됨)
- `logLevel`: "info" (error|warn|info|debug)
- `ui.title`: "DocLight" (사이드바 제목)
- `ui.icon`: "/images/icon.png" (아이콘 경로)

전체 문서는 config.example.json5를 참조하세요.

## API 엔드포인트

### 공개 (인증 불필요)
- `GET /api/tree?path=<path>` - 디렉터리 트리 구조
- `GET /api/raw?path=<file>` - 원본 Markdown 콘텐츠
- `GET /healthz` - 헬스 체크

### 보호됨 (X-API-Key 헤더 필요)
- `POST /api/upload?path=<dir>` - 파일 업로드 (multipart/form-data, 필드: "file")
- `DELETE /api/entry?path=<path>` - 파일 또는 디렉터리 삭제
- `GET /api/download/file?path=<file>` - 단일 파일 다운로드
- `GET /api/download/dir?path=<dir>` - 디렉터리를 ZIP으로 다운로드

## 주요 의존성

- **express**: 웹 서버 프레임워크
- **ejs**: 서버 측 템플릿
- **multer**: 파일 업로드 처리
- **winston**: 일일 로테이션이 있는 로깅
- **ignore**: 제외를 위한 Gitignore 스타일 패턴 매칭
- **archiver**: 디렉터리 다운로드를 위한 ZIP 생성
- **async-lock**: 파일 작업을 위한 동시성 제어
- **json5**: 주석이 있는 설정 파일 파싱
- **puppeteer**: (향후 PDF 내보내기 기능에 사용 가능)
- **nodemon** (dev): 파일 변경 시 자동 재로드

## 개발 워크플로

1. 서버 코드 수정 (src/*) → nodemon이 서버 자동 재시작
2. 클라이언트 코드 수정 (public/js/app.js, public/css/style.css) → 브라우저 새로고침
3. 뷰 수정 (src/views/index.ejs) → 브라우저 새로고침
4. `logs/` 디렉터리에서 로그 확인 (일일 로테이션 파일)

## 테스트

프로젝트에는 루트 디렉터리에 수동 테스트 보고서(TEST*.md 파일)가 포함되어 있습니다. 현재 자동화된 테스트 스위트는 구성되어 있지 않습니다(`npm test`는 오류로 종료됨).

API 엔드포인트 테스트:
```bash
# 공개 엔드포인트
curl "http://localhost:3000/api/tree?path=/"

# 보호된 엔드포인트
curl -H "X-API-Key: your-api-key" -X DELETE "http://localhost:3000/api/entry?path=/test.md"
```

## 프로덕션 배포

권장: 프로세스 관리에 PM2 사용
```bash
npm install -g pm2
pm2 start src/app.js --name doclight
pm2 save
pm2 startup
```

## 중요 참고사항

- **경로 안전성**: 보안 문제를 방지하기 위해 모든 파일 작업은 path-validator.js를 거쳐야 합니다
- **동시성**: 삭제 작업은 경쟁 조건을 방지하기 위해 lock-manager.js를 사용합니다
- **오류 처리**: 컨트롤러는 중앙집중식 error-handler에 오류를 전달하기 위해 `next(error)`를 사용해야 합니다
- **로깅**: 일관된 로깅을 위해 라우트/컨트롤러에서 `req.app.locals.logger`를 사용하세요
- **설정 변경**: 서버 재시작 필요 (개발 모드에서 nodemon 사용 시에도)
