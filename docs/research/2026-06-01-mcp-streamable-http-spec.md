# MCP Streamable HTTP 최신 스펙 연구

## 메타데이터

- 연구 일자: 2026-06-01
- 연구 대상: Model Context Protocol 2025-11-25 Streamable HTTP transport
- 주요 출처:
  - https://modelcontextprotocol.io/specification/2025-11-25/basic/transports
  - https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle
  - https://modelcontextprotocol.io/specification/2025-11-25/changelog
  - https://modelcontextprotocol.io/specification/2025-06-18/changelog
  - https://modelcontextprotocol.io/specification/2025-03-26/changelog

## 결론

최신 MCP HTTP transport의 표준 명칭은 Streamable HTTP이다. 2025-03-26 스펙에서 기존 2024-11-05의 HTTP+SSE transport가 Streamable HTTP로 대체되었고, 2025-11-25 스펙에서도 표준 transport는 `stdio`와 `Streamable HTTP` 두 가지로 설명된다.

Streamable HTTP는 "모든 응답을 반드시 SSE로 스트리밍한다"는 의미가 아니다. 클라이언트가 JSON-RPC request를 `POST`로 보냈을 때 서버는 단일 JSON 응답(`application/json`)을 반환할 수도 있고, 여러 MCP 메시지를 전달해야 하는 경우 SSE 응답(`text/event-stream`)을 열 수도 있다.

## 버전 이력

| 스펙 버전 | 관련 변화 | 근거 |
| --- | --- | --- |
| 2024-11-05 | 이전 HTTP+SSE transport 세대 | 2025-11-25 transports 문서의 backwards compatibility 설명 |
| 2025-03-26 | HTTP+SSE transport를 Streamable HTTP transport로 대체 | 2025-03-26 changelog major changes |
| 2025-06-18 | JSON-RPC batching 지원 제거, HTTP 사용 시 후속 요청에 `MCP-Protocol-Version` 헤더 요구 추가, lifecycle operation의 negotiated version/capability 준수 강도 강화 | 2025-06-18 changelog major changes |
| 2025-11-25 | invalid `Origin` 처리 시 HTTP 403 반환 명확화, polling SSE stream과 resumption 규칙 보강 | 2025-11-25 changelog minor changes |

## 표준 Transport 범위

2025-11-25 기준 MCP는 JSON-RPC 메시지를 사용하며, 표준 transport는 다음 두 가지이다.

| Transport | 용도 | 핵심 특성 |
| --- | --- | --- |
| `stdio` | 로컬 MCP 서버 | 클라이언트가 서버 프로세스를 실행하고 stdin/stdout으로 newline-delimited JSON-RPC 메시지를 교환 |
| `Streamable HTTP` | 독립 실행 서버 및 원격/네트워크 서버 | 단일 MCP endpoint에서 HTTP `POST`와 `GET`을 사용하며, 필요 시 SSE로 여러 서버 메시지를 전송 |

Custom transport도 가능하지만, JSON-RPC 메시지 형식과 MCP lifecycle 요구사항을 보존해야 한다. 자체 연결/메시지 교환 방식은 상호운용성을 위해 문서화하는 것이 좋다.

## Streamable HTTP 핵심 모델

### 단일 MCP Endpoint

서버는 하나의 MCP endpoint path를 제공해야 한다. 예시는 `/mcp` 같은 단일 URL이다. 이 endpoint는 `POST`와 `GET`을 모두 다뤄야 한다.

- `POST`: 클라이언트가 서버로 JSON-RPC request, notification, response를 보내는 경로
- `GET`: 서버가 클라이언트로 독립적인 server-to-client 메시지를 보내기 위한 SSE stream을 여는 경로. 서버가 이 SSE stream을 제공하지 않으면 `405 Method Not Allowed`를 반환해야 한다.

### POST 응답 형태

클라이언트가 JSON-RPC request를 `POST`로 보내면 서버는 둘 중 하나로 응답해야 한다.

| 응답 방식 | Content-Type | 사용 상황 |
| --- | --- | --- |
| 단일 JSON 응답 | `application/json` | 간단한 request/response 처리 |
| SSE stream | `text/event-stream` | 응답 전에 여러 JSON-RPC request/notification/progress를 보내거나 streaming/resumability가 필요한 경우 |

