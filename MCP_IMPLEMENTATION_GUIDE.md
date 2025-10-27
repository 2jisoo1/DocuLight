# DocuLight MCP 구현 가이드

> MCP 도구를 새로 추가하거나 기존 도구를 이해하기 위한 실전 가이드

---

## 빠른 시작: 새 도구 추가 3단계

### 1️⃣ 로직 함수 작성 (`src/routes/api-ctrl.js`)

```javascript
// 파일 끝에 새 도구 함수 추가
async function myNewTool(config, logger, param1, param2, options = {}) {
  const { docsRoot, excludes } = config;
  
  // 1. 입력 검증
  if (!param1) {
    const error = new Error('INVALID_INPUT: param1 is required');
    error.code = 'INVALID_INPUT';
    throw error;
  }
  
  // 2. 경로 검증 (필요시)
  const absolutePath = validatePath(docsRoot, param1);
  
  // 3. 파일 시스템 접근
  const stats = await fs.stat(absolutePath);
  
  // 4. 결과 반환
  return {
    success: true,
    data: { /* ... */ }
  };
}

// exports에 추가
module.exports = {
  // 기존 함수들...
  myNewTool
};
```

### 2️⃣ 도구 메타데이터 추가 (`src/routes/mcp.js`)

```javascript
const TOOLS = [
  // 기존 도구들...
  {
    name: 'my_new_tool',
    description: '도구에 대한 설명',
    inputSchema: {
      type: 'object',
      properties: {
        param1: {
          type: 'string',
          description: 'param1 설명'
        },
        param2: {
          type: 'string',
          description: 'param2 설명',
          default: 'default_value'
        },
        options: {
          type: 'object',
          description: '추가 옵션',
          properties: {
            key: { type: 'string' }
          }
        }
      },
      required: ['param1']  // 필수 입력
    }
  }
];
```

### 3️⃣ 실행 로직 추가 (`src/routes/mcp.js`)

```javascript
async function executeTool(config, logger, name, args) {
  switch (name) {
    // 기존 케이스들...
    
    case 'my_new_tool': {
      const { myNewTool } = require('./api-ctrl');
      const result = await myNewTool(
        config, 
        logger, 
        args.param1,
        args.param2,
        args.options || {}
      );
      
      return {
        content: [{
          type: 'text',
          text: `# Result\n\n${JSON.stringify(result, null, 2)}`
        }]
      };
    }
    
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
```

---

## 아키텍처 이해하기

### 레이어 구조

```
┌─────────────────────────────────────┐
│  MCP JSON-RPC 2.0 클라이언트        │
└──────────────┬──────────────────────┘
               │ POST /mcp
               ▼
┌─────────────────────────────────────┐
│  src/routes/mcp.js                  │
│  ├─ TOOLS 배열 (메타데이터)         │
│  ├─ executeTool() (라우팅)          │
│  └─ createMcpRouter() (엔드포인트)  │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  src/routes/api-ctrl.js             │
│  ├─ getTreeData()                   │
│  ├─ getRawContent()                 │
│  ├─ uploadFileData()                │
│  ├─ deleteEntryData()               │
│  └─ [새로운 도구 함수들...]         │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  보안 및 유틸리티 계층              │
│  ├─ path-validator.js               │
│  ├─ lock-manager.js                 │
│  ├─ logger.js                       │
│  └─ config-loader.js                │
└─────────────────────────────────────┘
```

### 데이터 흐름

```
요청: { method: "tools/call", params: { name: "read_document", arguments: { path: "/guide.md" } } }
  ↓
MCP 라우터 (mcp.js)
  ├─ 요청 검증
  ├─ executeTool() 호출
  │   ├─ 도구명으로 케이스 선택 ("read_document")
  │   └─ api-ctrl.js의 getRawContent() 호출
  │       ├─ 경로 검증 (path-validator.js)
  │       ├─ 파일 접근 (fs.promises)
  │       └─ 내용 반환
  └─ JSON-RPC 응답 포장
  ↓
응답: { jsonrpc: "2.0", id: 1, result: { content: [ { type: "text", text: "..." } ] } }
```

---

## 실제 예제: `search_documents` 도구

### Step 1: 로직 구현

```javascript
// src/routes/api-ctrl.js에 추가

const fs = require('fs').promises;
const path = require('path');
const ignore = require('ignore');

