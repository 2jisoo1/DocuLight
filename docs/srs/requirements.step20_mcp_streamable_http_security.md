# Step 20 MCP Streamable HTTP 보안 요구사항

## 1. 메타데이터

- **작성일**: 2026-06-02
- **대상**: `/mcp` Streamable HTTP endpoint
- **작성 배경**:
  - GitHub issue #1: Codex/RMCP client가 `notifications/initialized` 미지원으로 startup handshake에 실패
  - PR #2 review: Streamable HTTP endpoint에 Origin 검증이 없어 DNS rebinding으로 공개 read tools가 노출될 수 있다는 지적
- **기준 스펙**:
  - MCP Streamable HTTP transport security warning
  - Origin validation MUST
  - invalid Origin 403 MUST
  - local server localhost bind SHOULD
  - proper authentication SHOULD
- **문서 성격**: IEEE 29148 스타일의 문제 정의, 정책 결정, 검증 가능한 시스템 요구사항

---

## 2. 문제 정의

### 2.1 Lifecycle 호환성 문제

Codex/RMCP Streamable HTTP client는 `initialize` 성공 후 `notifications/initialized` notification을 전송한다. 기존 DocuLight `/mcp`는 이 notification을 지원하지 않아 JSON-RPC `Method not found`를 반환했고, client startup handshake가 실패했다.

### 2.2 Public read mode 노출 문제

DocuLight는 `auth.requireReadLogin=false`일 때 MCP read tools가 API key 없이 문서 목록과 문서 내용을 반환할 수 있다. 이 상태에서 브라우저 기반 요청이 DNS rebinding 등을 통해 내부 `/mcp` endpoint에 도달하면, 운영자가 의도하지 않은 문서 노출이 발생할 수 있다.

따라서 보안 요구사항의 중심은 단순히 "Origin guard 구현"이 아니라 **public read mode에서 browser-origin 요청이 내부 문서 조회 도구를 실행하지 못하도록 제어하는 것**이다.

### 2.3 운영 설정 문제

DocuLight는 로컬 개발, 사내망 직접 접속, reverse proxy 뒤 public domain 배포가 모두 가능하다. 따라서 MCP 보안 정책은 다음 운영자를 모두 고려해야 한다.

- localhost에서 Codex/Claude/curl로 MCP를 사용하는 개발자
- 사내망 IP로 DocuLight를 직접 노출하는 운영자
- nginx 등 reverse proxy 뒤에서 public domain으로 노출하는 운영자
- `auth.requireReadLogin=false`로 문서를 공개 조회시키는 문서 소유자
- DNS rebinding 및 내부망 노출을 검토하는 보안 리뷰어

---

## 3. 정책 결정

### POL-MCP-001: Origin validation은 `/mcp`의 필수 보안 절차다

DocuLight는 모든 `/mcp` HTTP 요청에서 Origin 처리 절차를 수행한다.

- `Origin` header가 있으면 `mcp.allowedOrigins`와 비교한다.
- `Origin` header가 있고 허용되지 않으면 HTTP `403 Forbidden`을 반환한다.
- `Origin` header가 없으면 "valid Origin"으로 간주하지 않는다. 대신 non-browser MCP client 호환을 위해 Origin 누락만으로 요청을 거부하지 않는다.

### POL-MCP-002: Origin 없는 MCP client는 호환성을 위해 허용한다

Codex, Claude Code, curl, 서버형 MCP client는 브라우저가 아니므로 `Origin` header를 보내지 않을 수 있다. 따라서 `Origin` header가 없는 요청은 Origin 누락만으로 거부하지 않는다.

단, 이는 보안 통과가 아니라 "Origin 기반 browser request 판정 대상이 아님"을 의미한다. 이 경우 접근 통제는 다음 중 하나 이상으로 보완해야 한다.

- read authentication
- localhost bind
- IP allowlist
- reverse proxy access control

### POL-MCP-003: Host header는 항상 검사한다

DNS rebinding 방어 보강을 위해 `/mcp` 요청의 HTTP `Host` header는 항상 `mcp.allowedHosts`와 비교한다.

- 허용되지 않은 Host이면 HTTP `403 Forbidden`을 반환한다.
- Origin과 Host가 모두 invalid이면 Origin error를 먼저 반환해도 된다.
- `X-Forwarded-Host`는 이번 정책에서 신뢰하지 않는다.
- reverse proxy 배포에서는 proxy가 원래 `Host` header를 보존해야 한다.

