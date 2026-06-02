# Step 20: MCP Streamable HTTP 초기 상호운용성 전환 계획

## 메타데이터

- **버전**: step20
- **작성일**: 2026-06-01
- **주제**: MCP HTTP transport를 legacy JSON-RPC HTTP에서 Streamable HTTP 초기 상호운용성 형태로 전환
- **선행 문서**:
  - `docs/research/2026-06-01-mcp-streamable-http-spec.md`
  - `docs/analysis/2026-06-01.mcp-streamable-http-gap.md`
  - `docs/plan/2026-06-01-mcp-streamable-http-direction.md`
  - `docs/srs/requirements.step20_mcp_streamable_http_security.md`
- **참고한 기존 계획 형식**:
  - `docs/srs/plan.step7.ko.md`
  - `docs/srs/plan.step8.2.md`
  - `docs/srs/plan.step19.summary.md`

---

## 1. 개요

### 1.1 목적

DocuLight의 `/mcp` endpoint를 최신 MCP Streamable HTTP transport에 맞춰 정리한다. 단, DocuLight는 SSE를 지원하지 않으며 `MCP-Session-Id` 기반 lifecycle gate는 후순위로 둔다. PR #2 보안 리뷰 이후에는 Streamable HTTP 초기 상호운용성뿐 아니라 `/mcp` Origin/Host 검증과 기본 localhost bind를 Step 20 보안 보강 범위에 포함한다.

이번 Step의 목적은 다음과 같다.

1. `/mcp`를 Streamable HTTP endpoint로 명확히 정의한다.
2. `GET /mcp` 요청에는 SSE 미지원 상태를 HTTP semantics로 명확히 응답한다.
3. JSON-RPC request, notification, response message를 구분한다.
4. `initialize`의 `protocolVersion`을 최신 MCP protocol revision 기준으로 협상한다.
5. `MCP-Protocol-Version` 및 `Accept` header 처리 정책을 도입한다.
6. `/context`는 MCP Streamable HTTP endpoint가 아닌 legacy/context helper로 분리한다.
7. `/mcp` Origin/Host allowlist와 기본 localhost bind로 DNS rebinding 방어를 보강한다.

### 1.2 범위

| 포함 | 제외 |
|------|------|
| `POST /mcp` 단일 JSON-RPC response 처리 | SSE stream 응답 |
| `GET /mcp` 405 응답 및 `Allow: POST` header | `GET /mcp`로 server-to-client event stream 제공 |
| JSON-RPC notification/response 수락 시 `202 Accepted` | JSON-RPC batch 지원 |
| `initialize` protocolVersion `2025-11-25` 협상 | 구버전 MCP protocol 완전 호환 모드 |
| `MCP-Protocol-Version` header 검증 | `MCP-Session-Id` 기반 stateful lifecycle gate |
| `Accept` header compatibility/conformance 정책 | SSE stream 응답 |
| MCP Origin/Host allowlist 검증 | `DELETE /mcp` session 종료 |
| 기본 bind address `127.0.0.1` 전환 | trusted proxy 기반 forwarded header 신뢰 |
| public read mode 및 reverse proxy 운영 문서화 | `/context` endpoint deprecated 처리 |
| `public/mcp-doc.md` 및 관련 문서 갱신 | MCP 전용 read auth 설정 |

### 1.3 핵심 결정

| 항목 | 결정 |
|------|------|
| HTTP transport | Streamable HTTP 초기 상호운용성 확보 |
| SSE | 지원하지 않음 |
| MCP endpoint | `/mcp`만 최신 MCP transport endpoint로 취급 |
| `/context` | 기존 context helper로 유지, deprecated 하지 않음 |
| `protocolVersion` 의미 | JSON-RPC/HTTP/app version이 아니라 MCP specification revision version |
| 목표 protocol version | `2025-11-25` |
| `MCP-Session-Id` | 구현 난이도가 커서 최후순위 phase로 분리 |
| Origin validation | `/mcp` 필수 절차. Origin이 있고 invalid이면 `403`, Origin이 없으면 non-browser MCP client 호환을 위해 허용 |
| Host validation | HTTP `Host` header를 모든 `/mcp` 요청에서 항상 allowlist 검사 |
| 기본 bind address | 명시 설정이 없으면 `127.0.0.1` |
| wildcard allowlist | `["*"]` 허용. 단, DNS rebinding 방어를 끄는 insecure opt-out으로 warning 및 문서화 |

### 1.4 현재 상태 요약

- `src/routes/mcp.js`는 `POST /mcp`만 구현한다.
- `initialize` 응답의 `protocolVersion`은 `2024-11-05`로 고정되어 있다.
- JSON-RPC notification은 `method` 누락 검증과 응답 처리 모델이 request 중심이다.
- `GET /mcp` 라우트가 없어 Express 기본 404가 발생할 수 있다.
- `MCP-Protocol-Version` header 검증이 없다.
- `Accept` header 검증이 없다.
- `public/mcp-doc.md`는 현재 MCP 버전과 endpoint 설명이 최신 Streamable HTTP와 맞지 않는다.