async function searchDocuments(config, logger, searchTerm, options = {}) {
  if (!searchTerm || searchTerm.trim().length === 0) {
    const error = new Error('INVALID_INPUT: searchTerm cannot be empty');
    error.code = 'INVALID_INPUT';
    throw error;
  }

  const startPath = options.path || '/';
  const maxResults = options.maxResults || 100;
  const caseSensitive = options.caseSensitive || false;

  const absolutePath = validatePath(config.docsRoot, startPath);
  const ig = ignore().add(config.excludes);

  const matches = [];
  const searchRegex = new RegExp(searchTerm, caseSensitive ? 'g' : 'gi');

  async function searchRecursive(currentPath) {
    if (matches.length >= maxResults) return;

    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;

      const fullPath = path.join(currentPath, entry.name);
      const relativePath = path.relative(config.docsRoot, fullPath);

      if (ig.ignores(relativePath)) continue;

      if (entry.isDirectory()) {
        await searchRecursive(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        try {
          const content = await fs.readFile(fullPath, 'utf-8');
          const foundMatches = content.match(searchRegex);

          if (foundMatches) {
            matches.push({
              path: '/' + relativePath.replace(/\\/g, '/'),
              matches: foundMatches.length,
              preview: content.substring(0, 200) + '...'
            });
          }
        } catch (error) {
          logger.warn('Failed to search file', { file: entry.name, error: error.message });
        }
      }
    }
  }

  await searchRecursive(absolutePath);

  logger.info('Document search completed', {
    searchTerm,
    matches: matches.length,
    maxResults
  });

  return {
    searchTerm,
    matches: matches.slice(0, maxResults),
    totalFound: matches.length,
    limited: matches.length >= maxResults
  };
}

module.exports = {
  // 기존 함수들...
  searchDocuments
};
```

### Step 2: 도구 등록

```javascript
// src/routes/mcp.js의 TOOLS 배열

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
          description: 'Text to search for (supports regex)',
          default: ''
        },
        path: {
          type: 'string',
          description: 'Search within directory (default: /)',
          default: '/'
        },
        maxResults: {
          type: 'integer',
          description: 'Maximum results to return',
          default: 100,
          minimum: 1,
          maximum: 1000
        },
        caseSensitive: {
          type: 'boolean',
          description: 'Case-sensitive search',
          default: false
        }
      },
      required: ['searchTerm']
    }
  }
];
```

### Step 3: 실행 함수

```javascript
// src/routes/mcp.js의 executeTool() 함수

case 'search_documents': {
  const { searchDocuments } = require('./api-ctrl');
  
  const result = await searchDocuments(config, logger, args.searchTerm, {
    path: args.path || '/',
    maxResults: args.maxResults || 100,
    caseSensitive: args.caseSensitive || false
  });

  let output = `# Search Results for "${args.searchTerm}"\n\n`;
  output += `Found: ${result.totalFound} matches`;
  if (result.limited) {
    output += ` (showing first ${result.matches.length})`;
  }
  output += '\n\n';

  if (result.matches.length > 0) {
    for (const match of result.matches) {
      output += `## ${match.path}\n`;
      output += `- Matches: ${match.matches}\n`;
      output += `- Preview: ${match.preview}\n\n`;
    }
  } else {
    output += 'No matches found.';
  }

  return {
    content: [{
      type: 'text',
      text: output
    }]
  };
}
```

### 테스트

```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "search_documents",
      "arguments": {
        "searchTerm": "configuration",
        "path": "/",
        "maxResults": 10,
        "caseSensitive": false
      }
    }
  }'