### POL-MCP-004: 기본 bind address는 `127.0.0.1`로 변경한다

로컬 MCP 서버는 스펙의 SHOULD 권고에 따라 기본적으로 localhost에만 bind한다.

- 기본 `host` 값은 `127.0.0.1`이다.
- 원격 직접 접속이 필요한 운영자는 `host: "0.0.0.0"` 또는 특정 서버 IP를 명시해야 한다.
- public/reverse proxy 배포는 DocuLight를 `127.0.0.1`에 bind하고 proxy가 외부 접속을 받는 구성을 권장한다.

### POL-MCP-005: read tools 인증 정책은 기존 `auth.requireReadLogin`을 따른다

이번 Step에서는 MCP 전용 read auth 기본값을 새로 만들지 않는다.

- write tools는 API key가 필요하다.
- read tools는 `auth.requireReadLogin=true`일 때 API key가 필요하다.
- `auth.requireReadLogin=false`이면 read tools는 공개 조회될 수 있다.
- public/network 배포에서 공개 read mode를 사용할 경우 Origin/Host allowlist만 믿지 말고 read authentication, IP allowlist, reverse proxy ACL 중 하나 이상을 적용해야 한다.

### POL-MCP-006: wildcard `["*"]`는 insecure opt-out이다

`mcp.allowedOrigins` 또는 `mcp.allowedHosts`에 `["*"]`를 사용할 수 있다. 단, 이는 해당 검증을 끄는 insecure opt-out이다.

- 기본값으로 wildcard를 사용하지 않는다.
- wildcard 사용 시 startup warning을 남긴다.
- wildcard와 구체 allowlist가 섞이면 wildcard가 우선하며 warning을 남긴다.
- wildcard는 well-formed Origin/Host에 대한 allowlist 판정만 우회한다.
- malformed present Origin과 malformed/missing Host는 wildcard여도 `403 Forbidden`이다.
- public read mode에서는 wildcard 사용을 권장하지 않는다.

### POL-MCP-007: `config.mcp`는 config loading 단계에서 정규화/검증한다

`mcp.allowedOrigins`와 `mcp.allowedHosts`는 route 내부에서 즉석 해석하지 않고 config loading 단계에서 정규화/검증한다.

기본값은 localhost MCP 사용을 기준으로 생성한다.

- `allowedOrigins`: 현재 scheme과 `config.port` 기준의 `localhost`, `127.0.0.1`, `[::1]` origin
- `allowedHosts`: `localhost`, `127.0.0.1`, `::1`
- scheme은 `config.ssl.enabled=true`이면 `https`, 그 외에는 `http`로 계산한다.
- `config.host`가 특정 hostname/IP로 명시되어 있고 wildcard address가 아니면 해당 host도 기본 Host/Origin 후보에 포함한다.
- `config.host`가 `0.0.0.0`, `::`, `[::]`이면 network wildcard address이므로 기본 allowlist에 그대로 넣지 않는다. 원격 직접 접속 운영자는 실제 접속 hostname/IP를 명시적으로 allowlist에 추가한다.

---

## 4. 시스템 요구사항

### SYS-MCP-PROTO-001: initialized notification 수락

The system shall accept `notifications/initialized` JSON-RPC notifications on `POST /mcp`.

**Acceptance Criteria**

- `id` 없는 `notifications/initialized` notification은 HTTP `202 Accepted`를 반환한다.
- response body는 empty body이다.
- `Method not found` JSON-RPC error를 반환하지 않는다.

**Verification**

- `node test/mcp/streamable-http.test.js`

### SYS-MCP-SEC-001: Origin validation 수행

The system shall perform Origin handling for every HTTP request to the MCP endpoint.

**Acceptance Criteria**

- `Origin` header가 있는 요청은 `mcp.allowedOrigins`와 비교된다.
- Origin comparison은 lower-case로 정규화한 full origin 문자열(`scheme://host[:port]`) exact match이다.
- `Origin: null`, malformed Origin, empty Origin은 허용되지 않은 Origin으로 처리한다.
- 허용되지 않은 Origin은 JSON-RPC method dispatch 전에 차단된다.
- 허용되지 않은 Origin은 HTTP `403 Forbidden`을 반환한다.
- deterministic error code는 `FORBIDDEN_ORIGIN`이다.

