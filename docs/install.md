# DocLight 설치 가이드

## 지원 플랫폼

| 플랫폼 | 아키텍처 | better-sqlite3 prebuilt | 비고 |
|--------|----------|-------------------------|------|
| Windows | x64 | ✅ 자동 | npm install 즉시 사용 |
| Linux (glibc) | x64 | ✅ 자동 | Ubuntu, Debian, RHEL, CentOS 등 |
| macOS | x64 | ✅ 자동 | Intel Mac |
| macOS | arm64 (M1/M2) | ⚠️ 소스 빌드 필요 | 아래 안내 참조 |
| Linux (musl) | x64/arm64 | ⚠️ 소스 빌드 또는 JSON fallback | Alpine, Docker alpine 이미지 |
| Linux | arm64 | ⚠️ 소스 빌드 또는 JSON fallback | AWS Graviton, Raspberry Pi 등 |

## 표준 설치 (지원 플랫폼)

```bash
npm install
npm start
```

## arm64 / musl 환경 설치

Docker alpine, AWS Graviton, Apple Silicon(arm64), Raspberry Pi 등 비표준 환경에서는
`better-sqlite3` prebuilt 바이너리가 제공되지 않습니다.

### 방법 A: 소스 빌드 (권장)

빌드 도구(Python 3, make, gcc/clang)가 필요합니다.

**Ubuntu arm64 / Debian arm64:**
```bash
sudo apt-get update && sudo apt-get install -y python3 make g++
npm install
```

**Alpine Linux (musl):**
```bash
apk add --no-cache python3 make g++
npm install
```

**macOS arm64 (Apple Silicon):**
```bash
# Xcode Command Line Tools 필요
xcode-select --install
npm install
```

**Docker (Alpine 기반):**
```dockerfile
FROM node:20-alpine
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
CMD ["node", "src/app.js"]
```

### 방법 B: JSON Lines fallback (자동)

소스 빌드가 불가한 환경에서는 `better-sqlite3` 로드 실패 시
피드백 저장소가 자동으로 `data/feedback.jsonl` (JSON Lines 파일) 로 전환됩니다.
애플리케이션 재시작 없이 투명하게 동작하며, winston `warn` 로그로 전환 사실이 기록됩니다.

> **주의**: JSON fallback은 동시 쓰기 시 파일 잠금이 없어 고부하 환경에서 레코드 유실 가능성이 있습니다.
> 가능하면 소스 빌드(방법 A)를 권장합니다.

## CI / GitHub Actions

본 프로젝트의 CI(`agent-ci.yml`)는 공식 지원 3종 매트릭스로 실행됩니다.
arm64 / alpine 빌드는 PR 차단 없는 선택적 matrix로 추가되어 있습니다.

| 매트릭스 항목 | runs-on | PR 차단 |
|--------------|---------|---------|
| ubuntu-latest (linux-x64-glibc) | ubuntu-latest | ✅ 차단 |
| windows-latest (win32-x64) | windows-latest | ✅ 차단 |
| macos-latest (darwin-x64) | macos-latest | ✅ 차단 |
| linux-arm64 (선택적) | ubuntu-24.04-arm | ❌ 차단 안 함 |
| linux-alpine/musl (선택적) | ubuntu-latest + Docker alpine | ❌ 차단 안 함 |
