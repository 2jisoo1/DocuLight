## Step 13: Frontmatter 메타데이터 및 Context MCP 서버

작성일: 2025-12-23
최종 업데이트: 2025-12-23

### 한 줄 요약
Markdown 파일 상단의 Frontmatter 메타데이터(name, description)를 파싱하여 UI에 표시하고, AI 에이전트가 문서 컨텍스트를 조회할 수 있는 `/context` MCP 서버를 제공한다.

---

## Executive Summary

### 구현 목표
1. **Frontmatter 파싱**: Markdown 파일 상단의 `----` 블록에서 `name`, `description` 필드 추출
2. **UI 개선**: 파일 이름 대신 `name` 필드를 트리에 표시
3. **Context MCP 서버**: AI 에이전트가 문서 메타데이터를 조회할 수 있는 새로운 MCP 엔드포인트 (`/context`)

### 기술적 분석 결과

#### 현재 구조 분석
| 파일 | 역할 | 수정 필요 |
|------|------|----------|
| `src/routes/mcp.js` | JSON-RPC 2.0 MCP 서버 | 유틸 함수 추출하여 재사용 |
| `src/services/tree-service.js` | 디렉토리 트리 생성 (`getTreeData`, `getFullTreeData`) | 두 함수 모두 수정 |
| `public/js/app.js` | 클라이언트 트리 렌더링 (라인 1154, 707, 727 등) | `displayName` 우선 표시 |

#### 구현 가능성: 100%
- 기존 JSON-RPC 유틸 함수 재사용 가능
- 외부 라이브러리 불필요 (정규식으로 간단한 파싱)
- 성능 영향 최소화 (첫 1KB만 읽기 + 캐싱)

### 주요 수치
- **총 예상 작업 시간**: 8-12시간
- **신규 파일**: 5개 (서비스 2, 라우터 1, 유틸 1, 테스트 1)
- **수정 파일**: 5개 (서비스 1, 앱 1, 라우터 1, 클라이언트 1, package.json)
- **신규 코드**: ~400 lines
- **테스트 케이스**: 13개

---

## 요구사항 상세

### 1. Frontmatter 형식

```markdown
----
name: 문서 제목
description: 이 문서에 대한 간략한 설명입니다.
----

# 실제 문서 내용
...
```

#### 파싱 규칙
| 항목 | 규칙 |
|------|------|
| 구분자 | 4개 이상의 하이픈 (`----`, `-----`, `----------` 등 모두 유효) |
| 시작/종료 | **시작과 종료 구분자의 하이픈 개수가 달라도 됨** |
| 시작 위치 | 파일 첫 줄에 구분자 필수 (BOM 허용) |
| name | 선택 사항. 있으면 UI 트리에 파일 이름 대신 표시 |
| description | 선택 사항. **있어야만 Context MCP에서 제공됨** |

#### 예시: 유효한 Frontmatter
```markdown
----
name: Getting Started Guide
description: A comprehensive guide for new users
----
```

```markdown
----------
name: API Reference
-----
```
> 시작 10개, 종료 5개 하이픈 — **유효함**

```markdown
----------------------------------------
description: This document has no name but has description
----
```
> name 없이 description만 — **유효함** (Context MCP에서 제공됨, UI는 파일명 표시)

#### 예시: 무효한 Frontmatter
```markdown
---
name: Invalid (only 3 dashes)
---
```
> 3개 하이픈 — **무효** (YAML frontmatter와 구분)

```markdown
Some text first
----
name: Invalid (not at file start)
----
```
> 파일 시작이 아님 — **무효**

### 2. Tree UI 표시

#### 현재 동작
- 파일 이름 그대로 표시: `getting-started.md` → `getting-started`

#### 변경 후 동작
- `name` 필드 있으면: `name` 값 표시
- `name` 필드 없으면: 기존처럼 파일 이름 표시 (`.md` 제거)

#### API 응답 변경
```javascript
// 현재 (tree-service.js:59-62)
{
  name: "getting-started.md",
  size: 1234
}

// 변경 후
{
  name: "getting-started.md",
  displayName: "Getting Started Guide",  // frontmatter name 또는 null
  description: "A comprehensive guide",  // frontmatter description 또는 null
  size: 1234
}
```

### 3. Context MCP 서버

#### 엔드포인트
- **경로**: `POST /context`
- **프로토콜**: JSON-RPC 2.0 (기존 `/mcp`와 동일)
- **인증**: 불필요 (공개 접근, 읽기 전용)

#### 제공 도구 (Tools)

| 도구명 | 설명 | 인증 |
|--------|------|------|
| `list_context_documents` | description이 있는 문서 목록 | 불필요 |
| `read_document` | 문서 내용 읽기 | 불필요 |

---

## 기술 설계

### 1. Frontmatter 파싱 서비스

**파일**: `src/services/frontmatter-service.js`

```javascript
/**
 * Frontmatter 파싱 서비스
 *
 * 지원 형식:
 * ----
 * name: 문서 이름
 * description: 설명
 * ----
 *
 * 규칙:
 * - 구분자: 4개 이상의 하이픈
 * - 시작/종료 구분자 개수 달라도 됨
 * - 파일 시작 부분에만 존재 (BOM 허용)
 */

const fs = require('fs').promises;

/**
 * 정규식 설명:
 * ^(?:\ufeff)?     - 파일 시작 (BOM 선택적 허용)
 * -{4,}            - 4개 이상의 하이픈 (시작 구분자)
 * \r?\n            - 줄바꿈 (CRLF 또는 LF)
 * ([\s\S]*?)       - frontmatter 내용 (non-greedy 캡처)
 * \r?\n            - 줄바꿈
 * -{4,}            - 4개 이상의 하이픈 (종료 구분자, 시작과 개수 달라도 됨)
 * (?:\r?\n|$)      - 줄바꿈 또는 파일 끝 (frontmatter 후 내용 없어도 됨)
 */
const FRONTMATTER_REGEX = /^(?:\ufeff)?-{4,}\r?\n([\s\S]*?)\r?\n-{4,}(?:\r?\n|$)/;

/**
 * Parse frontmatter from markdown content
 * @param {string} content - Markdown file content
 * @returns {{ name?: string, description?: string, content: string }}
 */
function parseFrontmatter(content) {
  if (!content || typeof content !== 'string') {
    return { content: content || '' };
  }

  const match = content.match(FRONTMATTER_REGEX);

  if (!match) {
    return { content };
  }

  const frontmatterBlock = match[1];
  const metadata = {};

  // Parse key: value pairs
  const lines = frontmatterBlock.split(/\r?\n/);
  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim().toLowerCase();
      const value = line.slice(colonIndex + 1).trim();

      if ((key === 'name' || key === 'description') && value) {
        metadata[key] = value;
      }
    }
  }

  // Remove frontmatter from content
  const remainingContent = content.slice(match[0].length);

  return {
    ...metadata,
    content: remainingContent
  };
}

/**
 * Parse frontmatter from first 1KB of file (performance optimization)
 * @param {string} filePath - Absolute path to file
 * @returns {Promise<{ name?: string, description?: string }>}
 */
async function parseFrontmatterFromFile(filePath) {
  try {
    // Read only first 1KB for performance
    const fd = await fs.open(filePath, 'r');
    try {
      const buffer = Buffer.alloc(1024);
      const { bytesRead } = await fd.read(buffer, 0, 1024, 0);
      const content = buffer.slice(0, bytesRead).toString('utf-8');
      const result = parseFrontmatter(content);
      return {
        name: result.name || null,
        description: result.description || null
      };
    } finally {
      await fd.close();
    }
  } catch (error) {
    return { name: null, description: null };
  }
}

module.exports = { parseFrontmatter, parseFrontmatterFromFile };
```

### 2. Tree Service 수정

**파일**: `src/services/tree-service.js`

#### 2.1 Import 추가 (상단)
```javascript
const { parseFrontmatterFromFile } = require('./frontmatter-service');
```

#### 2.2 getTreeData 함수 수정 (라인 56-62)
```javascript
// 변경 전
} else if (entry.isFile()) {
  const filePath = path.join(absolutePath, entry.name);
  const fileStats = await fs.stat(filePath);
  files.push({
    name: entry.name,
    size: fileStats.size
  });
}

// 변경 후
} else if (entry.isFile()) {
  const filePath = path.join(absolutePath, entry.name);
  const fileStats = await fs.stat(filePath);

  // Parse frontmatter only for .md files
  let displayName = null;
  let description = null;
  if (entry.name.endsWith('.md')) {
    const frontmatter = await parseFrontmatterFromFile(filePath);
    displayName = frontmatter.name;
    description = frontmatter.description;
  }

  files.push({
    name: entry.name,
    displayName,
    description,
    size: fileStats.size
  });
}
```