**Verification**

- invalid Origin negative test
- allowed Origin positive test

### SYS-MCP-SEC-002: Origin 없는 요청 호환성

The system shall not reject MCP requests solely because the `Origin` header is absent.

**Acceptance Criteria**

- `Origin` header가 없는 `initialize` 요청은 protocol/auth 조건만 만족하면 처리된다.
- `Origin` header가 없는 `tools/list` 요청은 protocol/auth 조건만 만족하면 처리된다.
- 문서는 Origin 없는 요청이 browser-origin 검증 대상이 아니며 별도 access control이 필요하다고 설명한다.

**Verification**

- Origin-less request compatibility test
- README/MCP documentation review

### SYS-MCP-SEC-003: Host validation 수행

The system shall validate the HTTP `Host` header for MCP endpoint requests.

**Acceptance Criteria**

- `Host` header는 `mcp.allowedHosts`와 비교된다.
- Host comparison은 lower-case hostname과 optional port를 정규화한 뒤 수행한다.
- `allowedHosts` 항목이 hostname/IP만 포함하면 같은 hostname/IP의 모든 port를 허용한다.
- `allowedHosts` 항목이 `host:port` 또는 `[ipv6]:port`이면 host와 port가 모두 일치해야 한다.
- IPv6 localhost는 `::1` 또는 `[::1]`로 정규화해 비교한다.
- missing, empty, malformed Host는 wildcard 여부와 관계없이 허용되지 않은 Host로 처리한다.
- 허용되지 않은 Host는 JSON-RPC method dispatch 전에 차단된다.
- 허용되지 않은 Host는 HTTP `403 Forbidden`을 반환한다.
- deterministic error code는 `FORBIDDEN_HOST`이다.
- Origin은 허용되지만 Host가 허용되지 않은 요청은 차단된다.

**Verification**

- allowed Origin + invalid Host negative test
- custom allowed Host positive test

### SYS-MCP-CFG-001: MCP allowlist 설정 정규화

The system shall normalize and validate MCP allowlist configuration during configuration loading.

**Acceptance Criteria**

- `config.mcp`가 없으면 기본값을 생성한다.
- 기본 `allowedOrigins`는 `config.port`와 SSL 설정을 기준으로 `http://localhost:<port>`, `http://127.0.0.1:<port>`, `http://[::1]:<port>` 또는 SSL enabled 시 `https` variant를 포함한다.
- 기본 `allowedHosts`는 `localhost`, `127.0.0.1`, `::1`을 포함한다.
- `config.host`가 `0.0.0.0`, `::`, `[::]`가 아닌 특정 host이면 그 host의 Origin/Host도 기본 후보에 포함한다.
- `allowedOrigins`는 문자열 배열이어야 한다.
- `allowedHosts`는 문자열 배열이어야 한다.
- `allowedOrigins` 값은 full origin 형식(`scheme://host[:port]`)이어야 한다. wildcard `*`는 예외로 허용한다.
- runtime Origin header 값도 canonical origin이어야 하며 path/query/hash/userinfo를 포함하면 invalid로 처리한다.
- `allowedHosts` 값은 hostname, IP literal, `host:port`, `[ipv6]:port` 형식이어야 한다. wildcard `*`는 예외로 허용한다.
- runtime Host header 값은 missing/empty/malformed, invalid DNS label, invalid port range를 허용하지 않는다.
- 배열이 아닌 잘못된 타입이나 invalid allowlist entry는 fallback 없이 startup validation error로 처리한다.
- validation error message에는 실패한 config key를 포함한다.

**Verification**

- config loader unit/integration test
- invalid config startup failure test

### SYS-MCP-CFG-002: wildcard insecure opt-out 경고

The system shall warn when wildcard `["*"]` disables MCP Origin or Host protection.

**Acceptance Criteria**

- `allowedOrigins: ["*"]`는 임의 Origin을 허용한다.
- `allowedHosts: ["*"]`는 임의 Host를 허용한다.
- wildcard는 malformed Origin/Host를 허용하지 않는다.
- wildcard 사용 시 startup warning을 남긴다.
- wildcard와 구체 allowlist가 혼용되면 wildcard가 우선하며 warning을 남긴다.
- 문서는 wildcard가 DNS rebinding 방어를 비활성화한다고 설명한다.