---

## 2. 기능 요구사항

### FR-20-001: `GET /mcp` SSE 미지원 응답

- **설명**: Streamable HTTP에서 `GET /mcp`는 server-to-client stream 용도로 사용될 수 있으나, DocuLight는 SSE를 지원하지 않는다.
- **입력**: `GET /mcp`
- **처리**:
  1. 항상 `405 Method Not Allowed`를 반환한다.
  2. `Allow: POST` header를 포함한다.
  3. body는 JSON error body를 사용한다.
- **출력 예시**:
  ```http
  HTTP/1.1 405 Method Not Allowed
  Allow: POST
  Content-Type: application/json
  ```
  ```json
  {
    "error": {
      "code": "METHOD_NOT_ALLOWED",
      "message": "GET /mcp is not supported because SSE streams are disabled. Use POST /mcp."
    }
  }
  ```
- **우선순위**: P0

### FR-20-002: JSON-RPC message type 판별

- **설명**: request, notification, response를 먼저 판별한 뒤 각각 다른 HTTP 응답 정책을 적용한다.
- **입력**: `POST /mcp` JSON body
- **처리**:
  1. `jsonrpc !== "2.0"`이면 JSON-RPC Invalid Request error를 반환한다.
  2. 배열 body는 batch로 간주하고 거부한다.
  3. `id`가 있고 `method`가 있으면 request로 판별한다.
  4. `id`가 없고 `method`가 있으면 notification으로 판별한다.
  5. `id`가 있고 `method`가 없으며 `result` 또는 `error`가 있으면 response로 판별한다.
  6. 위 조건에 맞지 않으면 Invalid Request error를 반환한다.
- **출력**:
  - request: 기존 JSON-RPC response 반환
  - notification: 성공적으로 수락 가능한 경우 `202 Accepted` + empty body
  - response: 현재 서버가 client request를 발행하지 않으므로 `202 Accepted` + empty body
- **우선순위**: P0

### FR-20-003: `notifications/initialized` 처리

- **설명**: MCP lifecycle notification인 `notifications/initialized`를 정상 수락한다.
- **입력**:
  ```json
  {
    "jsonrpc": "2.0",
    "method": "notifications/initialized"
  }
  ```
- **처리**:
  1. message type을 notification으로 판별한다.
  2. method가 `notifications/initialized`이면 로그를 남긴다.
  3. session gate는 적용하지 않는다.
- **출력**: `202 Accepted` + empty body
- **우선순위**: P0

### FR-20-004: `initialize` protocolVersion 협상

- **설명**: `initialize.params.protocolVersion`을 MCP specification revision version으로 해석한다.
- **입력 예시**:
  ```json
  {
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-11-25",
      "capabilities": {},
      "clientInfo": {
        "name": "test-client",
        "version": "1.0.0"
      }
    }
  }
  ```
- **처리**:
  1. `SUPPORTED_MCP_PROTOCOL_VERSIONS = ["2025-11-25"]`를 정의한다.
  2. `params.protocolVersion`이 없으면 compatibility mode로 보고 `2025-11-25`를 반환한다.
  3. `params.protocolVersion`이 지원 목록에 있으면 같은 version을 반환한다.
  4. 지원하지 않는 version이면 서버가 지원하는 최신 version인 `2025-11-25`를 반환한다.
- **출력**:
  ```json
  {
    "jsonrpc": "2.0",
    "id": 1,
    "result": {
      "protocolVersion": "2025-11-25",
      "capabilities": {
        "tools": {}
      },
      "serverInfo": {
        "name": "DocuLight",
        "version": "1.0.0"
      }
    }
  }
  ```
- **우선순위**: P0

### FR-20-005: `MCP-Protocol-Version` header 검증

- **설명**: `initialize` 이후의 MCP request는 `MCP-Protocol-Version` header를 기준으로 protocol version을 검증한다.
- **입력**: `POST /mcp` request header
- **처리**:
  1. `initialize` request는 header가 없어도 허용한다.
  2. `tools/list`, `tools/call` 등 일반 request는 header를 확인한다.
  3. compatibility mode에서는 header 누락을 허용하고 경고 로그를 남긴다.
  4. header가 존재하지만 지원하지 않는 version이면 `400 Bad Request`를 반환한다.
  5. conformance mode는 후속 설정으로 분리하고, 초기 구현에서는 compatibility mode를 기본값으로 한다.
  6. header가 누락되면 요청은 허용하되 `logger.warn('MCP-Protocol-Version header missing; compatibility mode assumed')`를 남긴다.
- **출력 예시**:
  ```json
  {
    "error": {
      "code": "UNSUPPORTED_MCP_PROTOCOL_VERSION",
      "message": "Unsupported MCP-Protocol-Version header: 2024-11-05"
    }
  }
  ```
- **우선순위**: P0

### FR-20-006: `Accept` header 처리