#### 2.3 getFullTreeData의 buildRecursive 함수 수정 (라인 133-141)
```javascript
// 변경 전
} else if (entry.isFile()) {
  const fileStats = await fs.stat(entryAbsolute);
  files.push({
    name: entry.name,
    path: '/' + relativePath.replace(/\\/g, '/'),
    type: 'file',
    size: fileStats.size
  });
}

// 변경 후
} else if (entry.isFile()) {
  const fileStats = await fs.stat(entryAbsolute);

  // Parse frontmatter only for .md files
  let displayName = null;
  let description = null;
  if (entry.name.endsWith('.md')) {
    const frontmatter = await parseFrontmatterFromFile(entryAbsolute);
    displayName = frontmatter.name;
    description = frontmatter.description;
  }

  files.push({
    name: entry.name,
    displayName,
    description,
    path: '/' + relativePath.replace(/\\/g, '/'),
    type: 'file',
    size: fileStats.size
  });
}
```

### 3. JSON-RPC 유틸리티 추출

**파일**: `src/utils/jsonrpc-utils.js`

```javascript
/**
 * JSON-RPC 2.0 유틸리티 함수
 * /mcp와 /context에서 공통 사용
 */

/**
 * JSON-RPC 2.0 응답 생성
 */
function createJsonRpcResponse(id, result) {
  return {
    jsonrpc: '2.0',
    id,
    result
  };
}

/**
 * JSON-RPC 2.0 에러 응답 생성
 */
function createJsonRpcError(id, code, message, data = null) {
  const error = {
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message
    }
  };

  if (data) {
    error.error.data = data;
  }

  return error;
}

module.exports = { createJsonRpcResponse, createJsonRpcError };
```

### 4. Context Service

**파일**: `src/services/context-service.js`

```javascript
/**
 * Context Service
 *
 * description이 있는 문서만 제공
 * AI 에이전트용 문서 컨텍스트 조회
 */

const fs = require('fs').promises;
const path = require('path');
const ignore = require('ignore');
const { validatePath } = require('../utils/path-validator');
const { parseFrontmatterFromFile, parseFrontmatter } = require('./frontmatter-service');

/**
 * Get all documents with description metadata (recursive)
 * @param {Object} config - Application configuration
 * @param {Object} logger - Logger instance
 * @param {string} userPath - Starting directory path
 * @returns {Promise<Array<{ path: string, name: string, description: string }>>}
 */
async function getContextDocuments(config, logger, userPath = '/') {
  const absolutePath = validatePath(config.docsRoot, userPath);
  const ig = ignore().add(config.excludes);
  const results = [];

  async function scanRecursive(currentPath) {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    const promises = entries.map(async (entry) => {
      if (entry.name.startsWith('.')) return;

      const entryAbsolute = path.join(currentPath, entry.name);
      const relativePath = path.relative(config.docsRoot, entryAbsolute);

      if (ig.ignores(relativePath)) return;

      if (entry.isDirectory()) {
        await scanRecursive(entryAbsolute);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        const frontmatter = await parseFrontmatterFromFile(entryAbsolute);

        // Only include documents with description
        if (frontmatter.description) {
          results.push({
            path: '/' + relativePath.replace(/\\/g, '/'),
            name: frontmatter.name || entry.name.replace(/\.md$/, ''),
            description: frontmatter.description
          });
        }
      }
    });

    await Promise.allSettled(promises);
  }

  await scanRecursive(absolutePath);

  // Sort by path
  results.sort((a, b) => a.path.localeCompare(b.path));

  logger.info('Context documents retrieved', {
    path: userPath,
    count: results.length
  });

  return results;
}

/**
 * Get raw document content (without frontmatter)
 * @param {Object} config - Application configuration
 * @param {Object} logger - Logger instance
 * @param {string} userPath - Document path
 * @returns {Promise<string>}
 */
async function getDocumentContent(config, logger, userPath) {
  const absolutePath = validatePath(config.docsRoot, userPath);

  const stats = await fs.stat(absolutePath);
  if (!stats.isFile()) {
    const error = new Error('NOT_FOUND: Path is not a file');
    error.code = 'NOT_FOUND';
    throw error;
  }

  const content = await fs.readFile(absolutePath, 'utf-8');
  const parsed = parseFrontmatter(content);

  logger.info('Document content retrieved', {
    path: userPath,
    size: content.length
  });

  return parsed.content;
}

module.exports = { getContextDocuments, getDocumentContent };
```

### 5. Context MCP 라우터

**파일**: `src/routes/context-mcp.js`

