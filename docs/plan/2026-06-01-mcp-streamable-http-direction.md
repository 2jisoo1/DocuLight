# MCP Streamable HTTP 방향 결정 초안

## 상태

- 작성일: 2026-06-01
- 목적: SSE를 지원하지 않고 최신 MCP Streamable HTTP 최소 준수를 목표로 할 때의 1차 방향 결정
- 입력 문서:
  - `docs/research/2026-06-01-mcp-streamable-http-spec.md`
  - `docs/analysis/2026-06-01.mcp-streamable-http-gap.md`
- 성격: 최종 구현 계획이 아니라, 후속 research/plan 보강 phase의 기준 초안

## 목표 범위

DocuLight는 `GET` SSE stream을 제공하지 않는다. 대신 `/mcp`를 최신 Streamable HTTP의 단일 endpoint로 정리하고, 모든 JSON-RPC request 응답은 `application/json` 단일 JSON 객체로 반환한다.

따라서 이번 목표는 "streaming 구현"이 아니라 "SSE 미지원 Streamable HTTP 최소 준수"이다.

## 핵심 방향 결정

| 항목 | 초안 결정 |
| --- | --- |
| MCP endpoint | `/mcp`만 최신 Streamable HTTP endpoint로 승격한다 |
| SSE | 지원하지 않는다 |
| `POST /mcp` request 응답 | `Content-Type: application/json` 단일 JSON-RPC response |
| `GET /mcp` | SSE 미지원 신호로 `405 Method Not Allowed` 반환 |
| `POST /mcp` notification/response | 수락 가능한 경우 `202 Accepted` + empty body |
| `/context` | 이번 Streamable HTTP 대상에서 제외하고 legacy/context helper로 분류 |
| protocol version | MCP protocol spec revision version으로 해석한다 |
| lifecycle 지원 | `MCP-Session-Id` 기반 stateful 강제는 설계/구현 우선순위를 최후순위로 둔다 |
| Origin 검증 | 필요성은 인정하되 초기 구현 우선순위에서는 낮춘다 |

## GAP별 선택

### GAP-1. `GET /mcp`

**결정**: `GET /mcp`를 추가하되 SSE stream은 열지 않는다.

**동작**:

- `GET /mcp` + `Accept: text/event-stream` -> `405 Method Not Allowed`
- 응답 body는 비워도 되지만, 디버깅 편의상 JSON error body를 둘지는 후속 research에서 결정한다.
- `Allow` header는 후속 research에서 확정한다. HTTP 405 관례상 초안은 `Allow: POST`를 선호한다.

### GAP-2, GAP-6. notification/response 처리

**결정**: JSON-RPC message type을 request, notification, response로 먼저 판별한다.

**동작**:

- request: `id`가 있고 `method`가 있는 메시지. 기존 JSON-RPC response 반환.
- notification: `id`가 없고 `method`가 있는 메시지. 수락 시 `202`.
- response: `id`가 있고 `result` 또는 `error`가 있으며 `method`가 없는 메시지. 현재 서버가 client request를 발행하지 않으므로 수락 후 `202` 또는 명확한 `400` 중 후속 결정. 초안은 미래 호환성을 위해 `202` 수락을 선호한다.
- batch array는 최신 스펙 기준으로 지원하지 않는다.

### GAP-3. lifecycle 강제

**질문**: GAP 3은 어떻게 이를 지원할 수 있는가?

**결정**: `MCP-Session-Id`를 사용하는 stateful lifecycle 강제는 이번 구현 우선순위의 최후순위로 둔다.

HTTP는 요청이 분리되므로 `initialize` -> `notifications/initialized` -> operation 순서를 강하게 보장하려면 요청들을 같은 logical session으로 묶는 식별자가 필요하다. MCP Streamable HTTP에는 `MCP-Session-Id` 개념이 있지만, 서버가 반드시 발급해야 하는 필수 기능은 아니다. 이 프로젝트에서는 구현 난이도와 영향 범위가 크므로, 우선은 session 없는 최소 Streamable HTTP 호환을 먼저 만든다.

**이번 phase의 최소 선택**:

1. `initialize` request를 정상 처리하고 `protocolVersion`을 협상한다.
2. `notifications/initialized` notification은 수락하고 `202`를 반환한다.
3. `tools/list`, `tools/call`에 대한 hard session gate는 걸지 않는다.
4. 문서에는 "session 기반 lifecycle 강제는 후속 phase"로 명시한다.

**후순위 후보 설계**:

1. Client가 `POST /mcp` `initialize` request를 보낸다.
2. Server는 secure random session id를 만들고, `MCP-Session-Id` response header에 넣어 반환한다.
3. Session state는 `{ protocolVersion, initialized: false, createdAt, lastSeenAt }`로 저장한다.
4. Client가 같은 `MCP-Session-Id`로 `notifications/initialized` notification을 보낸다.
5. Server는 `initialized: true`로 바꾸고 `202`를 반환한다.
6. `tools/list`, `tools/call`은 `initialized: true`인 session에서만 허용한다.
7. session id가 없으면 `400 Bad Request`, unknown/expired/terminated session id이면 `404 Not Found`를 반환한다.

**열어둘 research 질문**:

- `initialize` 이전에 허용할 method는 `initialize`와 `ping`만 둘지.
- session 만료 시간을 얼마로 둘지.
- 서버 재시작 시 in-memory session이 사라지는 것을 허용할지.
- session을 구현하지 않는 최소 모드가 주요 MCP clients에서 실제로 문제 없는지.

### GAP-4. `protocolVersion` 의미와 negotiation

**질문**: `"protocolVersion"`이 어떤 프로토콜 버전을 말하는지?

**결정**: `protocolVersion`은 JSON-RPC 버전, HTTP 버전, DocuLight 앱 버전이 아니다. MCP specification revision version이다.

예:

- JSON-RPC 버전: `"jsonrpc": "2.0"`
- MCP protocol version: `"protocolVersion": "2025-11-25"`
- DocuLight server version: `serverInfo.version`

**초안 지원 정책**:

- Streamable HTTP 목표 version은 `2025-11-25`로 둔다.
- `SUPPORTED_MCP_PROTOCOL_VERSIONS = ["2025-11-25"]`로 시작한다.
- `initialize.params.protocolVersion === "2025-11-25"`이면 같은 version으로 응답한다.
- 요청 version이 미지원이면 JSON-RPC initialization error를 반환할지, 서버 지원 최신 version을 반환할지는 후속 research에서 결정한다.
- 기존 `2024-11-05` client 호환은 이번 목표 범위 밖으로 둔다. 필요하면 별도 legacy mode로 분리한다.

### GAP-5. `MCP-Protocol-Version` header

**결정**: session 없는 최소 구현에서는 `MCP-Protocol-Version` header 자체를 기준으로 검증한다. session 기반 구현이 도입되면 session에 저장된 negotiated version과 header를 함께 검증한다.

**동작 초안**:

- `initialize`: header 없어도 허용.
- 이후 request: `MCP-Protocol-Version`을 검증한다.
- header 값이 지원 version 목록에 없으면 `400 Bad Request`.
- header가 없으면 compatibility mode에서는 허용할 수 있으나, conformance mode에서는 `400`을 선호한다.
- `MCP-Session-Id` 검증은 후순위 session phase에서 다룬다.

### GAP-7. `Accept` header

**결정**: 엄격 검증보다 단계적 도입을 선호한다.

**동작 초안**:

- 신규 conformance test에는 `Accept: application/json, text/event-stream`을 반드시 넣는다.
- 서버는 compatibility mode에서 `Accept` 누락을 허용하되, conformance mode에서는 `Accept`에 `application/json`과 `text/event-stream`이 모두 있는지 검증한다.
- unsupported `Accept`는 `406 Not Acceptable` 또는 `400 Bad Request` 중 후속 research에서 확정한다.
- 기존 curl/test 호환성을 유지하면서 점진적으로 문서를 갱신한다.

### GAP-8. Origin 검증

**질문**: Gap 8은 Origin을 어떻게 검증하라는 것인지?

**결정**: `Origin` allowlist는 필요성은 인정하되, 초기 Streamable HTTP 구현 우선순위에서는 낮춘다.

이유는 현재 코드에 Origin allowlist 인가 로직이 없고, 기존 allowlist는 IP 기반 `security.allows`뿐이기 때문이다. 먼저 `/mcp`의 transport semantics, protocol version negotiation, notification handling, method/Accept 처리를 맞춘 뒤 MCP endpoint 전용 Origin 검증을 별도 보안 hardening 항목으로 다룬다.

**후순위 구현 시 검증 방식 초안**:

1. `Origin` header가 없으면 allow.
2. `Origin` header가 있으면 URL로 parse한다.
3. parse 실패 시 `403 Forbidden`.
4. `origin` 문자열(`scheme://host[:port]`)을 allowlist와 exact match한다.
5. match 실패 시 `403 Forbidden`.

**후순위 allowlist 초안**:

- 현재 코드에는 Origin allowlist 인가 로직이 없다. 기존 allowlist는 IP 기반 `security.allows`뿐이다.
- 새 설정 후보: `security.mcp.allowedOrigins`
- 기본값:
  - `http://localhost:<port>`
  - `http://127.0.0.1:<port>`
  - `http://[::1]:<port>`
  - SSL enabled이면 `https` variant
- 외부 reverse proxy 배포는 운영자가 explicit origin을 추가한다.

**기존 allowlist 참고**:

- 위치: `security.allows`
- 형태: 문자열 배열
- 지원 입력:
  - 정확한 IPv4: `"127.0.0.1"`
  - IPv6 localhost: `"::1"`
  - 와일드카드: `"10.0.1.*"`
  - 범위: `"10.0.100-200.*"`
  - CIDR: `"192.168.1.0/24"`
- 적용 로직: `src/middleware/ip-whitelist.js`가 `config.security.allows`를 읽고, 비어 있으면 비활성화한다. `src/utils/ip-matcher.js`가 패턴 매칭을 수행한다.
- Origin allowlist는 URL origin 문자열(`scheme://host[:port]`)을 다루므로, 기존 IP allowlist와 별도 설정/별도 matcher가 필요하다.

**추가 research 질문**:

- reverse proxy에서 `X-Forwarded-Proto`, `X-Forwarded-Host`를 신뢰할지.
- `Host` header 검증도 같이 할지.
- `null` Origin을 어떻게 처리할지.

### GAP-9. local bind

**결정**: 이번 초안에서는 기본 bind 변경을 바로 결정하지 않는다.

`0.0.0.0` 기본값은 기존 사용자의 네트워크 접근 방식과 충돌할 수 있다. 대신 Streamable HTTP 구현 phase에서는 최소한 다음을 포함한다.

- 문서에 MCP local exposure 경고 추가
- `Origin` 검증은 후순위 보안 hardening으로 분리
- 후속 research에서 `host` 기본값 변경 여부 별도 결정

### GAP-10. 문서 정리

**결정**: 구현 전에는 현재 상태를 legacy/simple HTTP JSON-RPC로 표기하고, 구현 후에는 Streamable HTTP 최소 구현으로 문서를 갱신한다.

문서에 명시할 문장:

> DocuLight supports MCP Streamable HTTP without SSE. `POST /mcp` returns single JSON-RPC responses as `application/json`; `GET /mcp` returns `405 Method Not Allowed` because server-to-client SSE streams are not supported.

### GAP-11. `/context`

**질문**: Gap 11은, 내부에서 `GET /context`를 호출하는 곳이 있는지 확인할 것.

**확인 결과**: 현재 런타임 내부 호출은 발견되지 않았다.

검색 범위:

- `src`
- `public`
- `test`

검색 결과 성격:

- `src/routes/context-mcp.js`의 라우트 정의 및 usage 문자열
- `src/app.js`의 router mount
- service 단위 테스트 import
- `public/js/modules/context-menu.js` 및 `contextualize` 같은 이름 기반 false positive

**결정**:

- `/context`는 이번 Streamable HTTP 구현 대상에서 제외한다.
- `/context`의 `GET`은 MCP Streamable HTTP GET이 아니라 legacy REST-like helper로 유지한다.
- 문서에서는 `/context`를 "MCP transport endpoint"로 부르지 않고 "context helper endpoint"로 분리한다.
- deprecation은 이번 초안에서 결정하지 않는다.
- 의사결정 사항: `/context`는 기존 사용자를 위해 유지하되, 최신 Streamable HTTP 준수 범위와는 분리한다.
- 향후 public contract를 정리할 때 `/context`의 명칭과 문서 표현만 별도 검토한다.

## 1차 구현 순서 초안

1. `src/routes/mcp.js`에 message type 판별과 `GET /mcp` 405 추가
2. `initialize`에서 `2025-11-25` negotiation 구현
3. `notifications/initialized` notification `202` 처리
4. `MCP-Protocol-Version` header 검증
5. conformance 중심 테스트 추가
6. README 및 MCP 문서 갱신
7. 후순위 phase에서 MCP endpoint 전용 Origin 검증 middleware 검토
8. 후순위 phase에서 `MCP-Session-Id` 기반 lifecycle gate 검토

## 후속 research에서 보강할 항목

- official SDK들의 Streamable HTTP no-SSE 구현 관례
- `MCP-Session-Id`를 쓰는 서버의 session expiry 관례
- `MCP-Protocol-Version` 누락 시 compatibility 처리 관례
- Origin allowlist default와 reverse proxy 배포 사례
- 기존 Claude Code HTTP transport가 no-SSE Streamable HTTP 서버에 요구하는 실제 handshake
