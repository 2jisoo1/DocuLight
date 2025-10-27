# DocuLight 프로젝트 코드베이스 분석

## 프로젝트 개요

**DocuLight**는 Node.js + Express + EJS로 구축된 경량 마크다운 문서 뷰어 및 관리 시스템입니다.
- Obsidian 스타일의 트리 탐색
- GitHub 스타일의 마크다운 렌더링
- REST API와 MCP(Model Context Protocol) 지원

---

## 1. 현재 MCP 상태

### ✅ 구현된 것

**위치**: `/mnt/c/Work/git/DocuLight/src/routes/mcp.js` (320 줄)

#### JSON-RPC 2.0 프로토콜 지원
- `createJsonRpcResponse(id, result)` - 성공 응답 생성
- `createJsonRpcError(id, code, message, data)` - 에러 응답 생성
- JSON-RPC 2.0 유효성 검증 (`jsonrpc: '2.0'`)

#### 구현된 MCP 도구 (5개)

| 도구명 | 설명 | 입력 | 반환 |
|-------|------|------|------|
| `list_documents` | 특정 경로의 문서 나열 | `path` (선택) | 파일/디렉토리 목록 |
| `list_full_tree` | 재귀적 완전 트리 조회 | `path`, `maxDepth` (선택) | 재귀 트리 + 통계 |
| `read_document` | 마크다운 문서 읽기 | `path` (필수) | 문서 내용 |
| `create_document` | 문서 생성/업데이트 | `path`, `content` (필수) | 성공 메시지 |
| `delete_document` | 문서/디렉토리 삭제 | `path` (필수) | 성공 메시지 |

#### MCP 엔드포인트

```
POST /mcp
```

**지원 메서드**:
- `tools/list` - 등록된 모든 도구 목록 반환
- `tools/call` - 특정 도구 실행
- `initialize` - MCP 서버 초기화

**응답 형식**:
```json
{
  "jsonrpc": "2.0",
  "id": <request-id>,
  "result": { ... } | "error": { "code": <code>, "message": <message> }
}
```

### ❌ 부족한 것

1. **도구 레지스트리 시스템 없음**
   - TOOLS 배열이 하드코딩되어 있음
   - 새 도구 추가 시 mcp.js 파일을 직접 수정해야 함
   - 동적 도구 등록 메커니즘 부재

2. **도구 카테고리화 없음**
   - 모든 도구가 단순 배열로 관리됨
   - 그룹화/카테고리 구조 부재

3. **도구 버전 관리 없음**
   - 도구 메타데이터에 버전 정보 없음
   - 호환성 추적 불가능

4. **고급 입력 스키마**
   - `inputSchema`가 기본적임
   - `required` 필드 검증 로직 약함
   - Custom validation 없음

5. **에러 처리 미흡**
   - 도구 실행 중 에러가 단순 메시지로만 반환됨
   - 스택 트레이스 정보 부족
   - 에러 코드 세분화 필요

6. **로깅 기능**
   - 기본 로깅만 구현됨
   - 도구 성능 메트릭 없음
   - 감사 로그(Audit log) 없음

7. **리소스 제한 없음**
   - 대용량 트리 조회 시 제한 없음
   - 타임아웃 설정 없음
   - Rate limiting 없음

---

## 2. 도구 등록 메커니즘

### 현재 구조

```javascript
// mcp.js의 하드코딩된 TOOLS 배열
const TOOLS = [
  {
    name: 'list_documents',
    description: '...',
    inputSchema: { ... }
  },
  // ... 5개 도구
];

// executeTool() 함수의 switch-case로 도구 실행
async function executeTool(config, logger, name, args) {
  switch (name) {
    case 'list_documents': ...
    case 'list_full_tree': ...
    case 'read_document': ...
    case 'create_document': ...
    case 'delete_document': ...
    default: throw new Error(`Unknown tool: ${name}`);
  }
}
```

### 문제점

1. **확장성 부족**
   - 새 도구 추가 시 두 곳 수정 필요 (TOOLS + switch-case)
   - 도구를 모듈로 분리할 수 없음

2. **유지보수 어려움**
   - 도구 로직과 레지스트리가 같은 파일에 섞여 있음
   - 각 도구의 구현이 320줄 파일에 모두 포함됨

3. **테스트 불편함**
   - 도구 레지스트리와 실행 로직을 독립적으로 테스트 불가능

### 권장되는 아키텍처