클라이언트가 JSON-RPC notification 또는 response를 `POST`로 보내고 서버가 이를 수락하면, 서버는 HTTP `202 Accepted`와 빈 body를 반환해야 한다.

## Normative 요구사항 요약

### MUST

| 영역 | 요구사항 | 출처 |
| --- | --- | --- |
| Encoding | JSON-RPC 메시지는 UTF-8로 인코딩되어야 한다 | transports |
| Endpoint | Streamable HTTP 서버는 단일 MCP endpoint가 `POST`와 `GET`을 지원해야 한다 | transports |
| POST | 클라이언트의 각 JSON-RPC 메시지는 새 HTTP `POST` 요청으로 전송되어야 한다 | transports |
| POST Accept | 클라이언트는 `Accept`에 `application/json`, `text/event-stream`을 모두 포함해야 한다 | transports |
| POST body | POST body는 단일 JSON-RPC request, notification, response여야 한다 | transports |
| Notification/Response | 서버가 POST된 notification/response를 수락하면 `202 Accepted`와 빈 body를 반환해야 한다 | transports |
| Request response | POST된 request에 대해 서버는 `application/json` 또는 `text/event-stream`으로 응답해야 한다 | transports |
| GET Accept | GET을 보내는 클라이언트는 `Accept: text/event-stream`을 포함해야 한다 | transports |
| GET response | GET에 대해 서버는 SSE stream을 반환하거나 `405 Method Not Allowed`를 반환해야 한다 | transports |
| Origin | Streamable HTTP 서버는 `Origin` 헤더를 검증해야 하며, `Origin` 헤더가 존재하고 invalid이면 HTTP 403으로 거부해야 한다 | transports, 2025-11-25 changelog |
| Version header | HTTP 후속 요청에는 `MCP-Protocol-Version` 헤더가 포함되어야 하며, 서버는 invalid/unsupported version을 `400 Bad Request`로 거부해야 한다 | transports, lifecycle |
| Lifecycle | 초기화는 첫 상호작용이어야 하며, 클라이언트는 `initialize` request를 보내야 한다 | lifecycle |
| Initialize result | 서버는 protocol version, capabilities, serverInfo를 포함해 응답해야 한다 | lifecycle |
| Initialized notification | 성공적인 초기화 후 클라이언트는 `notifications/initialized` notification을 보내야 한다 | lifecycle |
| Version negotiation | 서버가 클라이언트가 요청한 protocol version을 지원하면 같은 version으로 응답해야 한다 | lifecycle |
| Operation | 양측은 협상된 protocol version과 capabilities만 사용해야 한다 | lifecycle |
| SSE uniqueness | 여러 SSE stream이 있을 때 서버는 동일 JSON-RPC 메시지를 여러 stream에 broadcast하면 안 된다 | transports |
| SSE resumption | event id를 사용하는 경우 session 또는 client 범위에서 globally unique해야 한다 | transports |
| Session ID format | 서버가 session id를 발급하면 visible ASCII 문자만 포함해야 한다 | transports |

### SHOULD

| 영역 | 권고사항 | 출처 |
| --- | --- | --- |
| Client stdio | 클라이언트는 가능하면 stdio도 지원하는 것이 좋다 | transports |
| Local bind | 로컬 실행 서버는 `0.0.0.0`보다 `127.0.0.1`에 bind하는 것이 좋다 | transports |
| Authentication | Streamable HTTP 서버는 모든 연결에 적절한 인증을 구현하는 것이 좋다 | transports |
| SSE priming | SSE stream 시작 시 event id와 빈 data field로 reconnect를 준비시키는 것이 좋다 | transports |
| SSE retry | 서버가 stream을 끝내지 않고 연결만 닫는 경우 `retry` field를 보내는 것이 좋다 | transports |
| POST SSE response | POST에서 열린 SSE stream은 결국 원래 JSON-RPC request에 대한 response를 포함하는 것이 좋다 | transports |
| Stream termination | JSON-RPC response를 보낸 뒤 SSE stream을 종료하는 것이 좋다 | transports |
| Cancellation | 연결 끊김을 cancellation으로 해석하지 말고 explicit cancellation notification을 사용하는 것이 좋다 | transports |
| Session id quality | session id는 전역적으로 unique하고 cryptographically secure한 값이 좋다 | transports |
| Missing session id | session id를 요구하는 서버는 초기화 이후 session id가 없는 요청에 `400 Bad Request`를 반환하는 것이 좋다 | transports |
| DELETE | 클라이언트가 특정 session을 더 이상 필요로 하지 않으면 `MCP-Session-Id` 헤더와 함께 HTTP `DELETE`를 보내는 것이 좋다 | transports |
| Timeouts | 구현은 요청 timeout을 설정하고, timeout 시 cancellation notification을 보내는 것이 좋다 | lifecycle |

