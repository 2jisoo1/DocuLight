# DocuLight MCP 빠른 레퍼런스

## 파일 맵

| 파일 경로 | 용도 | 수정 빈도 |
|---------|------|---------|
| `src/routes/mcp.js` | MCP 핸들러 (TOOLS 배열 + executeTool) | **자주** |
| `src/routes/api-ctrl.js` | 도구 로직 구현 | **자주** |
| `src/app.js` | 서버 진입점 | 거의 안 함 |
| `src/utils/path-validator.js` | 경로 검증 | 거의 안 함 |
| `src/utils/config-loader.js` | 설정 로드 | 거의 안 함 |
| `src/utils/lock-manager.js` | 동시성 제어 | 거의 안 함 |
| `src/utils/logger.js` | 로깅 | 거의 안 함 |
| `config.json5` | 실행 설정 | 상황에 따라 |

## MCP 도구 체크리스트

### 새 도구 추가 시

```
□ Step 1: src/routes/api-ctrl.js
  □ 함수 구현 (로직)
  □ module.exports에 추가

□ Step 2: src/routes/mcp.js의 TOOLS 배열
  □ name, description 추가
  □ inputSchema 정의
  □ required 필드 설정

□ Step 3: src/routes/mcp.js의 executeTool()
  □ case 'tool_name' 추가
  □ 함수 import
  □ 파라미터 매핑
  □ 결과 포장

□ Step 4: 테스트
  □ curl로 tools/list 확인
  □ curl로 tools/call 실행
  □ 로그 확인
```

## 실무 코드 스니펫

### 입력 검증

```javascript
// 필수 파라미터
if (!args.searchTerm) {
  const error = new Error('INVALID_INPUT: searchTerm required');
  error.code = 'INVALID_INPUT';
  throw error;
}

// 타입 검증
if (typeof args.maxResults !== 'number') {
  throw new Error('INVALID_INPUT: maxResults must be number');
}

// 범위 검증
if (args.maxResults < 1 || args.maxResults > 1000) {
  throw new Error('INVALID_INPUT: maxResults must be 1-1000');
}
```

### 경로 검증

```javascript
// ✅ 올바른 사용
const absolutePath = validatePath(config.docsRoot, userPath);

// ❌ 잘못된 사용
const absolutePath = validatePath(config.docsRoot, '/absolute/path');
```

### 파일 읽기

```javascript
const content = await fs.readFile(absolutePath, 'utf-8');
logger.info('File read', { path: userPath, size: content.length });
return content;
```

### 파일 쓰기 (락 필요)

```javascript
return await lockManager.acquire(targetDir, async () => {
  await fs.writeFile(filePath, fileBuffer);
  logger.info('File written', { path: userPath });
  return { success: true };
});
```

### 재귀 탐색

```javascript
async function traverse(currentPath, results = []) {
  const entries = await fs.readdir(currentPath, { withFileTypes: true });
  
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue; // 숨김 파일 제외
    
    const fullPath = path.join(currentPath, entry.name);
    const relativePath = path.relative(config.docsRoot, fullPath);
    
    if (ig.ignores(relativePath)) continue; // 제외 패턴 확인
    
    if (entry.isDirectory()) {
      await traverse(fullPath, results);
    } else {
      results.push(relativePath);
    }
  }
  
  return results;
}
```

### MCP 응답 포장

```javascript
// 텍스트 결과
return {
  content: [{
    type: 'text',
    text: `# Result\n\n${output}`
  }]
};

// 에러
throw new Error('NOT_FOUND: File not found');

// 자동 JSON-RPC 포장됨 (mcp.js가 처리)
```

## 문제 해결

| 문제 | 원인 | 해결 |
|------|------|------|
| "Unknown tool" | executeTool()에 case 없음 | TOOLS 배열의 name과 case가 일치하는지 확인 |
| PATH_TRAVERSAL | 경로 검증 실패 | validatePath() 사용, 절대 경로 사용 금지 |
| 파일 찾을 수 없음 | 경로가 잘못됨 | config.docsRoot 확인, excludes 패턴 확인 |
| 파일 잠금 타임아웃 | 다른 작업이 사용 중 | 재시도 로직 추가 |
| 도구 호출 안 됨 | 함수 import 실패 | require('./api-ctrl')에서 함수명 확인 |

## 필요한 import

```javascript
// api-ctrl.js
const fs = require('fs').promises;
const path = require('path');
const ignore = require('ignore');
const { validatePath } = require('../utils/path-validator');
const lockManager = require('../utils/lock-manager');

// mcp.js
const express = require('express');
const { 
  getTreeData, 
  getRawContent,
  uploadFileData,
  deleteEntryData,
  getFullTreeData
} = require('./api-ctrl');
```

## 설정 객체 구조

```javascript
config = {
  docsRoot: '/absolute/path',     // 필수
  apiKey: 'secure-key',            // 필수
  port: 3000,                       // 기본값
  maxUploadMB: 10,                  // 기본값
  excludes: ['*.tmp', '**/.git/'], // 기본값: []
  logDir: './logs',                 // 기본값
  logLevel: 'info',                 // 기본값
  security: {
    allows: ['127.0.0.1', '192.168.1.0/24']  // 선택사항
  },
  ssl: {
    enabled: false,
    cert: '/path/to/cert.pem',
    key: '/path/to/key.pem'
  },
  hotReload: {
    allowPortSslAutoRestart: false  // 선택사항
  }
}
```

## logger 사용

```javascript
logger.debug('Debug message', { key: value });   // 상세 정보
logger.info('Info message', { key: value });     // 일반 정보
logger.warn('Warning message', { key: value });  // 경고
logger.error('Error message', { key: value });   // 에러 (스택 포함)
```

## MCP JSON-RPC 형식

### 요청

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "read_document",
    "arguments": {
      "path": "/guide.md"
    }
  }
}
```

### 성공 응답

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "..."
      }
    ]
  }
}
```

### 에러 응답

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32603,
    "message": "Internal error",
    "data": "Error message details"
  }
}
```

## curl 테스트 예제

### 도구 목록 조회

```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list"
  }'
```

### 도구 실행

```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "read_document",
      "arguments": {
        "path": "/README.md"
      }
    }
  }'
```

### 초기화

```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "initialize"
  }'
```

## 성능 팁

1. **excludes 패턴 최적화**: 정규식이 복잡하면 느려짐
2. **maxDepth 사용**: 큰 트리는 깊이 제한
3. **결과 크기 제한**: maxResults로 대규모 결과 제한
4. **비동기 처리**: 파일 I/O는 항상 async/await 사용
5. **로깅 수준**: 프로덕션에서는 'info' 이상 사용

## 보안 체크리스트

- [ ] validatePath() 사용
- [ ] 필수 파라미터 검증
- [ ] 에러 메시지에 경로 노출 최소화
- [ ] 민감한 정보 로깅 금지 (apiKey 등)
- [ ] lockManager 사용 (쓰기 작업)
- [ ] .md 파일만 읽기 (필요시)

---

더 자세한 정보는 다음을 참고하세요:
- `CODEBASE_ANALYSIS.md` - 완전한 분석
- `MCP_IMPLEMENTATION_GUIDE.md` - 실전 가이드
- `src/routes/mcp.js` - 구현 코드
- `src/routes/api-ctrl.js` - 함수 구현