- **설명**: Streamable HTTP client는 `Accept: application/json, text/event-stream`을 보낼 수 있다. DocuLight는 SSE를 반환하지 않지만, client compatibility를 위해 이 header를 수용한다.
- **입력**: `POST /mcp` request header
- **처리**:
  1. compatibility mode에서는 `Accept` 누락을 허용한다.
  2. `Accept`가 존재하면 `application/json`을 포함해야 한다.
  3. `text/event-stream`은 포함되어도 허용하지만, 응답은 `application/json`만 사용한다.
  4. `Accept`가 존재하고 `application/json`을 포함하지 않으면 `406 Not Acceptable`을 반환한다.
- **우선순위**: P1

### FR-20-007: `/context` endpoint 범위 명확화

- **설명**: `/context`는 기존 context helper endpoint로 유지하며, 최신 MCP Streamable HTTP endpoint로 취급하지 않는다.
- **처리**:
  1. `/context` 라우터 구현은 변경하지 않는다.
  2. 문서에서 `/context`를 MCP transport endpoint로 설명하지 않는다.
  3. deprecated 문구는 추가하지 않는다.
  4. 향후 public contract 정리 시 명칭과 문서 표현만 재검토한다.
- **우선순위**: P1

### FR-20-008: 문서 갱신

- **설명**: MCP 사용자 문서와 curl 예제를 최신 transport 정책에 맞춘다.
- **수정 대상**:
  - `public/mcp-doc.md`
  - `docs/api/doc/ko/api-curl-example.md`
  - `README.md`
- **처리**:
  1. MCP version을 `2025-11-25`로 갱신한다.
  2. endpoint 설명을 `POST /mcp` 중심으로 유지한다.
  3. `GET /mcp`는 SSE 미지원으로 `405`를 반환한다고 명시한다.
  4. 예제 요청에 `Accept: application/json, text/event-stream`과 `MCP-Protocol-Version: 2025-11-25`를 추가한다.
- **우선순위**: P1

### FR-20-009: `/mcp` Origin/Host validation

- **설명**: DNS rebinding 방어를 위해 `/mcp` 요청을 JSON-RPC dispatch 전에 Origin/Host allowlist로 검증한다.
- **처리**:
  1. `Origin` header가 있으면 lower-case로 정규화한 full origin 문자열(`scheme://host[:port]`)을 `mcp.allowedOrigins`와 exact match한다.
  2. `Origin: null`, malformed Origin, empty Origin, allowlist 불일치 시 `403 Forbidden`과 `FORBIDDEN_ORIGIN`을 반환한다.
  3. `Origin` header가 없으면 non-browser MCP client 호환을 위해 Origin 누락만으로 거부하지 않는다.
  4. HTTP `Host` header는 Origin 유무와 관계없이 항상 `mcp.allowedHosts`와 비교한다.
  5. `allowedHosts` 항목이 hostname/IP만 포함하면 같은 hostname/IP의 모든 port를 허용한다.
  6. `allowedHosts` 항목이 `host:port` 또는 `[ipv6]:port`이면 host와 port가 모두 일치해야 한다.
  7. missing, empty, malformed Host는 wildcard 여부와 관계없이 허용되지 않은 Host로 처리한다.
  8. Host 불일치 시 `403 Forbidden`과 `FORBIDDEN_HOST`를 반환한다.
  9. `X-Forwarded-Host`는 trusted proxy 설계 전까지 신뢰하지 않는다.
- **우선순위**: P0

### FR-20-010: MCP allowlist config 정규화/검증

- **설명**: `config.mcp`는 route 내부에서 임시 해석하지 않고 config loading 단계에서 정규화/검증한다.
- **처리**:
  1. `config.mcp`가 없으면 기본값을 생성한다.
  2. 기본 `allowedOrigins`는 `config.port`와 SSL 설정을 기준으로 `http://localhost:<port>`, `http://127.0.0.1:<port>`, `http://[::1]:<port>` 또는 SSL enabled 시 `https` variant를 포함한다.
  3. 기본 `allowedHosts`는 `localhost`, `127.0.0.1`, `::1`을 포함한다.
  4. `config.host`가 `0.0.0.0`, `::`, `[::]`가 아닌 특정 host이면 그 host의 Origin/Host도 기본 후보에 포함한다.
  5. `mcp.allowedOrigins`와 `mcp.allowedHosts`는 문자열 배열이어야 한다.
  6. `allowedOrigins` 값은 full origin 형식(`scheme://host[:port]`)이어야 한다. `*`는 예외로 허용한다.
  7. `allowedHosts` 값은 hostname, IP literal, `host:port`, `[ipv6]:port` 형식이어야 한다. `*`는 예외로 허용한다.
  8. invalid allowlist config는 fallback 없이 startup validation error로 처리하고, error message에 실패한 config key를 포함한다.
  9. wildcard `["*"]`는 insecure opt-out으로 startup warning을 남긴다.
- **우선순위**: P0

### FR-20-011: 기본 bind address 변경

