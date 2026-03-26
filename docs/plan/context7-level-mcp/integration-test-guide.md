# 통합 테스트 가이드

## 목적

모든 Phase 완료 후, 신규 MCP 도구가 기존 도구와 함께 정상 동작하는지 검증한다.

## E2E 시나리오

### 시나리오 1: Context7 워크플로우 재현 (CRITICAL)

AI 에이전트가 프로젝트를 찾고 → 코드 예제를 가져오는 전체 흐름.

```bash
# Step 1: resolve_project
curl -s -X POST -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{
    "jsonrpc":"2.0","id":1,
    "method":"tools/call",
    "params":{"name":"resolve_project","arguments":{"name":"json5"}}
  }' "$MCP_URL"
# 기대: path가 반환됨

# Step 2: query_code_examples (resolve 결과의 path 사용)
curl -s -X POST -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{
    "jsonrpc":"2.0","id":2,
    "method":"tools/call",
    "params":{"name":"query_code_examples","arguments":{
      "query":"annotation 사용법",
      "path":"00.공통 모듈/jons5",
      "language":"java"
    }}
  }' "$MCP_URL"
# 기대: Java 코드 블록이 반환됨
```

### 시나리오 2: resolve → smart_search 연동 (HIGH)

```bash
# Step 1: resolve_project
# (위와 동일)

# Step 2: DocuLight_smart_search (resolve 결과의 path 사용)
curl -s -X POST -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{
    "jsonrpc":"2.0","id":3,
    "method":"tools/call",
    "params":{"name":"DocuLight_smart_search","arguments":{
      "query":"comment 작성 방법",
      "path":"00.공통 모듈/jons5"
    }}
  }' "$MCP_URL"
# 기대: 관련 섹션이 반환됨
```

### 시나리오 3: 버전별 문서 조회 (HIGH)

```bash
# resolve with version
curl -s -X POST -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{
    "jsonrpc":"2.0","id":4,
    "method":"tools/call",
    "params":{"name":"resolve_project","arguments":{"name":"mylib","version":"1.0"}}
  }' "$MCP_URL"
# 기대: v1.0 경로 반환
```

### 시나리오 4: initialize 응답에 instructions 포함 (MEDIUM)

```bash
curl -s -X POST -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0","id":5,
    "method":"initialize",
    "params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}
  }' "$MCP_URL"
# 기대: result.instructions 필드 존재
```

## 회귀 테스트

### 기존 도구 동작 확인

| 도구 | 검증 방법 |
|------|----------|
| list_documents | `path=/` 호출, 디렉토리 목록 반환 확인 |
| read_document | 알려진 파일 경로로 호출, 내용 반환 확인 |
| DocuLight_search | 단일/다중 단어 검색, 결과 반환 확인 |
| DocuLight_smart_search | 다중 단어 쿼리 (키워드 검색 개선) 동작 확인 |
| query_document | 특정 문서 + 쿼리, 섹션 반환 확인 |
| summarize_document | TOC + 통계 반환 확인 |

### 기존 테스트 스위트 실행

```bash
node test/mcp/smart-search.test.js        # 19 tests
node test/test-search-documents.js         # 20 tests
node test/mcp/query-document.test.js       # (있으면)
node test/mcp/summarize-document.test.js   # (있으면)
node test/mcp/section-extractor.test.js    # (있으면)
```

## 인증 테스트

| 시나리오 | 기대 결과 |
|---------|----------|
| resolve_project without API key (requireReadLogin=true) | UNAUTHORIZED 에러 |
| resolve_project without API key (requireReadLogin=false) | 정상 동작 |
| query_code_examples without API key (requireReadLogin=true) | UNAUTHORIZED 에러 |
| 기존 write 도구 (create/delete) without API key | UNAUTHORIZED 에러 (항상) |