```
src/mcp/
├── tools/                      # 도구 구현 모듈
│   ├── list-documents.js
│   ├── list-full-tree.js
│   ├── read-document.js
│   ├── create-document.js
│   ├── delete-document.js
│   └── index.js               # 도구 레지스트리
├── registry.js                # 도구 등록 시스템
├── executor.js                # 도구 실행 엔진
└── handler.js                 # MCP 핸들러
```

---

## 3. 핵심 유틸리티 및 인프라

### 경로 검증 시스템

**위치**: `/mnt/c/Work/git/DocuLight/src/utils/path-validator.js`

```javascript
validatePath(rootPath, userPath)     // 경로 검증 및 절대 경로 반환
isWithinRoot(rootPath, testPath)     // 경로가 루트 내에 있는지 확인 (boolean)
getRelativePath(rootPath, absolutePath) // 상대 경로 계산
```

**특징**:
- 디렉토리 순회(path traversal) 공격 방지
- `path.resolve()`를 사용한 정규화
- 시작 경로 검증

### 공통 API 로직

**위치**: `/mnt/c/Work/git/DocuLight/src/routes/api-ctrl.js` (446 줄)

MCP 도구가 사용하는 핵심 함수들:

| 함수 | 역할 | 호출자 |
|------|------|--------|
| `getTreeData()` | 단일 디렉토리 트리 조회 | REST API, MCP |
| `getFullTreeData()` | 재귀 트리 조회 (MCP용) | MCP (list_full_tree) |
| `getRawContent()` | 마크다운 파일 읽기 | REST API, MCP |
| `uploadFileData()` | 파일 업로드 (ZIP 지원) | REST API, MCP |
| `deleteEntryData()` | 파일/디렉토리 삭제 | REST API, MCP |
| `extractZipFile()` | ZIP 파일 추출 | uploadFileData() |

### 파일 시스템 접근

```javascript
const fs = require('fs').promises;    // 비동기 파일 I/O
const path = require('path');         // 경로 조작
const ignore = require('ignore');     // gitignore 패턴 필터
```

**특징**:
- Promise 기반 비동기 API 사용
- config.excludes로 파일 필터링
- 숨김 파일(`.`로 시작)은 항상 제외

### 동시성 제어

**위치**: `/mnt/c/Work/git/DocuLight/src/utils/lock-manager.js`

```javascript
lockManager.acquire(key, asyncFunction)  // 키 기반 락 획득 후 함수 실행
lockManager.isLocked(key)                // 락 상태 확인
```

**특징**:
- AsyncLock 라이브러리 사용
- 파일 작업 시 경합 조건 방지
- 최대 5회 재시도, 2초 딜레이

### 설정 시스템

**위치**: `/mnt/c/Work/git/DocuLight/src/utils/config-loader.js`

```javascript
loadConfig()  // config.json5 로드 및 검증
```

**config 객체의 주요 속성**:

| 속성 | 타입 | 설명 |
|------|------|------|
| `docsRoot` | string | 문서 루트 디렉토리 (절대 경로) |
| `apiKey` | string | API 인증용 키 |
| `port` | number | 서버 포트 (기본: 3000) |
| `maxUploadMB` | number | 최대 업로드 크기 (기본: 10) |
| `excludes` | string[] | gitignore 패턴 배열 |
| `logDir` | string | 로그 디렉토리 (기본: ./logs) |
| `logLevel` | string | 로그 레벨 (error\|warn\|info\|debug) |
| `security.allows` | string[] | IP 화이트리스트 (선택사항) |
| `ssl` | object | SSL 설정 (선택사항) |
| `hotReload` | object | 핫 리로드 설정 (선택사항) |

### 로깅 시스템

**위치**: `/mnt/c/Work/git/DocuLight/src/utils/logger.js`

```javascript
createLogger(config)  // Winston 로거 생성
```

**특징**:
- Winston + Daily Rotate File
- 일일 로테이션 (최대 30일)
- API 키 자동 마스킹
- 콘솔 + 파일 로깅

### 인증 미들웨어

**위치**: `/mnt/c/Work/git/DocuLight/src/middleware/auth.js`

```javascript
authMiddleware()  // 런타임 config 읽기 인증 미들웨어
```

**특징**:
- X-API-Key 헤더 검증
- 런타임 config 사용 (req.app.locals.config)
- 쓰기/삭제/다운로드 작업 보호

---

## 4. 요청 흐름

### MCP 요청 처리