- **설명**: 로컬 MCP 노출 위험을 줄이기 위해 명시 설정이 없으면 localhost에만 bind한다.
- **처리**:
  1. `config.host`와 `HOST` 환경변수가 모두 없으면 server listen host는 `127.0.0.1`이다.
  2. 원격 직접 접속이 필요한 운영자는 `host: "0.0.0.0"` 또는 특정 서버 IP를 명시한다.
  3. 문서는 `0.0.0.0`이 모든 network interface listen을 의미한다고 설명한다.
- **우선순위**: P0

---

## 3. 비기능 요구사항

### NFR-20-001: 기존 도구 호환성

- 기존 MCP tools/list, tools/call의 tool schema와 handler 동작을 변경하지 않는다.
- `create_document`, `delete_document`의 user-key 인증 정책을 유지한다.
- `requireReadLogin` 활성 시 읽기 도구 인증 정책을 유지한다.
- `requireReadLogin=false` 상태에서는 MCP read tools가 공개 조회될 수 있음을 문서화하고, public/network 배포에서는 read authentication, IP allowlist, reverse proxy ACL 중 하나 이상을 권장한다.

### NFR-20-002: 안전한 점진 도입

- `MCP-Session-Id` 기반 lifecycle 강제는 이번 Step에서 구현하지 않는다.
- 기존 curl/manual client가 즉시 깨지지 않도록 header 누락은 compatibility mode에서 허용한다.
- Origin 없는 request는 non-browser MCP client 호환을 위해 허용하되, Origin이 있는 browser request는 allowlist로 통제한다.

### NFR-20-003: 관측 가능성

- `initialize`, `notifications/initialized`, unsupported protocol version, unsupported Accept header를 로그로 남긴다.
- 기존 `activityLogger.mcp` 호출 흐름을 유지한다.

---

## 4. 구현 설계

### 4.1 수정 파일

| 파일 | 작업 |
|------|------|
| `src/routes/mcp.js` | Streamable HTTP helper, `GET /mcp`, message type 분기, protocol/header 검증, Origin/Host 검증 추가 |
| `src/utils/config-loader.js` | `config.mcp` allowlist 정규화/검증 및 wildcard warning 추가 |
| `src/app.js` | 기본 bind address를 `127.0.0.1`로 변경 |
| `test/mcp/streamable-http.test.js` | transport semantics 회귀 테스트 추가 |
| `scripts/run-tests.js` | 새 MCP transport 테스트를 기본 suite에 포함 |
| `public/mcp-doc.md` | MCP version, header, GET 미지원 문서화 |
| `docs/api/doc/ko/api-curl-example.md` | curl 예제 header 갱신 |
| `README.md` | MCP transport 요약과 curl 예제 header 갱신 |

### 4.2 `src/routes/mcp.js` helper 추가

`createMcpRouter()` 위에 상수와 helper를 추가한다.

```javascript
const SUPPORTED_MCP_PROTOCOL_VERSIONS = ['2025-11-25'];
const DEFAULT_MCP_PROTOCOL_VERSION = '2025-11-25';

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function classifyJsonRpcMessage(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { type: 'invalid', reason: 'body must be a JSON object' };
  }

  if (body.jsonrpc !== '2.0') {
    return { type: 'invalid', reason: 'jsonrpc must be "2.0"' };
  }

  const hasId = hasOwn(body, 'id');
  const hasMethod = typeof body.method === 'string' && body.method.length > 0;
  const hasResultOrError = hasOwn(body, 'result') || hasOwn(body, 'error');

  if (hasId && hasMethod) return { type: 'request' };
  if (!hasId && hasMethod) return { type: 'notification' };
  if (hasId && !hasMethod && hasResultOrError) return { type: 'response' };

  return { type: 'invalid', reason: 'message must be request, notification, or response' };
}

function negotiateProtocolVersion(requestedVersion) {
  if (!requestedVersion) return DEFAULT_MCP_PROTOCOL_VERSION;
  if (SUPPORTED_MCP_PROTOCOL_VERSIONS.includes(requestedVersion)) return requestedVersion;
  return DEFAULT_MCP_PROTOCOL_VERSION;
}

function validateMcpProtocolVersionHeader(req, method, logger) {
  if (method === 'initialize') return null;

  const version = req.header('MCP-Protocol-Version');
  if (!version) {
    logger.warn('MCP-Protocol-Version header missing; compatibility mode assumed', { method });
    return null;
  }

  if (!SUPPORTED_MCP_PROTOCOL_VERSIONS.includes(version)) {
    return {
      status: 400,
      code: 'UNSUPPORTED_MCP_PROTOCOL_VERSION',
      message: `Unsupported MCP-Protocol-Version header: ${version}`
    };
  }

  return null;
}

function validateAcceptHeader(req) {
  const accept = req.header('Accept');
  if (!accept || accept === '*/*') return null;

  const mediaTypes = accept
    .split(',')
    .map((part) => part.split(';')[0].trim().toLowerCase())
    .filter(Boolean);

  if (!mediaTypes.includes('application/json') && !mediaTypes.includes('*/*')) {
    return {
      status: 406,
      code: 'NOT_ACCEPTABLE',
      message: 'Accept header must include application/json'
    };
  }

  return null;
}
```

