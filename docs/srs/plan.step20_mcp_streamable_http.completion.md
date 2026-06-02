# Step 20: MCP Streamable HTTP 초기 상호운용성 전환 완료 기록

## 메타데이터

- **완료일**: 2026-06-01
- **보강 기록일**: 2026-06-02
- **기준 계획**: `docs/srs/plan.step20_mcp_streamable_http.md`
- **범위**: Phase 1-4
- **상태**: 초기 상호운용성 구현 완료. PR #2 보안 대응은 일부 구현되었으나 2026-06-02 최종 보안 요구사항 기준으로는 추가 보강 필요

---

## 1. 구현 요약

### 1.1 `/mcp` transport 동작

- `GET /mcp`는 SSE 미지원 신호로 `405 Method Not Allowed`와 `Allow: POST`를 반환한다.
- `POST /mcp`는 JSON-RPC request, notification, response를 먼저 판별한다.
- JSON-RPC notification/response를 수락하면 `202 Accepted`와 empty body를 반환한다.
- `notifications/initialized` notification을 수락하고 MCP activity log를 남긴다.
- JSON-RPC batch array는 지원하지 않고 Invalid Request로 처리한다.

### 1.2 protocol version 및 header 처리

- `initialize` 응답 protocolVersion을 `2025-11-25`로 갱신했다.
- 지원하지 않는 `initialize.params.protocolVersion`은 서버 지원 version인 `2025-11-25`로 fallback한다.
- `MCP-Protocol-Version` header가 지원하지 않는 version이면 `400 Bad Request`를 반환한다.
- header가 누락된 post-initialize 요청은 compatibility mode로 허용하고 debug/info 레벨로 기록한다.
- `Accept` header는 `application/json` 또는 `*/*`를 허용하고, `text/event-stream` 단독 요청은 `406 Not Acceptable`로 거부한다.

### 1.3 tool dispatch hardening

- handler dispatch는 own property이면서 function인 handler만 허용한다.
- `constructor` 같은 inherited property 이름은 unknown tool로 거부한다.
- 동적 prefix stripping은 advertised prefixed tools인 `get_config`, `search`, `smart_search`에만 적용한다.
- canonical tool name은 prefix stripping보다 먼저 해석하여 `ui.title` prefix collision에서도 `list_documents` 같은 canonical name이 유지된다.
- read/write auth 판정은 raw tool name이 아니라 canonical handler key 기준으로 수행한다.

### 1.4 문서 갱신

- README의 MCP integration 설명을 Streamable HTTP 초기 상호운용성 기준으로 갱신했다.
- `public/mcp-doc.md`의 MCP version, headers, lifecycle 예제, auth 설명, `GET /mcp` 405 설명을 갱신했다.
- `docs/api/doc/ko/api-curl-example.md`의 MCP curl 예제에 `Accept`와 `MCP-Protocol-Version` header를 반영했다.
- `/context`는 최신 MCP Streamable HTTP transport endpoint로 설명하지 않았다.

---

## 2. 변경 파일

| 파일 | 변경 |
|------|------|
| `src/routes/mcp.js` | Streamable HTTP 초기 상호운용성 처리, protocol/header 검증, dispatch hardening |
| `test/mcp/streamable-http.test.js` | transport/header/lifecycle/auth hardening 회귀 테스트 추가 |
| `scripts/run-tests.js` | 기본 test suite에 `test/mcp/streamable-http.test.js` 추가 |
| `README.md` | MCP integration 설명 및 curl 예제 갱신 |
| `public/mcp-doc.md` | MCP API 문서 전반의 version/header/auth/GET 설명 갱신 |
| `docs/mcp/doc/mcp.md` | 영어 MCP 문서의 version/header/auth/GET 설명 갱신 |
| `docs/mcp/doc/ko/mcp.md` | 한국어 MCP 문서를 갱신된 MCP 문서와 동기화 |
| `docs/api/doc/ko/api-curl-example.md` | 한국어 MCP curl 예제 header 및 문서 링크 갱신 |

---

## 3. 검증 결과

Subagent 및 최종 검증에서 다음 명령을 실행했다.

```bash
node test/mcp/streamable-http.test.js
node test/mcp/handler-parity.test.js
npm test
git diff --check
```

- `node test/mcp/streamable-http.test.js`: 통과
- `node test/mcp/handler-parity.test.js`: 통과
- `npm test`: 18 suites, 18 passed, 0 failed
- `git diff --check`: 통과

---

## 4. 후순위 유지 항목

- `MCP-Session-Id` 기반 lifecycle gate는 구현하지 않았다.
- SSE stream, event id, resumability, `DELETE /mcp` session 종료는 구현하지 않았다.

---

## 5. PR #2 보안 리뷰 이후 추가 보강 필요 항목

2026-06-01 완료 기록은 Streamable HTTP 초기 상호운용성 기준이다. 이후 PR #2에서 DNS rebinding과 public read mode 노출 위험이 지적되었고, 1차 review-response commit에서 Origin/Host guard 일부가 추가되었다.

다만 2026-06-02 정책 결정은 더 구체적인 보안 기준을 요구한다. 따라서 현재 PR은 "초기 상호운용성 완료 + 보안 보강 진행 중"으로 보고, 다음 항목을 merge 전 최종 보강 대상으로 둔다.

- `config-loader`에서 `config.mcp.allowedOrigins`와 `config.mcp.allowedHosts`를 정규화/검증한다.
- `/mcp` Origin 처리 절차를 모든 요청에 수행하되, allowlist 판정은 Origin header가 있는 요청에 적용한다.
- `Origin` header가 있고 invalid이면 JSON-RPC dispatch 전에 `403 Forbidden`과 `FORBIDDEN_ORIGIN`을 반환한다.
- `Origin` header가 없는 non-browser MCP client 요청은 Origin 누락만으로 거부하지 않는다.
- HTTP `Host` header는 Origin 유무와 관계없이 항상 `mcp.allowedHosts`와 비교한다.
- invalid Host는 JSON-RPC dispatch 전에 `403 Forbidden`과 `FORBIDDEN_HOST`를 반환한다.
- wildcard `["*"]`는 insecure opt-out으로 허용하되 startup warning과 문서 경고를 제공한다. 단, malformed present Origin과 malformed/missing Host는 wildcard여도 차단한다.
- 기본 bind address를 `127.0.0.1`로 변경한다.
- default allowlist는 localhost 계열 Origin/Host와 `config.port` 기준으로 결정한다.
- Host matching은 hostname/IP 항목은 모든 port 허용, `host:port` 항목은 port까지 exact match한다.
- Origin matching은 canonical origin 문자열 exact match이며 path/query/hash/userinfo가 포함된 Origin header는 invalid로 처리한다.
- public read mode(`auth.requireReadLogin=false`)에서 MCP read tools가 공개 조회될 수 있음을 문서화한다.
- reverse proxy 배포에서 `Host` header 보존을 요구하고, `X-Forwarded-Host`는 trusted proxy 설계 전까지 신뢰하지 않는다고 문서화한다.

상세 요구사항은 `docs/srs/requirements.step20_mcp_streamable_http_security.md`를 기준으로 한다.