```
POST /mcp (JSON-RPC 2.0)
    ↓
src/routes/mcp.js: createMcpRouter() → router.post('/mcp')
    ↓
method 검사
    ├─ tools/list → TOOLS 배열 반환
    ├─ tools/call → executeTool() 호출
    │   ├─ list_documents → getTreeData()
    │   ├─ list_full_tree → getFullTreeData()
    │   ├─ read_document → getRawContent()
    │   ├─ create_document → uploadFileData()
    │   └─ delete_document → deleteEntryData()
    │
    └─ initialize → 서버 정보 반환
    ↓
JSON-RPC 2.0 응답 반환
```

### 보안 계층

```
MCP 요청
    ↓
[경로 검증] validatePath(rootPath, userPath)
    ├─ 정규화
    ├─ 절대 경로 확인 거부
    └─ 루트 범위 확인
    ↓
[파일 시스템 접근]
    ├─ fs.stat() - 존재 확인
    ├─ fs.readdir() - 디렉토리 읽기
    ├─ ignore 필터 적용
    └─ 숨김 파일 제외
    ↓
[동시성 제어] lockManager.acquire()
    ├─ 쓰기 작업 시
    └─ 경합 조건 방지
    ↓
응답 반환
```

---

## 5. 예상 구현 장소

### 새 도구 추가 절차

#### 예: `search_documents` 도구 추가

**Step 1: 도구 로직 함수 추가**

`src/routes/api-ctrl.js`에 추가:

```javascript
async function searchDocuments(config, logger, searchTerm, options = {}) {
  const { docsRoot, excludes } = config;
  const ig = ignore().add(excludes);
  
  // 재귀적으로 모든 파일을 스캔하고 searchTerm을 포함하는 파일 찾기
  // 반환: { matches: [...], totalSearched: number }
}
```

**Step 2: MCP 도구 등록**

`src/routes/mcp.js`의 TOOLS 배열에 추가:

```javascript
const TOOLS = [
  // 기존 도구들...
  {
    name: 'search_documents',
    description: 'Search for documents containing specific text',
    inputSchema: {
      type: 'object',
      properties: {
        searchTerm: {
          type: 'string',
          description: 'Text to search for'
        },
        path: {
          type: 'string',
          description: 'Search within directory (default: /)',
          default: '/'
        },
        maxResults: {
          type: 'integer',
          description: 'Maximum results to return',
          default: 100
        }
      },
      required: ['searchTerm']
    }
  }
];
```

**Step 3: executeTool() 함수에 case 추가**