### 4.3 `GET /mcp` 라우트 추가

```javascript
router.get('/mcp', (req, res) => {
  res.set('Allow', 'POST');
  return res.status(405).json({
    error: {
      code: 'METHOD_NOT_ALLOWED',
      message: 'GET /mcp is not supported because SSE streams are disabled. Use POST /mcp.'
    }
  });
});
```

### 4.4 `POST /mcp` 분기 구조 변경

기존 `router.post('/mcp', ...)`의 초반부를 다음 순서로 정리한다.

```javascript
const messageInfo = classifyJsonRpcMessage(req.body);
if (messageInfo.type === 'invalid') {
  return res.json(createJsonRpcError(req.body && req.body.id, -32600, 'Invalid Request', messageInfo.reason));
}

const { id, method, params } = req.body;

const acceptError = validateAcceptHeader(req);
if (acceptError) {
  return res.status(acceptError.status).json({ error: acceptError });
}

const protocolHeaderError = validateMcpProtocolVersionHeader(req, method, logger);
if (protocolHeaderError) {
  return res.status(protocolHeaderError.status).json({ error: protocolHeaderError });
}

if (messageInfo.type === 'notification') {
  if (method === 'notifications/initialized') {
    logger.info('MCP: notifications/initialized called');
    activityLogger.mcp('INITIALIZED', { ip: req.ip });
    return res.status(202).end();
  }

  logger.info('MCP: notification accepted', { method });
  return res.status(202).end();
}

if (messageInfo.type === 'response') {
  logger.info('MCP: client response accepted');
  return res.status(202).end();
}
```

### 4.5 `initialize` 응답 변경

기존 `initialize` case에서 `protocolVersion: '2024-11-05'`를 제거하고 협상 결과를 사용한다.

