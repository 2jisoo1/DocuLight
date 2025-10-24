# DocLight

경량 Markdown 문서 뷰어 및 관리 시스템

## 개요

DocLight는 Markdown 문서를 탐색, 열람, 관리하기 위한 경량 웹 서버입니다.
Node.js + Express + EJS 기반으로 구축되었으며, 브라우저에서 디렉터리 트리 탐색과 문서 렌더링을 제공합니다.

## 주요 기능

- 📁 **파일 트리 탐색**: Obsidian과 유사한 좌측 트리 UI
- 📄 **Markdown 렌더링**: GitHub 스타일 마크다운 렌더링
- 📊 **다이어그램 지원**: Mermaid.js를 통한 다이어그램 렌더링
- 🔒 **보안**: API 키 기반 인증, 경로 검증, XSS 방지
- 💾 **상태 유지**: IndexedDB를 통한 트리 상태 저장
- 📤 **파일 관리**: 업로드, 다운로드, 삭제 기능

## 시스템 요구사항

- Node.js 18 이상
- 최신 브라우저 (Chrome, Edge, Firefox)

## 설치 및 실행

### 1. 의존성 설치

```bash
npm install
```

### 2. 설정 파일 생성

```bash
cp config.example.json5 config.json5
```

### 3. 설정 파일 수정

`config.json5` 파일을 열어 다음 항목들을 설정합니다:

```json5
{
  // 문서 루트 디렉터리 (절대 경로 권장)
  docsRoot: "/path/to/your/documents",

  // API 인증 키 (반드시 변경하세요!)
  apiKey: "your-secure-api-key-here",

  // 최대 업로드 파일 크기 (MB)
  maxUploadMB: 10,

  // 서버 포트
  port: 3000,

  // 제외할 파일/디렉터리 패턴
  excludes: [
    "**/.git/",
    "**/.DS_Store",
    "**/node_modules/",
    "*.tmp"
  ],

  // 로그 디렉터리
  logDir: "./logs",

  // 로그 레벨
  logLevel: "info"
}
```

### 4. 문서 루트 디렉터리 생성

설정 파일에서 지정한 `docsRoot` 디렉터리가 존재하는지 확인하거나 생성합니다:

```bash
mkdir -p /path/to/your/documents
```

### 5. 서버 실행

#### 개발 모드 (nodemon 사용)
```bash
npm run dev
```

#### 프로덕션 모드
```bash
npm start
```

서버가 시작되면 브라우저에서 `http://localhost:3000`에 접속합니다.

## 프로젝트 구조

```
DocLight/
├── src/
│   ├── app.js                 # 메인 애플리케이션
│   ├── controllers/           # 비즈니스 로직
│   │   ├── tree-controller.js
│   │   ├── raw-controller.js
│   │   ├── upload-controller.js
│   │   ├── delete-controller.js
│   │   └── download-controller.js
│   ├── middleware/            # 미들웨어
│   │   ├── auth.js
│   │   ├── error-handler.js
│   │   └── request-logger.js
│   ├── routes/                # 라우터
│   │   └── api.js
│   ├── utils/                 # 유틸리티
│   │   ├── config-loader.js
│   │   ├── logger.js
│   │   ├── path-validator.js
│   │   └── lock-manager.js
│   └── views/                 # EJS 템플릿
│       └── index.ejs
├── public/                    # 정적 리소스
│   ├── css/
│   │   └── style.css
│   └── js/
│       └── app.js
├── docs/                      # 문서
│   ├── srs.md
│   └── sds.md
├── logs/                      # 로그 파일 (자동 생성)
├── config.example.json5       # 설정 파일 템플릿
├── package.json
└── README.md
```

## API 엔드포인트

### 공개 API (인증 불필요)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/tree?path=<path>` | 디렉터리 트리 조회 |
| GET | `/api/raw?path=<file>` | Markdown 원문 조회 |
| GET | `/healthz` | 헬스체크 |

### 보호된 API (X-API-Key 헤더 필요)

| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/upload?path=<dir>` | 파일 업로드 |
| DELETE | `/api/entry?path=<path>` | 파일/디렉터리 삭제 |
| GET | `/api/download/file?path=<file>` | 파일 다운로드 |
| GET | `/api/download/dir?path=<dir>` | 디렉터리 ZIP 다운로드 |

### 인증 예시

```bash
curl -H "X-API-Key: your-api-key" \
  -X DELETE \
  "http://localhost:3000/api/entry?path=/test.md"
```

## 보안

- **API 키 인증**: 쓰기/삭제/다운로드 작업에 API 키 필요 (X-API-Key 헤더)
- **경로 검증**: 루트 디렉터리 외부 접근 차단
- **XSS 방지**: DOMPurify를 통한 HTML sanitization
- **제외 규칙**: 민감한 파일/디렉터리 필터링
- **IP 화이트리스트**: 허용된 IP 대역만 접근 가능 (선택적)
- **SSL/TLS 지원**: HTTPS 암호화 통신 (선택적)

## 로그

로그 파일은 `logs/` 디렉터리에 일자별로 저장됩니다:

```
logs/
├── doclight-20251023.log
├── doclight-20251024.log
└── ...
```

로그 레벨: `error`, `warn`, `info`, `debug`

## 운영

### PM2로 실행 (권장)

```bash
npm install -g pm2
pm2 start src/app.js --name doclight
pm2 save
pm2 startup
```

### 로그 확인

```bash
pm2 logs doclight
```

### 서버 재시작

```bash
pm2 restart doclight
```

## Config Hot-Reload (운영 가이드)

DocLight는 `config.json5` 변경 시 안전하게 설정을 반영하기 위한 Hot-Reload 기능을 제공합니다. 운영 환경에서 아래 절차와 도구를 사용하세요.

1. 변경 전: `git diff config.json5`로 변경 내용 검토.
2. 변경 적용: 파일을 저장하면 내부 감시자가 변경을 감지하고 검증 후 `app.restart()`를 시도합니다.
3. 모니터링: 로그(`logs/`)와 `server:restart` 이벤트를 확인합니다.
4. 문제 발생 시: 백업(`config.json5.bak`)으로 복원하고 수동으로 서버를 시작합니다.

유용한 명령 및 스크립트

```powershell
# 감사 스크립트: 코드베이스에서 모듈-레벨 config 캡처 패턴 검토
node scripts/audit-config-capture.js

# 통합 테스트(개발용)
node test/test-start-stop.js
node test/test-watcher-restart.js
```

개발자 규칙

- 모듈 로드 시점에서 `loadConfig()` 호출로 구성을 캡처하지 마세요. 대신 런타임에서 `req.app.locals.config`를 읽도록 코드를 작성하세요.
- 중요한 변경(포트, SSL)은 자동 재시작으로 인해 연결이 끊어질 수 있으므로 배포 전략을 사용하세요.


## 개발

### 개발 환경 실행

```bash
npm run dev
```

Nodemon이 파일 변경을 감지하여 자동으로 서버를 재시작합니다.

## 고급 기능

### IP 화이트리스트

특정 IP 대역만 서버에 접근하도록 제한:

```json5
// config.json5
{
  security: {
    allows: [
      "127.0.0.1",        // 정확한 IP
      "10.0.1.*",         // 와일드카드: 10.0.1.0-255
      "10.0.100-200.*",   // 범위: 10.0.100.0-255 ~ 10.0.200.0-255
      "192.168.1.0/24"    // CIDR 표기법
    ]
  }
}
```

### SSL/TLS (HTTPS)

HTTPS로 서버 실행:

```json5
// config.json5
{
  ssl: {
    enabled: true,
    cert: "/path/to/cert.pem",
    key: "/path/to/key.pem",
    ca: "/path/to/ca.pem"  // 선택적
  }
}
```

테스트용 자체 서명 인증서 생성:
```bash
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes
```

### MCP 서버

Claude Desktop과 통합하여 문서를 관리할 수 있습니다.
자세한 내용은 `doclight-mcp-server/README.md`를 참조하세요.

## 라이선스

ISC

## 참고 문서

- [SRS (Software Requirements Specification)](docs/plan/srs.md)
- [SDS (System Design Specification)](docs/plan/sds.md)
- [MCP Server Documentation](doclight-mcp-server/README.md)