```

---

## 도구 개발 체크리스트

### 입력 검증

- [ ] 필수 파라미터 존재 여부 확인
- [ ] 데이터 타입 검증
- [ ] 범위/길이 제한 확인
- [ ] 경로 검증 (path-validator 사용)

### 에러 처리

- [ ] 구체적인 에러 메시지 작성
- [ ] 에러 코드 설정 (NOT_FOUND, PATH_TRAVERSAL 등)
- [ ] 복구 불가능한 에러 구분
- [ ] 로깅 (logger.error, logger.warn)

### 보안

- [ ] 경로 검증 필수: `validatePath(config.docsRoot, userPath)`
- [ ] 파일 타입 확인 (.md만 접근 등)
- [ ] 접근 제한 (excludes 패턴 적용)
- [ ] 동시성 제어: `lockManager.acquire()`가 필요한가?

### 성능

- [ ] 대규모 결과 크기 제한
- [ ] 타임아웃 고려
- [ ] 재귀 깊이 제한
- [ ] 불필요한 파일 I/O 최소화

### 로깅

- [ ] 작업 시작/완료 로깅
- [ ] 중요 파라미터 기록
- [ ] 에러 로깅
- [ ] 성능 메트릭 (파일 수, 소요 시간 등)

### 문서화

- [ ] inputSchema 설명 명확
- [ ] 입출력 형식 문서화
- [ ] 에러 코드 정리
- [ ] 제한사항 기록

---

## 일반적인 패턴

### 패턴 1: 단순 읽기 도구

```javascript
async function simpleTool(config, logger, path) {
  // 1. 입력 검증
  if (!path) throw new Error('PATH_REQUIRED');
  
  // 2. 경로 검증
  const absolutePath = validatePath(config.docsRoot, path);
  
  // 3. 존재 확인
  const stats = await fs.stat(absolutePath);
  if (!stats.isFile()) throw new Error('NOT_FOUND: Not a file');
  
  // 4. 읽기
  const content = await fs.readFile(absolutePath, 'utf-8');
  
  // 5. 로깅
  logger.info('Tool executed', { path });
  
  // 6. 반환
  return content;
}
```

### 패턴 2: 쓰기 도구 (락 필요)

```javascript
async function writeTool(config, logger, path, content) {
  const absolutePath = validatePath(config.docsRoot, path);
  
  // lockManager 사용
  return await lockManager.acquire(absolutePath, async () => {
    // 파일 쓰기
    await fs.writeFile(absolutePath, content);
    logger.info('File written', { path });
    return { success: true };
  });
}
```

### 패턴 3: 재귀 탐색 도구

```javascript
async function recursiveTool(config, logger, startPath) {
  const absolutePath = validatePath(config.docsRoot, startPath);
  const ig = ignore().add(config.excludes);
  const results = [];

  async function traverse(currentPath) {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      
      const fullPath = path.join(currentPath, entry.name);
      const relativePath = path.relative(config.docsRoot, fullPath);
      
      if (ig.ignores(relativePath)) continue;
      
      if (entry.isDirectory()) {
        await traverse(fullPath);
      } else {
        results.push(relativePath);
      }
    }
  }

  await traverse(absolutePath);
  return results;
}
```

---

## 트러블슈팅

### 문제: 도구가 "Unknown tool" 에러 반환

**원인**: executeTool()의 switch-case에 도구명이 없음

**해결**: 
1. 도구명 정확히 확인 (대소문자)
2. TOOLS 배열의 name과 switch-case의 case가 일치하는지 확인
3. 함수 import 확인

### 문제: 경로 검증 에러

**원인**: `validatePath()` 호출 시 rootPath가 잘못됨

**해결**:
```javascript
// 올바른 사용
const absolutePath = validatePath(config.docsRoot, userPath);

// 잘못된 사용
const absolutePath = validatePath(config.docsRoot, '/absolute/path');  // ❌ 절대 경로 불가
```

### 문제: 파일 잠금 타임아웃

**원인**: 다른 작업이 같은 파일을 사용 중

**해결**:
```javascript
try {
  await lockManager.acquire(path, asyncFn);
} catch (error) {
  if (error.code === 'LOCK_TIMEOUT') {
    logger.warn('Lock timeout - retrying', { path });
    // 재시도 또는 큐잉
  }
}
```

---

## 유용한 레퍼런스

### config 객체

```javascript
{
  docsRoot: '/absolute/path/to/docs',  // 항상 절대 경로
  apiKey: 'secure-key',                 // 인증용
  excludes: ['*.tmp', '**/.git/'],     // gitignore 패턴
  maxUploadMB: 10,
  logDir: './logs',
  logLevel: 'info'
}
```

### logger 메서드

```javascript
logger.debug(message, { key: value });  // 상세 정보
logger.info(message, { key: value });   // 일반 정보
logger.warn(message, { key: value });   // 경고
logger.error(message, { key: value });  // 에러
```

### 필요한 import

```javascript
const fs = require('fs').promises;      // 파일 I/O
const path = require('path');           // 경로 조작
const ignore = require('ignore');       // 필터링
const { validatePath } = require('../utils/path-validator');
const lockManager = require('../utils/lock-manager');
```

---

## 다음 단계

1. **기존 도구 분석**: `src/routes/mcp.js`의 read_document 도구 코드 읽기
2. **간단한 도구부터**: list_documents 도구를 참고하여 자신의 도구 작성
3. **테스트**: curl을 이용하여 도구 테스트
4. **로깅 추가**: 각 단계에서 logger 호출
5. **에러 처리**: try-catch로 모든 경로 처리

Happy coding! 🚀