```javascript
case 'initialize': {
  logger.info('MCP: initialize called');
  activityLogger.mcp('INITIALIZE', { ip: req.ip });

  const protocolVersion = negotiateProtocolVersion(params && params.protocolVersion);
  if (params && params.protocolVersion && params.protocolVersion !== protocolVersion) {
    logger.warn('MCP: unsupported protocolVersion requested; falling back to supported version', {
      requested: params.protocolVersion,
      selected: protocolVersion
    });
  }

  return res.json(createJsonRpcResponse(id, {
    protocolVersion,
    capabilities: {
      tools: {}
    },
    serverInfo: {
      name: prefix,
      version: '1.0.0'
    },
    instructions: `Use this server to retrieve internal documentation and code examples.\n\nRecommended workflow:\n1. Call resolve_project to find the right document path for a project/library name\n2. Call query_document or query_code_examples with the resolved path\n3. Use ${prefix}_smart_search for cross-document natural language search\n4. Use summarize_document to understand document structure before reading full content\n\nTips:\n- Always call resolve_project first if you don't know the exact document path\n- Use query_code_examples when you specifically need code snippets\n- Set maxTokens to control response size and save context window`
  }));
}
```

---

## 5. 테스트 계획

### 5.1 새 테스트 파일

**파일**: `test/mcp/streamable-http.test.js`

테스트는 Node 기본 `assert`, `http`, `src/app`을 사용한다. 기존 `test/test-mcp-tools.js`와 같은 방식으로 서버를 띄우고 요청을 보낸다.

### 5.2 테스트 케이스

#### TC-20-001: `GET /mcp`는 405와 `Allow: POST` 반환

```javascript
const res = await sendRawRequest({ method: 'GET', path: '/mcp' });
assert.strictEqual(res.statusCode, 405);
assert.strictEqual(res.headers.allow, 'POST');
assert.strictEqual(JSON.parse(res.body).error.code, 'METHOD_NOT_ALLOWED');
```

#### TC-20-002: `initialize`는 `2025-11-25` 반환

```javascript
const res = await sendMcpRequest('initialize', {
  protocolVersion: '2025-11-25',
  capabilities: {},
  clientInfo: { name: 'test-client', version: '1.0.0' }
});
assert.strictEqual(res.statusCode, 200);
assert.strictEqual(res.json.result.protocolVersion, '2025-11-25');
```

#### TC-20-003: 미지원 `initialize.params.protocolVersion`은 서버 지원 version으로 fallback

```javascript
const res = await sendMcpRequest('initialize', {
  protocolVersion: '1900-01-01',
  capabilities: {},
  clientInfo: { name: 'test-client', version: '1.0.0' }
});
assert.strictEqual(res.statusCode, 200);
assert.strictEqual(res.json.result.protocolVersion, '2025-11-25');
```

#### TC-20-004: `notifications/initialized`는 202

```javascript
const res = await sendRawJson({
  jsonrpc: '2.0',
  method: 'notifications/initialized'
});
assert.strictEqual(res.statusCode, 202);
assert.strictEqual(res.body, '');
```

#### TC-20-005: 일반 request는 `MCP-Protocol-Version` 지원값을 허용

```javascript
const res = await sendMcpRequest('tools/list', null, {
  'MCP-Protocol-Version': '2025-11-25',
  'Accept': 'application/json, text/event-stream'
});
assert.strictEqual(res.statusCode, 200);
assert.ok(Array.isArray(res.json.result.tools));
```

#### TC-20-006: 미지원 `MCP-Protocol-Version` header는 400

```javascript
const res = await sendMcpRequest('tools/list', null, {
  'MCP-Protocol-Version': '2024-11-05'
});
assert.strictEqual(res.statusCode, 400);
assert.strictEqual(res.json.error.code, 'UNSUPPORTED_MCP_PROTOCOL_VERSION');
```

#### TC-20-007: `Accept`에 `application/json`이 없으면 406

```javascript
const res = await sendMcpRequest('tools/list', null, {
  'Accept': 'text/event-stream',
  'MCP-Protocol-Version': '2025-11-25'
});
assert.strictEqual(res.statusCode, 406);
assert.strictEqual(res.json.error.code, 'NOT_ACCEPTABLE');
```

#### TC-20-008: JSON-RPC response message는 202

```javascript
const res = await sendRawJson({
  jsonrpc: '2.0',
  id: 99,
  result: { ok: true }
});
assert.strictEqual(res.statusCode, 202);
assert.strictEqual(res.body, '');
```

#### TC-20-009: batch array body는 JSON-RPC Invalid Request

```javascript
const res = await sendRawJson([
  { jsonrpc: '2.0', id: 1, method: 'tools/list' }
]);
assert.strictEqual(res.statusCode, 200);
assert.strictEqual(res.json.error.code, -32600);
```

#### TC-20-010: `MCP-Protocol-Version` header 누락은 compatibility mode로 허용

```javascript
const res = await sendMcpRequest('tools/list');
assert.strictEqual(res.statusCode, 200);
assert.ok(Array.isArray(res.json.result.tools));
```

#### TC-20-011: Origin 없는 `initialize`는 허용

```javascript
const res = await sendMcpRequest('initialize', {
  protocolVersion: '2025-11-25',
  capabilities: {},
  clientInfo: { name: 'test-client', version: '1.0.0' }
}, { Origin: undefined });
assert.strictEqual(res.statusCode, 200);
```

#### TC-20-012: Origin 없는 `tools/list`는 Host가 유효하면 허용

```javascript
const res = await sendMcpRequest('tools/list', null, {
  'Host': 'localhost:3000',
  'MCP-Protocol-Version': '2025-11-25'
});
assert.strictEqual(res.statusCode, 200);
assert.ok(Array.isArray(res.json.result.tools));
```

#### TC-20-013: Origin이 없어도 invalid Host는 403

```javascript
const res = await sendMcpRequest('tools/list', null, {
  'Host': 'attacker.example',
  'MCP-Protocol-Version': '2025-11-25'
});
assert.strictEqual(res.statusCode, 403);
assert.strictEqual(res.json.error.code, 'FORBIDDEN_HOST');
```

#### TC-20-014: invalid Origin + valid Host는 403

```javascript
const res = await sendMcpRequest('tools/list', null, {
  'Origin': 'https://attacker.example',
  'Host': 'localhost:3000',
  'MCP-Protocol-Version': '2025-11-25'
});
assert.strictEqual(res.statusCode, 403);
assert.strictEqual(res.json.error.code, 'FORBIDDEN_ORIGIN');
```

#### TC-20-015: valid Origin + invalid Host는 403

```javascript
const res = await sendMcpRequest('tools/list', null, {
  'Origin': 'http://localhost:3000',
  'Host': 'attacker.example',
  'MCP-Protocol-Version': '2025-11-25'
});
assert.strictEqual(res.statusCode, 403);
assert.strictEqual(res.json.error.code, 'FORBIDDEN_HOST');
```

#### TC-20-016: custom allowed Origin/Host는 허용

```javascript
// test config: mcp.allowedOrigins = ['https://docs.example.com']
// test config: mcp.allowedHosts = ['docs.example.com']
const res = await sendMcpRequest('tools/list', null, {
  'Origin': 'https://docs.example.com',
  'Host': 'docs.example.com',
  'MCP-Protocol-Version': '2025-11-25'
});
assert.strictEqual(res.statusCode, 200);
```

#### TC-20-017: wildcard Origin/Host는 허용하고 warning을 남김

```javascript
// test config: mcp.allowedOrigins = ['*'], mcp.allowedHosts = ['*']
const res = await sendMcpRequest('tools/list', null, {
  'Origin': 'https://attacker.example',
  'Host': 'attacker.example',
  'MCP-Protocol-Version': '2025-11-25'
});
assert.strictEqual(res.statusCode, 200);
assert.ok(loggerWarns.some(message => message.includes('MCP') && message.includes('wildcard')));
```

#### TC-20-018: invalid allowlist config는 startup validation error

```javascript
assert.throws(
  () => loadConfig({ mcp: { allowedOrigins: 'https://docs.example.com' } }),
  /mcp\.allowedOrigins/
);
```

#### TC-20-019: 기본 bind address는 `127.0.0.1`

```javascript
delete process.env.HOST;
const config = loadConfig({});
assert.strictEqual(resolveListenHost(config), '127.0.0.1');
```

#### TC-20-020: malformed Origin/Host는 차단

```javascript
const originRes = await sendMcpRequest('tools/list', null, {
  'Origin': 'not a url',
  'Host': 'localhost:3000',
  'MCP-Protocol-Version': '2025-11-25'
});
assert.strictEqual(originRes.statusCode, 403);
assert.strictEqual(originRes.json.error.code, 'FORBIDDEN_ORIGIN');