### MAY

| 영역 | 허용사항 | 출처 |
| --- | --- | --- |
| SSE on POST | 서버는 POST request 처리 중 SSE stream을 열 수 있다 | transports |
| Server messages | POST SSE stream에서 최종 response 전에 server request/notification을 보낼 수 있다 | transports |
| GET SSE | 클라이언트는 server-to-client 메시지를 받기 위해 MCP endpoint에 GET을 열 수 있다 | transports |
| Resumability | 서버는 SSE event id와 `Last-Event-ID`를 이용해 stream을 resumable하게 만들 수 있다 | transports |
| Session ID | 서버는 initialize 응답에 `MCP-Session-Id` header로 session id를 발급할 수 있다 | transports |
| Session termination | 서버는 session을 언제든 종료할 수 있다 | transports |
| DELETE rejection | 서버는 client-initiated session termination을 허용하지 않으면 `405 Method Not Allowed`를 반환할 수 있다 | transports |
| Custom transport | 구현체는 JSON-RPC와 lifecycle 요구사항을 보존하는 custom transport를 둘 수 있다 | transports |

## Lifecycle 요구사항

### 초기화 순서

```text
1. Client -> Server: initialize request
2. Server -> Client: initialize response
3. Client -> Server: notifications/initialized notification
4. Operation phase
5. Transport connection close로 shutdown
```

초기화는 capability negotiation과 protocol version agreement를 위한 단계이며, 정상 operation은 초기화 후 협상된 capability 범위에서만 이뤄져야 한다.

### Initialize Request

클라이언트의 `initialize` request는 다음 정보를 포함해야 한다.

- `protocolVersion`
- client `capabilities`
- `clientInfo`

### Initialize Response

서버의 `initialize` response는 다음 정보를 포함해야 한다.

- `protocolVersion`
- server `capabilities`
- `serverInfo`
- 선택적 `instructions`

서버 capability에는 제공하는 primitive에 따라 `tools`, `resources`, `prompts`, `logging`, `completions`, `tasks`, `experimental` 등이 들어갈 수 있다.

## 최소 구현 체크리스트

아래는 "SSE streaming은 제공하지 않지만 최신 Streamable HTTP transport로 단일 JSON 응답을 제공하는 서버"를 목표로 한 최소 구현 기준이다.

- [ ] 단일 MCP endpoint 예: `/mcp`
- [ ] `POST /mcp`에서 JSON-RPC request 처리
- [ ] `POST /mcp`에서 request 입력에 `Content-Type: application/json` 응답
- [ ] `POST /mcp`에서 notification/response 입력 수락 시 HTTP `202`와 빈 body 응답
- [ ] `GET /mcp` 구현
- [ ] GET SSE를 제공하지 않는 경우 HTTP `405 Method Not Allowed` 응답
- [ ] `initialize` request 처리
- [ ] `notifications/initialized` notification 처리
- [ ] protocol version negotiation 처리
- [ ] 후속 HTTP 요청의 `MCP-Protocol-Version` 검증
- [ ] `Origin` 검증 및 invalid origin에 HTTP `403` 응답
- [ ] JSON-RPC message는 UTF-8 JSON으로 처리
- [ ] 서버 capability는 실제 제공 기능만 선언

## 선택 구현 체크리스트

아래 항목은 Streamable HTTP에서 허용되거나 권장되지만, 모든 서버에 필수는 아니다.