**Verification**

- wildcard behavior test
- startup warning test 또는 logger spy
- documentation review

### SYS-MCP-BIND-001: 기본 bind address

The system shall use `127.0.0.1` as the default bind address when no explicit host is configured.

**Acceptance Criteria**

- `config.host`와 `HOST` 환경변수가 모두 없으면 server listen host는 `127.0.0.1`이다.
- 원격 직접 접속이 필요한 경우 운영자가 `host: "0.0.0.0"` 또는 특정 IP를 명시한다.
- 문서는 localhost bind 권장과 `0.0.0.0` 노출 위험을 설명한다.

**Verification**

- app startup test 또는 code review
- documentation review

### SYS-MCP-DOC-001: handshake 예제 완전성

Documentation examples shall show the MCP startup handshake order.

**Acceptance Criteria**

- 예제는 `initialize` 다음 `notifications/initialized`를 보여준다.
- 이후 `tools/list` 또는 `tools/call`을 보여준다.
- `Accept: application/json, text/event-stream` 사용을 보여준다.
- post-initialize request에는 `MCP-Protocol-Version: 2025-11-25`를 포함한다.

**Verification**

- README/MCP documentation review

### SYS-MCP-OPS-001: reverse proxy 운영 문서

Documentation shall specify reverse proxy requirements for MCP Origin/Host allowlists.

**Acceptance Criteria**

- public domain 배포에서는 `mcp.allowedOrigins`에 브라우저 주소창의 origin을 넣는다고 설명한다.
- public domain 배포에서는 `mcp.allowedHosts`에 HTTP `Host` header로 들어올 값을 넣는다고 설명한다.
- nginx 등 reverse proxy는 `proxy_set_header Host $host;` 또는 동등한 설정으로 public Host header를 보존해야 한다고 설명한다.
- `X-Forwarded-Host`는 trusted proxy 설계 전까지 신뢰하지 않는다고 설명한다.

**Verification**

- README/MCP documentation review

---

## 5. Traceability

| 요구사항 | 출처 | 검증 |
| --- | --- | --- |
| SYS-MCP-PROTO-001 | GitHub issue #1, MCP lifecycle | streamable-http test |
| SYS-MCP-SEC-001 | MCP transport security warning, PR #2 review | Origin negative test |
| SYS-MCP-SEC-002 | Codex/curl MCP client compatibility | Origin-less compatibility test |
| SYS-MCP-SEC-003 | DNS rebinding hardening decision | Host negative/positive tests |
| SYS-MCP-CFG-001 | System architect review | config loader test |
| SYS-MCP-CFG-002 | PO/QA wildcard policy | wildcard behavior/warning test |
| SYS-MCP-BIND-001 | MCP transport SHOULD local bind | startup/default host verification |
| SYS-MCP-DOC-001 | PR #2 review | docs review |
| SYS-MCP-OPS-001 | PO/System architect review | docs review |

---

## 6. Merge 전 최소 보강 항목

1. `config-loader`에서 `config.mcp` 정규화/검증 구현
2. `src/app.js` 기본 bind address를 `127.0.0.1`로 변경
3. `/mcp` Origin validation에서 invalid Origin을 `403`으로 차단
4. `/mcp` Host validation을 모든 요청에 적용
5. wildcard `["*"]` 사용 시 warning
6. 테스트 추가:
   - Origin 없음 허용
   - Origin 없음 + invalid Host 차단
   - default localhost Origin/Host 허용
   - invalid Origin 403
   - invalid Host 403
   - custom allowed Origin/Host 허용
   - wildcard Origin/Host 허용 및 warning
   - invalid config type deterministic failure
   - default bind `127.0.0.1`
   - malformed Origin/Host 차단
7. README/MCP 문서에 public read mode, wildcard, localhost bind, reverse proxy Host 보존 설명 추가

---

## 7. 보류 항목

- `MCP-Session-Id` 기반 lifecycle gate
- SSE stream 및 resumability
- `DELETE /mcp` session 종료
- MCP 전용 `mcp.requireReadAuth`
- `X-Forwarded-Host`/trusted proxy 지원