const hostRes = await sendMcpRequest('tools/list', null, {
  'Host': '',
  'MCP-Protocol-Version': '2025-11-25'
});
assert.strictEqual(hostRes.statusCode, 403);
assert.strictEqual(hostRes.json.error.code, 'FORBIDDEN_HOST');
```

### 5.3 테스트 실행

```bash
node test/mcp/streamable-http.test.js
```

예상 결과:

```text
streamable-http: all tests passed
```

기본 테스트 suite에 포함한 뒤에는 다음을 실행한다.

```bash
npm test
```

예상 결과:

```text
PASS - all suites passed
```

---

## 6. 구현 Phase

### Phase 1: Transport semantics 정리 (P0)

- [ ] `src/routes/mcp.js`에 Streamable HTTP 상수와 helper 추가
- [ ] `GET /mcp` 405 route 추가
- [ ] JSON-RPC message type 판별 추가
- [ ] `notifications/initialized` 202 처리 추가
- [ ] client response message 202 처리 추가
- [ ] `node test/mcp/streamable-http.test.js`로 P0 transport 테스트 통과

### Phase 2: Protocol version 및 header 정책 (P0)

- [ ] `initialize` 응답 protocolVersion을 `2025-11-25`로 변경
- [ ] `initialize.params.protocolVersion` 협상 구현
- [ ] `MCP-Protocol-Version` header 검증 추가
- [ ] `Accept` header compatibility 검증 추가
- [ ] unsupported header/version 테스트 추가
- [ ] `npm test` 기본 suite 통과

### Phase 3: MCP 보안 보강 (P0)

- [ ] `config-loader`에서 `config.mcp.allowedOrigins`와 `config.mcp.allowedHosts` 기본값 생성
- [ ] invalid allowlist config를 startup validation error로 처리
- [ ] wildcard `["*"]` 사용 시 insecure opt-out warning 추가
- [ ] `/mcp` Origin 처리 절차와 Origin allowlist exact match 추가
- [ ] `/mcp` Host allowlist 검증을 모든 요청에 적용
- [ ] 기본 bind address를 `127.0.0.1`로 변경
- [ ] Origin 없음, invalid Origin, invalid Host, custom allowlist, wildcard, malformed Origin/Host 테스트 추가

### Phase 4: 문서 갱신 (P1)

- [ ] `public/mcp-doc.md`의 MCP version을 `2025-11-25`로 갱신
- [ ] `public/mcp-doc.md`에 `GET /mcp` 405와 SSE 미지원 정책 추가
- [ ] public read mode, wildcard insecure opt-out, default localhost bind, reverse proxy Host 보존 정책 추가
- [ ] curl 예제에 `Accept` 및 `MCP-Protocol-Version` header 추가
- [ ] `/context`를 MCP transport endpoint가 아닌 context helper로 설명
- [ ] `docs/api/doc/ko/api-curl-example.md`의 MCP 예제 갱신

### Phase 5: 회귀 확인 및 정리 (P1)

- [ ] `node test/mcp/streamable-http.test.js` 실행
- [ ] `node test/test-mcp-tools.js` 실행
- [ ] `node test/mcp/handler-parity.test.js` 실행
- [ ] `npm test` 실행
- [ ] `git diff --check` 실행
- [ ] `docs/srs/plan.step20_mcp_streamable_http.completion.md`에 구현 결과와 테스트 결과 기록

---

## 7. 수동 검증 시나리오

### 7.1 initialize

```bash
curl -i -X POST http://localhost:3000/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-11-25",
      "capabilities": {},
      "clientInfo": {
        "name": "curl",
        "version": "1.0.0"
      }
    }
  }'
```

검증:

- HTTP status `200`
- `result.protocolVersion`이 `2025-11-25`
- `result.capabilities.tools` 존재

### 7.2 initialized notification

```bash
curl -i -X POST http://localhost:3000/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'MCP-Protocol-Version: 2025-11-25' \
  -d '{
    "jsonrpc": "2.0",
    "method": "notifications/initialized"
  }'