```javascript
case 'search_documents': {
  const result = await searchDocuments(config, logger, args.searchTerm, {
    path: args.path || '/',
    maxResults: args.maxResults || 100
  });
  return {
    content: [{
      type: 'text',
      text: `# Search Results for "${args.searchTerm}"\n\n` +
            result.matches.map(m => `- ${m.path}`).join('\n')
    }]
  };
}
```

---

## 6. 프로젝트 구조 전체

```
/mnt/c/Work/git/DocuLight/
├── src/
│   ├── app.js                     # Express 앱 및 서버 시작/종료 로직
│   ├── routes/
│   │   ├── api.js                 # REST API 라우터
│   │   ├── api-ctrl.js            # 공통 API 로직 (MCP, REST 공용)
│   │   └── mcp.js                 # MCP over HTTP 구현 ⭐
│   ├── controllers/
│   │   ├── tree-controller.js     # 트리 조회 컨트롤러
│   │   ├── raw-controller.js      # 원본 파일 조회 컨트롤러
│   │   ├── upload-controller.js   # 파일 업로드 컨트롤러
│   │   ├── delete-controller.js   # 파일 삭제 컨트롤러
│   │   ├── download-controller.js # 파일 다운로드 컨트롤러
│   │   ├── doc-controller.js      # 문서 포털 컨트롤러
│   │   └── config-controller.js   # 설정 조회 컨트롤러
│   ├── middleware/
│   │   ├── auth.js                # API 키 인증
│   │   ├── error-handler.js       # 에러 처리
│   │   ├── request-logger.js      # 요청 로깅
│   │   └── ip-whitelist.js        # IP 화이트리스트
│   ├── utils/
│   │   ├── config-loader.js       # 설정 로드/검증
│   │   ├── logger.js              # Winston 로거 팩토리
│   │   ├── path-validator.js      # 경로 검증 (보안)
│   │   ├── lock-manager.js        # 동시성 제어
│   │   ├── config-watcher.js      # 설정 파일 감시
│   │   ├── backup-utils.js        # 설정 백업/복구
│   │   ├── ip-matcher.js          # IP 패턴 매칭
│   │   └── ssl-validator.js       # SSL 인증서 검증
│   └── views/
│       └── index.ejs              # 메인 HTML 템플릿
├── public/
│   ├── js/app.js                  # 클라이언트 JavaScript
│   ├── css/style.css              # 스타일시트
│   └── images/icon.png
├── test/
│   ├── test-start-stop.js
│   ├── test-watcher-restart.js
│   └── test-watcher-port-change.js
├── config.example.json5           # 설정 템플릿
├── config.json5                   # 실제 설정 (생성 필요)
└── package.json
```

---

## 7. 주요 특징 및 보안

### ✅ 구현된 보안 기능

1. **경로 검증**
   - 디렉토리 순회 공격 방지
   - `path.resolve()` + 범위 확인

2. **API 인증**
   - X-API-Key 헤더 검증
   - 쓰기/삭제 작업 보호

3. **파일 필터링**
   - gitignore 패턴 지원
   - 숨김 파일 자동 제외

4. **동시성 제어**
   - AsyncLock 기반 파일 작업 보호
   - 최대 5회 재시도

5. **IP 화이트리스트**
   - CIDR, 범위, 와일드카드 지원
   - 선택사항 (기본: 모든 IP 허용)

6. **SSL/TLS 지원**
   - 선택사항으로 HTTPS 가능
   - 인증서 검증

### 🔒 설정 보안

**config.json5**:
```json
{
  "apiKey": "CHANGE_THIS_TO_SECURE_KEY",  // 반드시 변경 필요
  "security": {
    "allows": ["127.0.0.1", "192.168.1.0/24"]  // IP 화이트리스트
  },
  "ssl": {
    "enabled": true,
    "cert": "/path/to/cert.pem",
    "key": "/path/to/key.pem"
  }
}
```

---

## 8. 개발 워크플로우

### 서버 시작

```bash
npm run dev      # 개발 모드 (nodemon 자동 재시작)
npm start        # 프로덕션 모드
```

### MCP 엔드포인트 테스트

```bash
# 도구 목록 조회
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list"
  }'

# 도구 실행 (list_documents)
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "list_documents",
      "arguments": { "path": "/" }
    }
  }'
```

### 로그 확인

```bash
tail -f logs/DocuLight-*.log    # 일일 로테이션 파일
```

---

## 9. 향후 확장 제안

### 즉시 실행 가능

1. **도구 레지스트리 시스템**
   - 동적 도구 등록 메커니즘
   - 모듈 기반 도구 분리

2. **도구 메타데이터**
   - 버전, 최종 업데이트, 호환성
   - 카테고리 및 태그

3. **에러 처리 강화**
   - 상세한 에러 코드
   - 재현 가능한 에러 정보

### 향후 추가 가능

1. **추가 도구들**
   - `search_documents` - 문서 검색
   - `get_file_stats` - 파일 통계
   - `batch_operations` - 일괄 작업
   - `list_recent_files` - 최근 파일
   - `create_directory` - 디렉토리 생성

2. **리소스 제한**
   - 타임아웃 설정
   - Rate limiting
   - 결과 크기 제한

3. **감시 및 분석**
   - 도구 사용 통계
   - 성능 메트릭
   - 감사 로그

---

## 📊 코드 통계

| 파일 | 줄수 | 목적 |
|-----|------|------|
| src/routes/mcp.js | 320 | MCP 핸들러 (도구 등록 + 실행) |
| src/routes/api-ctrl.js | 446 | 공통 API 로직 |
| src/app.js | 357 | 서버 진입점 |
| src/utils/path-validator.js | 67 | 경로 검증 |
| src/utils/config-loader.js | 233 | 설정 로드 |

---

## 결론

DocuLight의 MCP 구현은 **기초적이지만 작동하는 JSON-RPC 2.0 서버**로, 5개의 핵심 도구를 제공합니다. 

**강점**:
- 간단하고 이해하기 쉬운 구조
- 기본 보안 조치 완비
- REST API와의 우수한 통합

**약점**:
- 도구 레지스트리가 하드코딩됨
- 확장성 부족
- 고급 기능(versioning, categorization) 없음

새 도구를 추가할 때는 `api-ctrl.js`에 로직을 구현한 후, `mcp.js`의 TOOLS 배열과 executeTool()를 수정하면 됩니다.