- [ ] POST request에 대해 SSE stream 응답 제공
- [ ] GET request에 대해 server-to-client SSE stream 제공
- [ ] SSE event id 부여
- [ ] `Last-Event-ID` 기반 stream resumption/redelivery
- [ ] `retry` field를 이용한 polling reconnect 조율
- [ ] `MCP-Session-Id` 기반 stateful session 관리
- [ ] `DELETE /mcp` session 종료 처리
- [ ] request timeout 및 cancellation notification 처리
- [ ] progress notification 처리
- [ ] OAuth 기반 authorization framework
- [ ] tasks capability

## 오해 방지

### "Streamable HTTP"는 SSE 필수 구현이 아니다

Streamable HTTP는 POST request에 대해 단일 JSON 응답과 SSE stream 응답을 모두 허용한다. 서버가 간단한 request/response만 제공한다면 POST 응답은 `application/json`으로 충분할 수 있다. 다만 GET은 구현되어야 하며, server-to-client SSE stream을 제공하지 않는다면 `405 Method Not Allowed`를 반환해야 한다.

### `GET /mcp`가 REST 조회 API라는 뜻은 아니다

Streamable HTTP의 GET은 MCP endpoint에서 server-to-client SSE stream을 열기 위한 transport 동작이다. 일반 REST 조회 API와 의미가 다르다.

### HTTP+SSE 호환은 선택이다

2024-11-05 HTTP+SSE transport와의 backwards compatibility를 위해 구형 SSE endpoint와 POST endpoint를 계속 제공할 수 있다. 그러나 최신 표준 HTTP transport 자체는 Streamable HTTP이다.

### Session은 선택이다

서버는 `MCP-Session-Id`를 발급할 수 있지만 반드시 발급해야 하는 것은 아니다. 발급한 경우에는 이후 요청에서 session id를 검증하는 규칙을 따라야 한다. 서버가 session을 종료한 뒤 해당 session id가 포함된 요청을 받으면 `404 Not Found`로 응답해야 하며, 클라이언트는 이 경우 session id 없이 새 `InitializeRequest`를 보내 새 session을 시작해야 한다.

### `MCP-Protocol-Version`에는 fallback 규칙이 있다

HTTP 사용 시 클라이언트는 initialization 이후 후속 요청에 `MCP-Protocol-Version` 헤더를 포함해야 한다. 헤더 값은 initialization에서 협상된 protocol version인 것이 권고된다. 서버가 헤더를 받지 못했고 다른 방식으로 version을 식별할 수 없다면, backwards compatibility를 위해 `2025-03-26`으로 가정하는 것이 권고된다.

### JSON-RPC batching은 최신 기준이 아니다

2025-03-26에서 JSON-RPC batching 지원이 추가되었지만, 2025-06-18에서 제거되었다. 2025-11-25 Streamable HTTP의 POST body는 단일 JSON-RPC request, notification, response로 설명된다.

### Connection close는 cancellation이 아니다

SSE 연결이 끊겨도 해당 request가 자동으로 취소되었다고 해석하면 안 된다. 취소는 explicit cancellation notification으로 표현하는 것이 권고된다.

## 구현 판단 기준

프로젝트가 최신 MCP HTTP transport 준수를 주장하려면 최소한 다음 표현이 정확하다.

- 정확한 표현: "MCP Streamable HTTP transport를 지원한다. 현재는 POST request에 대해 단일 JSON 응답을 반환하며, server-to-client SSE stream은 제공하지 않아 GET에 405를 반환한다."
- 부정확한 표현: "HTTP POST JSON-RPC만 구현했으므로 최신 Streamable HTTP를 지원한다."
- 부정확한 표현: "Streamable HTTP이므로 모든 tool call은 SSE로 스트리밍해야 한다."

## 참고 URL

- MCP 2025-11-25 Transports: https://modelcontextprotocol.io/specification/2025-11-25/basic/transports
- MCP 2025-11-25 Lifecycle: https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle
- MCP 2025-11-25 Changelog: https://modelcontextprotocol.io/specification/2025-11-25/changelog
- MCP 2025-06-18 Changelog: https://modelcontextprotocol.io/specification/2025-06-18/changelog
- MCP 2025-03-26 Changelog: https://modelcontextprotocol.io/specification/2025-03-26/changelog