```

검증:

- HTTP status `202`
- response body 없음

### 7.3 tools/list

```bash
curl -i -X POST http://localhost:3000/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'MCP-Protocol-Version: 2025-11-25' \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/list"
  }'
```

검증:

- HTTP status `200`
- `result.tools` 배열 존재
- 기존 tool 이름이 유지됨

### 7.4 GET 미지원

```bash
curl -i -X GET http://localhost:3000/mcp \
  -H 'Accept: text/event-stream'
```

검증:

- HTTP status `405`
- `Allow: POST`
- SSE stream이 열리지 않음

---

## 8. 완료 기준

- [ ] `GET /mcp`가 `405 Method Not Allowed`와 `Allow: POST`를 반환한다.
- [ ] `POST /mcp` request는 기존처럼 JSON-RPC response를 반환한다.
- [ ] JSON-RPC notification은 `202 Accepted`로 수락된다.
- [ ] `notifications/initialized`가 에러 없이 수락된다.
- [ ] `initialize`가 `protocolVersion: "2025-11-25"`를 반환한다.
- [ ] 미지원 `initialize.params.protocolVersion`은 서버 지원 version인 `2025-11-25`로 fallback 응답한다.
- [ ] 지원하지 않는 `MCP-Protocol-Version` header는 `400 Bad Request`로 응답한다.
- [ ] `Accept`에 `application/json`이 없으면 `406 Not Acceptable`로 응답한다.
- [ ] 기존 MCP tool handler registry와 tools/list 결과가 유지된다.
- [ ] `/context`는 기존 helper endpoint로 유지되며 deprecated 처리하지 않는다.
- [ ] Origin이 있는 `/mcp` 요청은 `mcp.allowedOrigins` 검증을 통과해야 한다.
- [ ] Origin이 없는 `/mcp` 요청은 Origin 누락만으로 거부되지 않는다.
- [ ] 모든 `/mcp` 요청의 HTTP `Host` header는 `mcp.allowedHosts` 검증을 통과해야 한다.
- [ ] invalid Origin/Host는 tool dispatch 전에 `403`으로 차단된다.
- [ ] custom Origin/Host allowlist가 실제 route에서 적용된다.
- [ ] wildcard `["*"]` 사용 시 insecure opt-out warning이 남는다.
- [ ] invalid allowlist config는 startup validation error를 발생시킨다.
- [ ] 명시 host 설정이 없으면 기본 bind address가 `127.0.0.1`이다.
- [ ] MCP 문서와 curl 예제가 새 transport 정책과 일치한다.
- [ ] `npm test`가 통과한다.

---

## 9. 후순위 항목

### 9.1 `MCP-Session-Id` 기반 lifecycle gate

이번 Step에서는 구현하지 않는다. 후속 phase에서 다음을 별도 설계한다.

- `initialize` 성공 시 secure random session id 발급
- `MCP-Session-Id` response header 반환
- session state `{ protocolVersion, initialized, createdAt, lastSeenAt }` 저장
- `notifications/initialized` 이후에만 tool request 허용
- missing session은 `400`, unknown/expired session은 `404`

### 9.2 trusted proxy 기반 forwarded header 지원

이번 Step에서는 `X-Forwarded-Host` 또는 `X-Forwarded-Proto`를 신뢰하지 않는다. 후속 phase에서 trusted proxy 설정, proxy chain 검증, forwarded header 정규화 정책을 별도 설계한다.

### 9.3 MCP 전용 read auth 설정

이번 Step에서는 MCP 전용 `mcp.requireReadAuth`를 추가하지 않는다. read tools 인증은 기존 `auth.requireReadLogin` 정책을 따른다.

---

## 10. 리스크와 대응

| 리스크 | 영향 | 대응 |
|--------|------|------|
| 기존 client가 `MCP-Protocol-Version` header를 보내지 않음 | 기존 사용자의 MCP 호출 실패 가능 | 초기 구현은 header 누락 허용 |
| 일부 client가 `Accept: text/event-stream`만 전송 | `406`으로 실패 | 문서에 `application/json, text/event-stream` 필요성을 명시 |
| `protocolVersion`을 `2024-11-05`로 기대하는 client 존재 | 서버가 `2025-11-25`로 fallback 응답할 수 있음 | client가 fallback version을 수락하지 못하면 별도 legacy mode Step을 작성 |
| session gate 미구현 | lifecycle strict conformance 부족 | 계획 문서와 gap 문서에 후순위로 명시 |
| Origin 없는 non-browser 요청 허용 | Origin header만으로 모든 access control을 대체할 수 없음 | read authentication, localhost bind, IP allowlist, reverse proxy ACL을 운영 문서에 명시 |
| wildcard allowlist 사용 | DNS rebinding 방어 비활성화 | 기본값으로 사용하지 않고 startup warning 및 문서 경고 제공 |
| 기본 bind 변경 | 기존 원격 직접 접속 사용자가 접속 실패 가능 | 원격 직접 접속 시 `host: "0.0.0.0"` 또는 특정 IP 명시를 문서화 |