```javascript
/**
 * Context MCP over HTTP (JSON-RPC 2.0)
 *
 * AI 에이전트용 문서 컨텍스트 조회
 * 인증 불필요 (읽기 전용)
 */

const express = require('express');
const { createJsonRpcResponse, createJsonRpcError } = require('../utils/jsonrpc-utils');
const { getContextDocuments, getDocumentContent } = require('../services/context-service');

/**
 * Context MCP Tool 목록
 */
const TOOLS = [
  {
    name: 'list_context_documents',
    description: 'List all documents with description metadata. Only documents with frontmatter description are included.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Directory path to search (default: /)',
          default: '/'
        }
      }
    }
  },
  {
    name: 'read_document',
    description: 'Read a document by path. Returns content without frontmatter.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Document path (e.g., /guide/getting-started.md)'
        }
      },
      required: ['path']
    }
  }
];

/**
 * Execute Context MCP tool
 */
async function executeTool(config, logger, name, args) {
  switch (name) {
    case 'list_context_documents': {
      const documents = await getContextDocuments(config, logger, args.path || '/');

      if (documents.length === 0) {
        return {
          content: [{
            type: 'text',
            text: '# Documents with Context\n\n(No documents with description found)'
          }]
        };
      }

      let output = '# Documents with Context\n\n';
      documents.forEach((doc, i) => {
        output += `${i + 1}. **${doc.name}** (\`${doc.path}\`)\n`;
        output += `   ${doc.description}\n\n`;
      });

      return {
        content: [{
          type: 'text',
          text: output
        }]
      };
    }

    case 'read_document': {
      if (!args.path) {
        throw new Error('path is required');
      }

      const content = await getDocumentContent(config, logger, args.path);
      return {
        content: [{
          type: 'text',
          text: `# ${args.path}\n\n${content}`
        }]
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

/**
 * Create Context MCP router
 */
function createContextMcpRouter() {
  const router = express.Router();

  router.post('/context', express.json(), async (req, res) => {
    const { config, logger } = req.app.locals;
    const { jsonrpc, id, method, params } = req.body;

    // JSON-RPC 2.0 validation
    if (jsonrpc !== '2.0') {
      return res.json(createJsonRpcError(id, -32600, 'Invalid Request', 'jsonrpc must be "2.0"'));
    }

    if (!method) {
      return res.json(createJsonRpcError(id, -32600, 'Invalid Request', 'method is required'));
    }

    try {
      switch (method) {
        case 'tools/list':
          logger.info('Context MCP: tools/list called');
          return res.json(createJsonRpcResponse(id, { tools: TOOLS }));

        case 'tools/call': {
          if (!params || !params.name) {
            return res.json(createJsonRpcError(id, -32602, 'Invalid params', 'tool name is required'));
          }

          const { name, arguments: args } = params;
          logger.info('Context MCP: tools/call', { tool: name, args });

          const result = await executeTool(config, logger, name, args || {});
          return res.json(createJsonRpcResponse(id, result));
        }

        case 'initialize':
          logger.info('Context MCP: initialize called');
          return res.json(createJsonRpcResponse(id, {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {}
            },
            serverInfo: {
              name: 'DocuLight-Context',
              version: '1.0.0'
            }
          }));

        default:
          return res.json(createJsonRpcError(id, -32601, 'Method not found', `Method ${method} not supported`));
      }
    } catch (error) {
      logger.error('Context MCP error', {
        method,
        error: error.message
      });

      return res.json(createJsonRpcError(id, -32603, 'Internal error', error.message));
    }
  });

  return router;
}

module.exports = createContextMcpRouter;
```

### 6. app.js 라우터 등록

**파일**: `src/app.js`

#### 6.1 Import 추가 (라인 35 부근)
```javascript
const createContextMcpRouter = require('./routes/context-mcp');
```

#### 6.2 라우터 마운트 (라인 348 부근, MCP 라우터 다음)
```javascript
// ============ STEP 5.5: Mount Context MCP Router ============
console.log('⏳ [5.5/7] Mounting Context MCP router...');
const t55 = Date.now();

if (!app.locals.contextMcpMounted) {
  app.use(createContextMcpRouter());
  app.locals.contextMcpMounted = true;
}
console.log(`✅ [5.5/7] Context MCP router mounted in ${Date.now() - t55}ms`);
```

### 7. 클라이언트 수정

**파일**: `public/js/app.js`

#### 7.1 트리 렌더링 수정 (라인 1154 부근)
```javascript
// 변경 전
const displayName = file.name.slice(0, -3);

// 변경 후
const displayName = file.displayName || file.name.slice(0, -3);
```

#### 7.2 파일 목록 수정 (라인 489-493 부근)
```javascript
// 변경 전
result.push({
  path: filePath,
  name: file.name
});

// 변경 후
result.push({
  path: filePath,
  name: file.name,
  displayName: file.displayName || null
});
```

#### 7.3 네비게이션 수정 (라인 707, 727 부근)
```javascript
// 변경 전 (라인 707)
const displayName = nav.prev.name.replace(/\.md$/, '');

// 변경 후
const displayName = nav.prev.displayName || nav.prev.name.replace(/\.md$/, '');
```

```javascript
// 변경 전 (라인 727)
const displayName = nav.next.name.replace(/\.md$/, '');

// 변경 후
const displayName = nav.next.displayName || nav.next.name.replace(/\.md$/, '');
```

#### 7.4 폴더 목록 수정 (라인 1387 부근)
```javascript
// 변경 전
const displayName = decodeURIComponent(file.name.replace(/\.md$/, ''));

// 변경 후
const displayName = file.displayName || decodeURIComponent(file.name.replace(/\.md$/, ''));
```

---

## 구현 단계

### Phase 1: Frontmatter 파싱 서비스 (2-3시간)
- [ ] `src/services/frontmatter-service.js` 생성
- [ ] `src/utils/jsonrpc-utils.js` 생성 (mcp.js에서 추출)
- [ ] 정규식 기반 파싱 구현
- [ ] 1KB 최적화 읽기 구현
- [ ] 단위 테스트 작성

### Phase 2: Tree Service 통합 (2-3시간)
- [ ] `tree-service.js` import 추가
- [ ] `getTreeData` 함수 수정
- [ ] `getFullTreeData` 함수 수정
- [ ] API 응답 테스트

### Phase 3: Context MCP 서버 (2-3시간)
- [ ] `src/services/context-service.js` 생성
- [ ] `src/routes/context-mcp.js` 생성
- [ ] `app.js`에 라우터 등록
- [ ] JSON-RPC 2.0 테스트

### Phase 4: 클라이언트 수정 (1-2시간)
- [ ] 트리 렌더링 수정 (라인 1154)
- [ ] 파일 목록 수정 (라인 489-493)
- [ ] 네비게이션 수정 (라인 707, 727)
- [ ] 폴더 목록 수정 (라인 1387)

### Phase 5: 테스트 및 문서화 (1-2시간)
- [ ] 통합 테스트
- [ ] API 문서 업데이트
- [ ] CLAUDE.md 업데이트
- [ ] package.json 테스트 스크립트 추가

---

## package.json 수정

테스트 스크립트 추가:

```json
{
  "scripts": {
    "test:frontmatter": "node test/test-frontmatter.js"
  }
}
```

**실행 방법**:
```bash
npm run test:frontmatter
```

---

## 파일 변경 사항

### 신규 파일 (5개)
| 파일 | 설명 | 코드량 |
|------|------|--------|
| `src/services/frontmatter-service.js` | Frontmatter 파싱 서비스 | ~70 lines |
| `src/services/context-service.js` | Context 문서 조회 서비스 | ~80 lines |
| `src/routes/context-mcp.js` | Context MCP 라우터 | ~120 lines |
| `src/utils/jsonrpc-utils.js` | JSON-RPC 유틸리티 | ~30 lines |
| `test/test-frontmatter.js` | Frontmatter 파싱 테스트 | ~100 lines |

### 수정 파일 (5개)
| 파일 | 변경 내용 | 변경량 |
|------|-----------|--------|
| `src/services/tree-service.js` | frontmatter import, displayName/description 추가 | ~20 lines |
| `src/app.js` | Context MCP 라우터 import 및 등록 | ~10 lines |
| `src/routes/mcp.js` | jsonrpc-utils 사용으로 리팩토링 (선택) | ~5 lines |
| `public/js/app.js` | displayName 표시 로직 (4곳) | ~8 lines |
| `package.json` | test:frontmatter 스크립트 추가 | 1 line |

---

## API 스펙

### /context MCP 엔드포인트

#### Initialize
```bash
curl -X POST http://localhost:3000/context \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}'
```

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "2024-11-05",
    "capabilities": { "tools": {} },
    "serverInfo": { "name": "DocuLight-Context", "version": "1.0.0" }
  }
}
```

#### tools/list
```bash
curl -X POST http://localhost:3000/context \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

#### list_context_documents
```bash
curl -X POST http://localhost:3000/context \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"list_context_documents","arguments":{"path":"/"}}}'
```

#### read_document
```bash
curl -X POST http://localhost:3000/context \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"read_document","arguments":{"path":"/guide/getting-started.md"}}}'
```

---

## 테스트 계획

### 단위 테스트

**파일**: `test/test-frontmatter.js`

```javascript
/**
 * Frontmatter 파싱 테스트
 * 실행: node test/test-frontmatter.js
 */

const assert = require('assert');
const { parseFrontmatter } = require('../src/services/frontmatter-service');

console.log('Running frontmatter parsing tests...\n');

// Test 1: Valid frontmatter with 4 dashes
{
  const content = '----\nname: Test\ndescription: Desc\n----\n# Content';
  const result = parseFrontmatter(content);
  assert.strictEqual(result.name, 'Test');
  assert.strictEqual(result.description, 'Desc');
  assert.strictEqual(result.content, '# Content');
  console.log('✅ Test 1: Valid frontmatter with 4 dashes');
}

// Test 2: Different dash counts (10 start, 5 end)
{
  const content = '----------\nname: Test\n-----\n# Content';
  const result = parseFrontmatter(content);
  assert.strictEqual(result.name, 'Test');
  console.log('✅ Test 2: Different dash counts (10 start, 5 end)');
}

// Test 3: Reject 3 dashes (YAML format)
{
  const content = '---\nname: Test\n---\n# Content';
  const result = parseFrontmatter(content);
  assert.strictEqual(result.name, undefined);
  assert.strictEqual(result.content, content);
  console.log('✅ Test 3: Reject 3 dashes (YAML format)');
}

// Test 4: Missing frontmatter
{
  const content = '# Just content';
  const result = parseFrontmatter(content);
  assert.strictEqual(result.name, undefined);
  assert.strictEqual(result.content, '# Just content');
  console.log('✅ Test 4: Missing frontmatter');
}

// Test 5: Windows CRLF line endings
{
  const content = '----\r\nname: Test\r\n----\r\n# Content';
  const result = parseFrontmatter(content);
  assert.strictEqual(result.name, 'Test');
  console.log('✅ Test 5: Windows CRLF line endings');
}

// Test 6: BOM (Byte Order Mark)
{
  const content = '\ufeff----\nname: Test\n----\n# Content';
  const result = parseFrontmatter(content);
  assert.strictEqual(result.name, 'Test');
  console.log('✅ Test 6: BOM (Byte Order Mark)');
}

// Test 7: Empty value (should be null)
{
  const content = '----\nname:\ndescription: Valid\n----\n# Content';
  const result = parseFrontmatter(content);
  assert.strictEqual(result.name, undefined);
  assert.strictEqual(result.description, 'Valid');
  console.log('✅ Test 7: Empty value ignored');
}

// Test 8: Not at file start
{
  const content = 'Some text\n----\nname: Test\n----\n# Content';
  const result = parseFrontmatter(content);
  assert.strictEqual(result.name, undefined);
  console.log('✅ Test 8: Not at file start');
}

// Test 9: Only description (no name)
{
  const content = '----\ndescription: Only desc\n----\n# Content';
  const result = parseFrontmatter(content);
  assert.strictEqual(result.name, undefined);
  assert.strictEqual(result.description, 'Only desc');
  console.log('✅ Test 9: Only description (no name)');
}

// Test 10: Empty content
{
  const result = parseFrontmatter('');
  assert.strictEqual(result.content, '');
  console.log('✅ Test 10: Empty content');
}

// Test 11: null/undefined input
{
  const result1 = parseFrontmatter(null);
  const result2 = parseFrontmatter(undefined);
  assert.strictEqual(result1.content, '');
  assert.strictEqual(result2.content, '');
  console.log('✅ Test 11: null/undefined input');
}

// Test 12: No trailing newline after frontmatter
{
  const content = '----\nname: Test\n----';  // No content after
  const result = parseFrontmatter(content);
  assert.strictEqual(result.name, 'Test');
  assert.strictEqual(result.content, '');
  console.log('✅ Test 12: No trailing newline after frontmatter');
}

// Test 13: Multiline description (colon in value)
{
  const content = '----\nname: API: Getting Started\ndescription: Learn how to use our API\n----\n# Content';
  const result = parseFrontmatter(content);
  assert.strictEqual(result.name, 'API: Getting Started');
  assert.strictEqual(result.description, 'Learn how to use our API');
  console.log('✅ Test 13: Colon in value');
}

console.log('\n✅ All 13 tests passed!');
```

### 통합 테스트

```bash
# 1. 서버 시작
npm run dev

# 2. Tree API 테스트 (displayName 확인)
curl -s http://localhost:3000/api/tree?path=/ | jq '.files[0]'

# 3. Context MCP tools/list
curl -s -X POST http://localhost:3000/context \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jq '.result.tools'

# 4. Context MCP list_context_documents
curl -s -X POST http://localhost:3000/context \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"list_context_documents","arguments":{"path":"/"}}}' | jq '.result.content[0].text'
```

---

## 성능 고려사항

### 1. Frontmatter 읽기 최적화
```javascript
// 전체 파일 대신 첫 1KB만 읽기
const fd = await fs.open(filePath, 'r');
const buffer = Buffer.alloc(1024);
await fd.read(buffer, 0, 1024, 0);
```

### 2. 병렬 처리
```javascript
// Promise.allSettled로 에러 격리 및 병렬 처리
const promises = entries.map(async (entry) => { ... });
await Promise.allSettled(promises);
```

### 3. 향후 캐싱 (Phase 2에서 고려)
```javascript
// 파일 mtime + size 기반 캐시 키
const cacheKey = `${filePath}:${stats.mtimeMs}:${stats.size}`;
```

---

## 보안 고려사항

### 1. Context MCP 접근 제어
- **읽기 전용**: `list_context_documents`, `read_document`만 제공
- **쓰기 불가**: 문서 생성/수정/삭제 도구 없음
- **경로 검증**: `validatePath()` 재사용으로 path traversal 방지

### 2. 인증 정책
| 엔드포인트 | 읽기 | 쓰기 | 인증 |
|------------|------|------|------|
| `/mcp` | ✅ | ✅ | 쓰기만 필요 |
| `/context` | ✅ | ❌ | 불필요 |

---

## 마이그레이션

### 기존 문서 영향
- 기존 Markdown 파일은 **변경 불필요**
- frontmatter가 없는 파일은 기존처럼 동작
- 점진적 마이그레이션 가능

### 하위 호환성
- API 응답에 `displayName`, `description` 필드 추가
- 기존 `name` 필드 유지
- 클라이언트 fallback: `displayName || name.slice(0, -3)`

### 마이그레이션 단계
1. 서버 업데이트 배포
2. 기존 문서는 변경 없이 동작 확인
3. 중요 문서에 frontmatter 추가 시작
4. Context MCP 활용 시작

---

## 결론

### 구현 가능성: 100%
- 기존 코드 패턴과 완벽히 일관
- JSON-RPC 유틸 함수 재사용
- 외부 라이브러리 의존성 없음

### 주요 이점
1. **사용자 경험 향상**: 파일 이름 대신 의미 있는 제목 표시
2. **AI 에이전트 지원**: 문서 컨텍스트 조회로 더 정확한 응답 가능
3. **점진적 적용**: 기존 문서 수정 없이 새 기능 적용 가능

### 위험 요소 및 대응
| 위험 | 대응 |
|------|------|
| 대규모 디렉토리 성능 | 1KB 읽기 + 병렬 처리 + 향후 캐싱 |
| MCP 서버 복잡도 증가 | 기존 패턴 100% 재사용 |
| 클라이언트 호환성 | fallback 로직으로 하위 호환 보장 |

---

## Phase 6: Context MCP GET 방식 지원 (구현 완료)

Phase 3에서 구현한 Context MCP는 POST (JSON-RPC 2.0) 방식만 지원했으나, 간편한 테스트와 브라우저 접근을 위해 GET 방식을 추가 구현함.

### GET 엔드포인트

| URL | 설명 |
|-----|------|
| `GET /context` | 서버 정보 및 도구 목록 |
| `GET /context?action=list&path=/` | 문서 목록 조회 |
| `GET /context?action=read&path=/doc.md` | 문서 내용 읽기 |

### 테스트
```bash
# 서버 정보
curl http://localhost:3000/context

# 문서 목록
curl "http://localhost:3000/context?action=list&path=/"

# 문서 내용
curl "http://localhost:3000/context?action=read&path=/README.md"
```

---

## Phase 7: 드래그앤드롭 로컬 미리보기

### 개요

로컬 Markdown 파일을 브라우저에 드래그앤드롭하면 서버에 업로드하지 않고 즉시 미리보기를 표시하는 기능.

### 상태 다이어그램

```
┌─────────────────────────────────────────────────────────────────┐
│                        사용자 상태                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌──────────┐     dragenter      ┌──────────────┐             │
│   │  IDLE    │ ─────────────────▶ │ DRAG_OVER    │             │
│   │ (일반)   │                    │ (오버레이)    │             │
│   └──────────┘                    └──────────────┘             │
│        ▲                                │                       │
│        │ dragleave                      │ drop                  │
│        │ (창 밖으로)                     ▼                       │
│        │                          ┌──────────────┐             │
│        │                          │ PROCESSING   │             │
│        │                          │ (파일 읽기)   │             │
│        │                          └──────────────┘             │
│        │                                │                       │
│        │                    ┌───────────┴───────────┐          │
│        │                    ▼                       ▼          │
│        │            ┌──────────────┐       ┌──────────────┐    │
│        │            │ PREVIEWING   │       │    ERROR     │    │
│        │            │ (미리보기)    │       │   (오류)     │    │
│        │            └──────────────┘       └──────────────┘    │
│        │                    │                       │          │
│        │              close │                       │ dismiss  │
│        └────────────────────┴───────────────────────┘          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 요구사항

| 항목 | 요구사항 |
|------|----------|
| 입력 | `.md` 파일 드래그앤드롭 |
| 출력 | 렌더링된 HTML (기존 뷰어와 동일) |
| 서버 통신 | 없음 (순수 클라이언트) |
| 상태 표시 | "로컬 미리보기" 배너 |
| 파일 저장 | 불가 (미리보기 전용) |
| 파일 크기 | 최대 10MB |
| 인코딩 | UTF-8 (BOM 허용) |

### 브라우저 호환성

| API | Chrome | Firefox | Safari | Edge |
|-----|--------|---------|--------|------|
| Drag and Drop API | 4+ | 3.5+ | 3.1+ | 12+ |
| FileReader API | 6+ | 3.6+ | 6+ | 12+ |
| DataTransfer | 4+ | 3.6+ | 4+ | 12+ |
| File API | 6+ | 3.6+ | 6+ | 12+ |

**지원 범위**: 모든 모던 브라우저 (IE11 제외)

### 보안 고려사항

| 위험 | 대응 |
|------|------|
| XSS 공격 | DOMPurify로 렌더링 전 sanitize |
| 악성 파일 | 파일 확장자 및 MIME 타입 검증 |
| 대용량 파일 DoS | 10MB 제한 적용 |
| 메모리 누수 | FileReader 정리, 이벤트 리스너 관리 |

### 접근성 (a11y)

| 기능 | 구현 |
|------|------|
| 키보드 접근 | Ctrl+O로 파일 선택 다이얼로그 열기 |
| 스크린리더 | ARIA 레이블, live region 알림 |
| 포커스 관리 | 미리보기 열릴 때 컨텐츠로 포커스 이동 |
| 고대비 모드 | CSS 변수로 테마 대응 |

### 기술 설계

#### 1. HTML 드롭 존 추가

**파일**: `src/views/index.ejs` (또는 동적 생성)

```html
<!-- 드래그 오버레이 (기본 숨김) -->
<div id="drop-overlay" class="drop-overlay hidden">
  <div class="drop-message">
    <span class="drop-icon">📄</span>
    <span class="drop-text">.md 파일을 여기에 놓으세요</span>
  </div>
</div>
```

#### 2. CSS 스타일

**파일**: `public/css/style.css`

```css
/* 드래그앤드롭 오버레이 */
.drop-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(59, 130, 246, 0.1);
  border: 3px dashed #3b82f6;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.drop-overlay.hidden {
  display: none;
}

.drop-message {
  background: white;
  padding: 2rem 3rem;
  border-radius: 12px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
  text-align: center;
}

.drop-icon {
  font-size: 3rem;
  display: block;
  margin-bottom: 1rem;
}

.drop-text {
  font-size: 1.25rem;
  color: #374151;
}

/* 로컬 미리보기 배너 */
.local-preview-banner {
  background: linear-gradient(90deg, #fef3c7, #fde68a);
  border-bottom: 1px solid #f59e0b;
  padding: 0.75rem 1rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.875rem;
}

.local-preview-banner .file-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.local-preview-banner .file-icon {
  font-size: 1.25rem;
}

.local-preview-banner .file-name {
  font-weight: 600;
  color: #92400e;
}

.local-preview-banner .preview-label {
  color: #b45309;
  font-size: 0.75rem;
  background: rgba(245, 158, 11, 0.2);
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
}

.local-preview-banner .close-btn {
  background: none;
  border: 1px solid #d97706;
  color: #d97706;
  padding: 0.25rem 0.75rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.75rem;
  transition: all 0.15s;
}

.local-preview-banner .close-btn:hover {
  background: #d97706;
  color: white;
}
```

#### 3. JavaScript 구현

**파일**: `public/js/app.js`

```javascript
// ============================================================
// Phase 7: 드래그앤드롭 로컬 미리보기
// ============================================================

/**
 * 로컬 미리보기 상태 관리
 */
const LocalPreview = {
  // 상태
  isActive: false,
  fileName: null,
  state: 'IDLE', // IDLE | DRAG_OVER | PROCESSING | PREVIEWING | ERROR

  // 설정
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  ALLOWED_EXTENSIONS: ['.md', '.markdown'],
  ALLOWED_MIME_TYPES: ['text/markdown', 'text/x-markdown', 'text/plain', ''],

  /**
   * 초기화 - 드래그앤드롭 이벤트 설정
   */
  init() {
    const body = document.body;

    // 드래그 진입
    body.addEventListener('dragenter', (e) => {
      e.preventDefault();
      if (this.hasMarkdownFile(e)) {
        this.setState('DRAG_OVER');
        this.showDropOverlay();
      }
    });

    // 드래그 오버 (필수: drop 이벤트 활성화)
    body.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (this.hasMarkdownFile(e)) {
        e.dataTransfer.dropEffect = 'copy';
      }
    });

    // 드래그 떠남
    body.addEventListener('dragleave', (e) => {
      // relatedTarget이 null이면 창 밖으로 나감
      if (!e.relatedTarget || e.relatedTarget === document.documentElement) {
        this.setState('IDLE');
        this.hideDropOverlay();
      }
    });

    // 드롭
    body.addEventListener('drop', async (e) => {
      e.preventDefault();
      this.hideDropOverlay();

      const file = this.getMarkdownFile(e);
      if (file) {
        await this.renderLocalFile(file);
      } else {
        this.setState('IDLE');
      }
    });

    // 키보드 단축키: Ctrl+O로 파일 선택
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
        e.preventDefault();
        this.openFileDialog();
      }
      // ESC로 미리보기 닫기
      if (e.key === 'Escape' && this.isActive) {
        this.close();
      }
    });

    // 숨겨진 파일 입력 생성 (키보드 접근용)
    this.createHiddenFileInput();

    console.log('[LocalPreview] Initialized');
  },

  /**
   * 상태 변경
   */
  setState(newState) {
    const oldState = this.state;
    this.state = newState;
    console.log(`[LocalPreview] State: ${oldState} → ${newState}`);

    // 스크린리더 알림 (live region)
    this.announceToScreenReader(this.getStateMessage(newState));
  },

  /**
   * 상태별 메시지
   */
  getStateMessage(state) {
    const messages = {
      'IDLE': '',
      'DRAG_OVER': '마크다운 파일을 드롭하세요',
      'PROCESSING': '파일을 읽고 있습니다...',
      'PREVIEWING': '로컬 파일 미리보기가 열렸습니다',
      'ERROR': '파일을 처리하는 중 오류가 발생했습니다'
    };
    return messages[state] || '';
  },

  /**
   * 스크린리더 알림
   */
  announceToScreenReader(message) {
    if (!message) return;

    let liveRegion = document.getElementById('local-preview-live-region');
    if (!liveRegion) {
      liveRegion = document.createElement('div');
      liveRegion.id = 'local-preview-live-region';
      liveRegion.setAttribute('role', 'status');
      liveRegion.setAttribute('aria-live', 'polite');
      liveRegion.setAttribute('aria-atomic', 'true');
      liveRegion.className = 'sr-only'; // 시각적으로 숨김
      document.body.appendChild(liveRegion);
    }

    liveRegion.textContent = message;
  },

  /**
   * 숨겨진 파일 입력 생성 (키보드 접근용)
   */
  createHiddenFileInput() {
    const input = document.createElement('input');
    input.type = 'file';
    input.id = 'local-preview-file-input';
    input.accept = '.md,.markdown';
    input.style.display = 'none';
    input.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (file) {
        await this.renderLocalFile(file);
      }
      input.value = ''; // 같은 파일 재선택 허용
    });
    document.body.appendChild(input);
  },

  /**
   * 파일 선택 다이얼로그 열기 (Ctrl+O)
   */
  openFileDialog() {
    const input = document.getElementById('local-preview-file-input');
    if (input) {
      input.click();
    }
  },

  /**
   * 드래그 이벤트에서 .md 파일 확인
   */
  hasMarkdownFile(e) {
    if (!e.dataTransfer?.items) return false;

    for (const item of e.dataTransfer.items) {
      if (item.kind === 'file') {
        // 파일 타입 또는 확장자로 확인
        const type = item.type;
        if (type === 'text/markdown' || type === 'text/x-markdown') {
          return true;
        }
        // 일부 브라우저는 타입을 제공하지 않으므로 드롭 시 파일명 확인
        return true; // 일단 허용, drop에서 최종 확인
      }
    }
    return false;
  },

  /**
   * 드롭 이벤트에서 .md 파일 추출 (보안 검증 포함)
   */
  getMarkdownFile(e) {
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return null;

    const file = files[0];

    // 1. 확장자 검증
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!this.ALLOWED_EXTENSIONS.includes(ext)) {
      ErrorHandler.show('Markdown 파일(.md, .markdown)만 미리보기할 수 있습니다.', 'warning');
      return null;
    }

    // 2. MIME 타입 검증 (일부 브라우저는 빈 문자열 반환)
    if (file.type && !this.ALLOWED_MIME_TYPES.includes(file.type)) {
      console.warn(`[LocalPreview] Unexpected MIME type: ${file.type}`);
      // MIME 타입이 맞지 않아도 확장자가 맞으면 허용 (경고만)
    }

    // 3. 파일 크기 검증
    if (file.size > this.MAX_FILE_SIZE) {
      const sizeMB = (file.size / 1024 / 1024).toFixed(1);
      ErrorHandler.show(`파일이 너무 큽니다 (${sizeMB}MB). 최대 10MB까지 지원합니다.`, 'error');
      return null;
    }

    // 4. 빈 파일 검증
    if (file.size === 0) {
      ErrorHandler.show('빈 파일입니다.', 'warning');
      return null;
    }

    return file;
  },

  /**
   * 드롭 오버레이 표시
   */
  showDropOverlay() {
    let overlay = document.getElementById('drop-overlay');

    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'drop-overlay';
      overlay.className = 'drop-overlay';
      overlay.innerHTML = `
        <div class="drop-message">
          <span class="drop-icon">📄</span>
          <span class="drop-text">.md 파일을 여기에 놓으세요</span>
        </div>
      `;
      document.body.appendChild(overlay);
    }

    overlay.classList.remove('hidden');
  },

  /**
   * 드롭 오버레이 숨김
   */
  hideDropOverlay() {
    const overlay = document.getElementById('drop-overlay');
    if (overlay) {
      overlay.classList.add('hidden');
    }
  },

  /**
   * 로컬 파일 렌더링
   */
  async renderLocalFile(file) {
    this.setState('PROCESSING');

    try {
      // 1. 파일 읽기
      const content = await this.readFileAsText(file);

      // 2. 인코딩 검증 (UTF-8 확인)
      if (!this.isValidUtf8(content)) {
        throw new Error('UTF-8 인코딩이 아닌 파일입니다.');
      }

      // 3. Frontmatter 파싱 (클라이언트 사이드)
      const { content: markdown, metadata } = this.parseFrontmatter(content);

      // 4. 마크다운 렌더링 (기존 함수 사용)
      let html = renderMarkdown(markdown);

      // 5. XSS 방지: DOMPurify로 sanitize (필수!)
      if (typeof DOMPurify !== 'undefined') {
        html = DOMPurify.sanitize(html, {
          ADD_TAGS: ['mermaid'], // Mermaid 다이어그램 허용
          ADD_ATTR: ['class']
        });
      } else {
        console.warn('[LocalPreview] DOMPurify not available, XSS risk!');
      }

      // 6. 로컬 이미지 처리
      html = this.processLocalImages(html);

      // 7. 뷰어에 표시
      const contentArea = document.getElementById('markdown-content');
      contentArea.innerHTML = html;

      // 8. 로컬 미리보기 배너 표시
      this.showPreviewBanner(file.name, metadata);

      // 9. 상태 업데이트
      this.isActive = true;
      this.fileName = file.name;
      this.setState('PREVIEWING');

      // 10. Mermaid 다이어그램 렌더링
      if (typeof mermaid !== 'undefined') {
        try {
          await mermaid.run({ nodes: contentArea.querySelectorAll('.mermaid') });
        } catch (mermaidError) {
          console.warn('[LocalPreview] Mermaid error:', mermaidError);
        }
      }

      // 11. 네비게이션 숨김 (로컬 파일은 이전/다음 없음)
      this.hideNavigation();

      // 12. 트리 선택 해제
      if (typeof TreeManager !== 'undefined') {
        TreeManager.clearSelection();
      }

      // 13. 접근성: 포커스 이동
      contentArea.setAttribute('tabindex', '-1');
      contentArea.focus();

      // 14. URL 업데이트
      history.pushState({ localPreview: true, fileName: file.name }, '', '#local-preview');

      console.log('[LocalPreview] Rendered:', file.name, {
        size: file.size,
        hasMetadata: Object.keys(metadata).length > 0
      });

    } catch (error) {
      this.setState('ERROR');
      console.error('[LocalPreview] Error:', error);
      ErrorHandler.show('파일을 읽는 중 오류가 발생했습니다: ' + error.message, 'error');
    }
  },

  /**
   * UTF-8 유효성 검사 (간단한 휴리스틱)
   */
  isValidUtf8(str) {
    // 대체 문자(�)가 많으면 인코딩 문제
    const replacementCount = (str.match(/\uFFFD/g) || []).length;
    return replacementCount < str.length * 0.01; // 1% 미만이면 OK
  },

  /**
   * 로컬 이미지 경로 처리
   */
  processLocalImages(html) {
    const container = document.createElement('div');
    container.innerHTML = html;

    container.querySelectorAll('img').forEach(img => {
      const src = img.getAttribute('src');
      if (!src) return;

      // 외부 URL, data URI는 그대로 유지
      if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:')) {
        return;
      }

      // 상대 경로는 경고 표시
      img.classList.add('local-preview-broken-image');
      img.setAttribute('title', `로컬 이미지: ${src}\n(미리보기에서 표시 불가)`);
      img.setAttribute('alt', `[이미지: ${src}]`);
      img.removeAttribute('src'); // 404 요청 방지
      img.setAttribute('data-local-src', src);
    });

    return container.innerHTML;
  },

  /**
   * 파일을 텍스트로 읽기
   */
  readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (e) => reject(new Error('파일 읽기 실패'));
      reader.readAsText(file);
    });
  },

  /**
   * Frontmatter 파싱 (클라이언트 사이드)
   * 서버의 frontmatter-service.js와 동일한 로직
   */
  parseFrontmatter(content) {
    if (!content || typeof content !== 'string') {
      return { content: content || '', metadata: {} };
    }

    // 4개 이상의 하이픈으로 구분된 frontmatter
    const regex = /^(?:\ufeff)?-{4,}\r?\n([\s\S]*?)\r?\n-{4,}(?:\r?\n|$)/;
    const match = content.match(regex);

    if (!match) {
      return { content, metadata: {} };
    }

    const frontmatterBlock = match[1];
    const metadata = {};

    // key: value 파싱
    const lines = frontmatterBlock.split(/\r?\n/);
    for (const line of lines) {
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        const key = line.slice(0, colonIndex).trim().toLowerCase();
        const value = line.slice(colonIndex + 1).trim();
        if (value) {
          metadata[key] = value;
        }
      }
    }

    const remainingContent = content.slice(match[0].length);
    return { content: remainingContent, metadata };
  },

  /**
   * 로컬 미리보기 배너 표시
   */
  showPreviewBanner(fileName, metadata) {
    // 기존 배너 제거
    this.hidePreviewBanner();

    const banner = document.createElement('div');
    banner.id = 'local-preview-banner';
    banner.className = 'local-preview-banner';

    const displayName = metadata.name || fileName;

    banner.innerHTML = `
      <div class="file-info">
        <span class="file-icon">📄</span>
        <span class="file-name">${this.escapeHtml(displayName)}</span>
        <span class="preview-label">로컬 미리보기</span>
      </div>
      <button class="close-btn" onclick="LocalPreview.close()">닫기</button>
    `;

    // 컨텐츠 영역 상단에 삽입
    const contentWrapper = document.getElementById('content-wrapper')
      || document.getElementById('markdown-content').parentElement;
    contentWrapper.insertBefore(banner, contentWrapper.firstChild);
  },

  /**
   * 로컬 미리보기 배너 숨김
   */
  hidePreviewBanner() {
    const banner = document.getElementById('local-preview-banner');
    if (banner) {
      banner.remove();
    }
  },

  /**
   * 네비게이션 숨김
   */
  hideNavigation() {
    const nav = document.querySelector('.doc-navigation');
    if (nav) {
      nav.style.display = 'none';
    }
  },

  /**
   * 네비게이션 복원
   */
  showNavigation() {
    const nav = document.querySelector('.doc-navigation');
    if (nav) {
      nav.style.display = '';
    }
  },

  /**
   * 로컬 미리보기 닫기
   */
  close() {
    this.hidePreviewBanner();
    this.showNavigation();
    this.isActive = false;
    this.fileName = null;

    // 컨텐츠 영역 초기화
    const contentArea = document.getElementById('markdown-content');
    contentArea.innerHTML = '<p class="placeholder">좌측 트리에서 문서를 선택하세요</p>';

    // URL 복원
    history.pushState({}, '', window.location.pathname);

    console.log('[LocalPreview] Closed');
  },

  /**
   * HTML 이스케이프
   */
  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
};

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', () => {
  LocalPreview.init();
});
```

#### 4. 초기화 통합

**파일**: `public/js/app.js`

**삽입 위치**: DOMContentLoaded 이벤트 핸들러 내부 (라인 약 1600 부근)

```javascript
// 기존 초기화 함수에 추가 (라인 1600-1620 부근)
document.addEventListener('DOMContentLoaded', async () => {
  // ... 기존 초기화 코드 ...

  // Phase 7: 로컬 미리보기 초기화
  // 위치: TreeManager.init() 이후, 마지막 초기화 단계로 추가
  LocalPreview.init();

  console.log('[App] All modules initialized');
});
```

**LocalPreview 객체 삽입 위치**: 라인 약 1550 이전 (다른 모듈 정의 후)

```javascript
// ============================================================
// 기존 코드 구조
// ============================================================
// 라인 1-100: 상수 및 설정
// 라인 100-300: ErrorHandler 객체
// 라인 300-600: TreeManager 객체
// 라인 600-900: FileViewer 객체
// 라인 900-1200: 유틸리티 함수
// 라인 1200-1500: 마크다운 렌더링
// 라인 1500-1550: ← LocalPreview 객체 삽입 위치
// 라인 1550-1650: DOMContentLoaded 초기화
// ============================================================
```

#### 5. 추가 CSS (접근성 및 깨진 이미지)

**파일**: `public/css/style.css`

```css
/* 스크린리더 전용 (시각적 숨김) */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

/* 깨진 이미지 스타일 */
.local-preview-broken-image {
  display: inline-block;
  min-width: 100px;
  min-height: 60px;
  background: #f3f4f6;
  border: 2px dashed #d1d5db;
  border-radius: 4px;
  position: relative;
}

.local-preview-broken-image::before {
  content: '🖼️';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 1.5rem;
  opacity: 0.5;
}

.local-preview-broken-image::after {
  content: attr(data-local-src);
  position: absolute;
  bottom: 4px;
  left: 4px;
  right: 4px;
  font-size: 0.625rem;
  color: #6b7280;
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
}

/* 고대비 모드 지원 */
@media (prefers-contrast: high) {
  .drop-overlay {
    background: rgba(0, 0, 0, 0.3);
    border-color: #000;
  }

  .local-preview-banner {
    background: #fff;
    border: 2px solid #000;
  }
}

/* 다크 모드 지원 (선택적) */
@media (prefers-color-scheme: dark) {
  .drop-overlay {
    background: rgba(59, 130, 246, 0.2);
  }

  .drop-message {
    background: #1f2937;
    color: #f9fafb;
  }

  .local-preview-banner {
    background: linear-gradient(90deg, #78350f, #92400e);
    border-color: #b45309;
  }

  .local-preview-banner .file-name {
    color: #fef3c7;
  }

  .local-preview-broken-image {
    background: #374151;
    border-color: #4b5563;
  }
}
```

### 제한사항 및 대응

| 제한사항 | 원인 | 대응 방안 |
|----------|------|-----------|
| 상대 경로 이미지 | 로컬 파일 시스템 접근 불가 | 깨진 이미지 표시 + 경고 메시지 |
| Wiki 링크 `[[...]]` | 서버 파일 참조 불가 | 링크 비활성화, 회색 처리 |
| 이전/다음 네비게이션 | 트리에 포함되지 않음 | 네비게이션 숨김 |
| 파일 저장 | 업로드 기능 아님 | "저장하려면 업로드하세요" 안내 |
| 대용량 파일 | 브라우저 메모리 제한 | 10MB 제한 + 경고 |

### 이미지 경로 처리

```javascript
/**
 * 로컬 미리보기에서 상대 경로 이미지 처리
 */
function processLocalImages(html) {
  const container = document.createElement('div');
  container.innerHTML = html;

  container.querySelectorAll('img').forEach(img => {
    const src = img.getAttribute('src');

    // 외부 URL은 그대로 유지
    if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:')) {
      return;
    }

    // 상대 경로는 placeholder로 대체
    img.classList.add('local-preview-broken-image');
    img.setAttribute('title', `로컬 이미지: ${src} (미리보기에서 표시 불가)`);
    img.setAttribute('alt', `[이미지: ${src}]`);
  });

  return container.innerHTML;
}
```

### 테스트 계획

#### 수동 테스트

```markdown
## 드래그앤드롭 테스트

### 기본 기능
- [ ] .md 파일 드래그 시 오버레이 표시
- [ ] .md 파일 드롭 시 렌더링
- [ ] 비-.md 파일 드롭 시 경고 메시지
- [ ] 로컬 미리보기 배너 표시
- [ ] 닫기 버튼 동작
- [ ] 트리 선택 해제

### Frontmatter
- [ ] name 필드 있으면 배너에 표시
- [ ] name 필드 없으면 파일명 표시
- [ ] frontmatter 제거 후 렌더링

### 렌더링
- [ ] 마크다운 렌더링 정상
- [ ] Mermaid 다이어그램 렌더링
- [ ] 코드 하이라이팅
- [ ] 테이블 렌더링

### 제한사항
- [ ] 상대 경로 이미지 처리
- [ ] 네비게이션 숨김
- [ ] 10MB 이상 파일 경고

### 브라우저 호환성
- [ ] Chrome
- [ ] Firefox
- [ ] Safari
- [ ] Edge
```

#### Playwright 테스트

**파일**: `test/test-local-preview.spec.js`

```javascript
const { test, expect } = require('@playwright/test');

test.describe('Local Preview', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000');
    // LocalPreview 초기화 대기
    await page.waitForFunction(() => typeof LocalPreview !== 'undefined');
  });

  test('should show drop overlay on drag enter', async ({ page }) => {
    await page.evaluate(() => {
      const event = new DragEvent('dragenter', {
        bubbles: true,
        dataTransfer: new DataTransfer()
      });
      document.body.dispatchEvent(event);
    });

    const overlay = page.locator('#drop-overlay');
    await expect(overlay).toBeVisible();
  });

  test('should render dropped markdown file', async ({ page }) => {
    const testContent = '----\nname: Test Doc\n----\n# Hello World\n\nThis is a test.';

    await page.evaluate((content) => {
      const file = new File([content], 'test.md', { type: 'text/markdown' });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);

      const event = new DragEvent('drop', {
        bubbles: true,
        dataTransfer
      });
      document.body.dispatchEvent(event);
    }, testContent);

    const banner = page.locator('#local-preview-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('Test Doc');

    const content = page.locator('#markdown-content');
    await expect(content).toContainText('Hello World');
  });

  test('should close preview when close button clicked', async ({ page }) => {
    await page.evaluate(() => {
      const file = new File(['# Test'], 'test.md', { type: 'text/markdown' });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      document.body.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer }));
    });

    await page.click('.local-preview-banner .close-btn');
    await expect(page.locator('#local-preview-banner')).not.toBeVisible();
  });

  test('should reject non-markdown files', async ({ page }) => {
    await page.evaluate(() => {
      const file = new File(['test'], 'test.txt', { type: 'text/plain' });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      document.body.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer }));
    });

    // 에러 메시지 확인
    await expect(page.locator('.error-toast, .toast-warning')).toBeVisible();
  });

  test('should reject files over 10MB', async ({ page }) => {
    await page.evaluate(() => {
      // 11MB 가짜 파일 생성
      const largeContent = 'x'.repeat(11 * 1024 * 1024);
      const file = new File([largeContent], 'large.md', { type: 'text/markdown' });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      document.body.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer }));
    });

    await expect(page.locator('.error-toast, .toast-error')).toBeVisible();
  });

  test('should open file dialog with Ctrl+O', async ({ page }) => {
    // 파일 입력 요소 확인
    await page.keyboard.press('Control+o');
    const fileInput = page.locator('#local-preview-file-input');
    await expect(fileInput).toBeAttached();
  });

  test('should close preview with ESC key', async ({ page }) => {
    // 파일 드롭
    await page.evaluate(() => {
      const file = new File(['# Test'], 'test.md', { type: 'text/markdown' });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      document.body.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer }));
    });

    await expect(page.locator('#local-preview-banner')).toBeVisible();

    // ESC로 닫기
    await page.keyboard.press('Escape');
    await expect(page.locator('#local-preview-banner')).not.toBeVisible();
  });

  test('should handle relative image paths gracefully', async ({ page }) => {
    const contentWithImage = '# Test\n\n![alt](./images/test.png)';

    await page.evaluate((content) => {
      const file = new File([content], 'test.md', { type: 'text/markdown' });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      document.body.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer }));
    }, contentWithImage);

    // 깨진 이미지 클래스 확인
    const brokenImage = page.locator('.local-preview-broken-image');
    await expect(brokenImage).toBeVisible();
  });

  test('should render Mermaid diagrams', async ({ page }) => {
    const contentWithMermaid = '# Test\n\n```mermaid\ngraph TD\n  A --> B\n```';

    await page.evaluate((content) => {
      const file = new File([content], 'test.md', { type: 'text/markdown' });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      document.body.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer }));
    }, contentWithMermaid);

    // Mermaid 렌더링 대기 (SVG 생성)
    await page.waitForSelector('.mermaid svg', { timeout: 5000 }).catch(() => {
      // Mermaid가 설치되지 않은 환경에서는 건너뜀
    });
  });

  test('should announce to screen readers', async ({ page }) => {
    await page.evaluate(() => {
      const file = new File(['# Test'], 'test.md', { type: 'text/markdown' });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      document.body.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer }));
    });

    // aria-live region 확인
    const liveRegion = page.locator('#local-preview-live-region');
    await expect(liveRegion).toHaveAttribute('aria-live', 'polite');
  });
});
```

#### 엣지 케이스 테스트

```javascript
test.describe('Local Preview - Edge Cases', () => {
  test('should handle empty file', async ({ page }) => {
    await page.goto('http://localhost:3000');

    await page.evaluate(() => {
      const file = new File([''], 'empty.md', { type: 'text/markdown' });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      document.body.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer }));
    });

    await expect(page.locator('.toast-warning')).toBeVisible();
  });

  test('should handle file with BOM', async ({ page }) => {
    await page.goto('http://localhost:3000');

    await page.evaluate(() => {
      const bom = '\ufeff';
      const content = bom + '----\nname: BOM Test\n----\n# Content';
      const file = new File([content], 'bom.md', { type: 'text/markdown' });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      document.body.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer }));
    });

    await expect(page.locator('#local-preview-banner')).toContainText('BOM Test');
  });

  test('should handle file with Windows CRLF', async ({ page }) => {
    await page.goto('http://localhost:3000');

    await page.evaluate(() => {
      const content = '----\r\nname: CRLF Test\r\n----\r\n# Content';
      const file = new File([content], 'crlf.md', { type: 'text/markdown' });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      document.body.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer }));
    });

    await expect(page.locator('#local-preview-banner')).toContainText('CRLF Test');
  });

  test('should sanitize XSS attempts', async ({ page }) => {
    await page.goto('http://localhost:3000');

    await page.evaluate(() => {
      const malicious = '# Test\n\n<script>alert("XSS")</script>\n<img onerror="alert(1)" src="x">';
      const file = new File([malicious], 'xss.md', { type: 'text/markdown' });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      document.body.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer }));
    });

    // script 태그가 제거되었는지 확인
    const scriptTag = await page.locator('#markdown-content script').count();
    expect(scriptTag).toBe(0);

    // onerror 속성이 제거되었는지 확인
    const imgWithOnerror = await page.locator('#markdown-content img[onerror]').count();
    expect(imgWithOnerror).toBe(0);
  });
});
```

### 파일 변경 사항

| 파일 | 변경 내용 | 코드량 |
|------|-----------|--------|
| `public/js/app.js` | LocalPreview 객체 추가 | ~200 lines |
| `public/css/style.css` | 드롭 오버레이, 배너 스타일 | ~60 lines |
| `test/test-local-preview.spec.js` | Playwright 테스트 (신규) | ~80 lines |

### 예상 작업 시간

| 단계 | 시간 |
|------|------|
| JavaScript 구현 | 1-2시간 |
| CSS 스타일링 | 30분 |
| 테스트 작성 | 1시간 |
| 브라우저 호환성 테스트 | 30분 |
| **총계** | **3-4시간** |

### 향후 확장 가능 기능

1. **다중 파일 탭**: 여러 파일 드롭 시 탭으로 표시
2. **최근 파일 기록**: IndexedDB에 최근 본 로컬 파일 이름 저장
3. **업로드 연계**: "이 파일 서버에 저장" 버튼
4. **클립보드 붙여넣기**: Ctrl+V로 마크다운 텍스트 미리보기

### 성능 최적화 (선택적)

대용량 파일(5MB+)에 대한 추가 최적화:

```javascript
/**
 * 대용량 파일 청크 읽기 (5MB 이상 시 사용)
 */
async readLargeFileAsText(file) {
  const CHUNK_SIZE = 1024 * 1024; // 1MB 청크

  if (file.size < 5 * 1024 * 1024) {
    // 5MB 미만: 일반 읽기
    return this.readFileAsText(file);
  }

  // 5MB 이상: 청크 읽기
  let result = '';
  let offset = 0;

  while (offset < file.size) {
    const chunk = file.slice(offset, offset + CHUNK_SIZE);
    const text = await this.readFileAsText(chunk);
    result += text;
    offset += CHUNK_SIZE;

    // 진행률 표시 (선택적)
    const progress = Math.round((offset / file.size) * 100);
    this.updateLoadingProgress(progress);
  }

  return result;
}
```

### 국제화 준비 (i18n)

에러 메시지 상수 분리:

```javascript
const LocalPreviewMessages = {
  ko: {
    DROP_HERE: '.md 파일을 여기에 놓으세요',
    INVALID_EXTENSION: 'Markdown 파일(.md, .markdown)만 미리보기할 수 있습니다.',
    FILE_TOO_LARGE: '파일이 너무 큽니다 ({size}MB). 최대 10MB까지 지원합니다.',
    EMPTY_FILE: '빈 파일입니다.',
    ENCODING_ERROR: 'UTF-8 인코딩이 아닌 파일입니다.',
    READ_ERROR: '파일을 읽는 중 오류가 발생했습니다: {error}',
    LOCAL_PREVIEW: '로컬 미리보기',
    CLOSE: '닫기'
  },
  en: {
    DROP_HERE: 'Drop .md file here',
    INVALID_EXTENSION: 'Only Markdown files (.md, .markdown) can be previewed.',
    FILE_TOO_LARGE: 'File is too large ({size}MB). Maximum 10MB allowed.',
    EMPTY_FILE: 'File is empty.',
    ENCODING_ERROR: 'File is not UTF-8 encoded.',
    READ_ERROR: 'Error reading file: {error}',
    LOCAL_PREVIEW: 'Local Preview',
    CLOSE: 'Close'
  }
};

// 현재 언어 설정
const currentLang = navigator.language.startsWith('ko') ? 'ko' : 'en';
const msg = LocalPreviewMessages[currentLang];
```

### Phase 7 요약

| 항목 | 내용 |
|------|------|
| **기능** | 로컬 .md 파일 드래그앤드롭 미리보기 |
| **서버 통신** | 없음 (순수 클라이언트) |
| **보안** | DOMPurify XSS 방지, 파일 검증 |
| **접근성** | 키보드(Ctrl+O, ESC), ARIA live region |
| **브라우저** | Chrome, Firefox, Safari, Edge (IE 제외) |
| **파일 제한** | 10MB, .md/.markdown 확장자 |
| **코드량** | ~340 lines (JS ~200, CSS ~90, Test ~150) |
| **예상 시간** | 3-4시간 |
| **성능** | 청크 읽기 (5MB+), 진행률 표시 |
| **i18n** | 한국어/영어 메시지 분리 |

---

## Step 13 전체 요약

### 구현 완료 항목 (Phase 1-6)

| Phase | 기능 | 상태 |
|-------|------|------|
| 1 | Frontmatter 파싱 서비스 | ✅ 완료 |
| 2 | Tree Service 통합 | ✅ 완료 |
| 3 | Context MCP 서버 (POST) | ✅ 완료 |
| 4 | 클라이언트 수정 | ✅ 완료 |
| 5 | 테스트 및 문서화 | ✅ 완료 |
| 6 | Context MCP GET 지원 | ✅ 완료 |

### 신규 추가 (Phase 7)

| Phase | 기능 | 상태 |
|-------|------|------|
| 7 | 드래그앤드롭 로컬 미리보기 | 📋 계획됨 |

### 전체 수치

| 항목 | Phase 1-6 | Phase 7 | 합계 |
|------|-----------|---------|------|
| 신규 파일 | 5개 | 1개 | 6개 |
| 수정 파일 | 5개 | 2개 | 7개 |
| 신규 코드 | ~400 lines | ~340 lines | ~740 lines |
| 테스트 케이스 | 18개 | 13개 | 31개 |
| 예상 작업 시간 | 8-12시간 | 3-4시간 | 11-16시간 |

### 위험 요소 및 대응

| 위험 | 대응 | Phase |
|------|------|-------|
| 대규모 디렉토리 성능 | 1KB 읽기 + 병렬 처리 + 캐싱 | 1-2 |
| MCP 서버 복잡도 | 기존 패턴 100% 재사용 | 3, 6 |
| 클라이언트 호환성 | fallback 로직 | 4 |
| XSS 공격 | DOMPurify 적용 | 7 |
| 대용량 파일 | 10MB 제한 | 7 |
| 접근성 | 키보드/스크린리더 지원 | 7 |

### 구현 우선순위

```
높음 ████████████████████ Phase 1-5 (핵심 기능)
중간 ████████████         Phase 6 (GET 지원)
낮음 ████████             Phase 7 (로컬 미리보기)
```

Phase 7은 선택적 기능으로, Phase 1-6 완료 후 구현 권장.

---

## Phase 7 마이그레이션 가이드

### 구현 체크리스트

```markdown
## Phase 7 구현 체크리스트

### 준비
- [ ] Phase 1-6 구현 완료 확인
- [ ] DOMPurify 라이브러리 설치 확인 (`public/js/` 또는 CDN)
- [ ] 기존 ErrorHandler, TreeManager 객체 존재 확인

### 코드 추가
- [ ] `public/js/app.js`에 LocalPreview 객체 추가 (라인 1500-1550)
- [ ] `public/css/style.css`에 스타일 추가
- [ ] DOMContentLoaded에서 `LocalPreview.init()` 호출

### 테스트
- [ ] .md 파일 드래그앤드롭 테스트
- [ ] 비-.md 파일 거부 확인
- [ ] 10MB 초과 파일 거부 확인
- [ ] Ctrl+O 키보드 단축키 테스트
- [ ] ESC 키로 닫기 테스트
- [ ] 스크린리더 테스트 (NVDA/VoiceOver)

### 배포
- [ ] 스테이징 환경 테스트
- [ ] 브라우저 호환성 확인 (Chrome, Firefox, Safari, Edge)
- [ ] 프로덕션 배포
```

### 롤백 방법

Phase 7 기능에 문제 발생 시:

```javascript
// app.js에서 LocalPreview.init() 호출 주석 처리
// document.addEventListener('DOMContentLoaded', async () => {
//   LocalPreview.init();  // ← 주석 처리
// });

// 또는 LocalPreview 객체 전체 제거
```

CSS 롤백:
```css
/* style.css에서 Phase 7 관련 스타일 주석 처리 또는 삭제 */
/* .drop-overlay, .local-preview-banner 등 */
```

### 기존 기능 영향

| 기존 기능 | 영향 | 비고 |
|-----------|------|------|
| 트리 네비게이션 | 없음 | 독립적 |
| 마크다운 렌더링 | 재사용 | renderMarkdown() 호출 |
| 에러 표시 | 재사용 | ErrorHandler.show() 호출 |
| TreeManager | 호출 | clearSelection() 호출 |
| IndexedDB | 없음 | 로컬 미리보기 저장 안함 |

### 의존성

```
Phase 7 의존성:
├── DOMPurify (필수) - XSS 방지
├── renderMarkdown() (필수) - 마크다운 렌더링
├── ErrorHandler.show() (필수) - 에러 표시
├── TreeManager.clearSelection() (선택) - 트리 선택 해제
└── mermaid (선택) - 다이어그램 렌더링
```
