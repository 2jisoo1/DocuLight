# Phase 9 검증 보고서

## 완료 체크리스트

### 9.1 config-loader.js 마이그레이션 로직
- [ ] 서버 시작 시 `apiKey`/`apiKeys` 존재 확인 -> 콘솔 경고
- [ ] `validateApiKeys()` 호출 조건 변경 (users.json 존재 시 스킵)
- [ ] `admin.sessionTimeout` 마이그레이션 (auth-settings.json 미존재 시 이관)
- [ ] 검증: 기존 config.json5 그대로 사용 시 서버 시작 + 경고 출력

### 9.2 Setup Wizard 마이그레이션 경로
- [ ] "기존 API Key로 마이그레이션" 옵션 추가
- [ ] API Key 일치 확인 -> 슈퍼유저 생성
- [ ] apiKeys `delete` 권한 -> `write` 자동 매핑
- [ ] 마이그레이션 완료 로그 기록
- [ ] 검증: 기존 API Key 입력 -> 슈퍼유저 생성 성공

### 9.3 기존 폐기 엔드포인트 최종 정리
- [ ] `POST /api/admin/auth` -> 410 + 안내
- [ ] `POST /api/admin/logout` -> 410 + 안내
- [ ] `GET /api/admin/session` -> 410 + 안내
- [ ] `POST /api/admin/session/refresh` -> 410 + 안내
- [ ] 검증: 폐기 엔드포인트 호출 시 안내 메시지

### 9.4 CLI 패스워드 리셋 도구
- [ ] `scripts/reset-admin.js` 생성
- [ ] 사용법: `node scripts/reset-admin.js --email <email> --password <password>`
- [ ] 처리: config 읽기 -> 사용자 조회 -> 슈퍼유저 확인 -> 패스워드 리셋
- [ ] 에러 처리: 인자 누락, 사용자 미존재, data 없음, 슈퍼유저 아님
- [ ] 검증: 패스워드 리셋 후 새 패스워드로 로그인 성공

### 9.5 비밀번호 분실 안내 UI
- [ ] `login.ejs`에 "비밀번호를 잊으셨나요?" 링크 추가
- [ ] 클릭 시 안내 텍스트 표시
- [ ] 검증: 링크 클릭 -> 안내 텍스트 표시

### 9.6 config.example.json5 최종 업데이트
- [ ] `apiKey`, `apiKeys` 섹션에 `[DEPRECATED]` 주석 추가
- [ ] `dataDir`, `email` 설정 예시 추가
- [ ] `admin.sessionTimeout` -> `auth-settings.json으로 이동` 주석
- [ ] 검증: 새 config.example.json5로 서버 시작 가능

### 9.7 package.json scripts 추가
- [ ] `"reset-admin": "node scripts/reset-admin.js"` 스크립트 추가
- [ ] 검증: `npm run reset-admin -- --email <email> --password <password>` 동작

## 테스트 결과

| 테스트 | 유형 | 결과 | 비고 |
|--------|------|------|------|
| 기존 config.json5 (apiKey 있음, users.json 없음) -> 경고 + Setup Wizard | 정상 | [ ] | - |
| CLI 리셋 도구로 패스워드 변경 -> 새 패스워드 로그인 성공 | 정상 | [ ] | - |
| users.json 없는 상태에서 CLI 리셋 -> "Setup 미완료" 에러 | 예외 | [ ] | - |
| Editor 이메일로 CLI 리셋 -> "슈퍼유저만 리셋 가능" 에러 | 예외 | [ ] | - |
| apiKeys에 `permissions: ["read", "write", "delete"]` -> delete를 write로 매핑 | 경계 | [ ] | - |

## 품질 평가

| 기준 | 등급 | 비고 |
|------|------|------|
| 스펙-코드 정합성 | - | - |
| 테스트 커버리지 | - | - |
| 에러 처리 | - | - |
| 코드 가독성 | - | - |

## 회귀 테스트

| 항목 | 결과 |
|------|------|
| 기존 config.json5 (apiKey 있음)로 서버 시작 정상 | [ ] |
| 새 config.json5 (apiKey 없음, dataDir 있음)로 서버 시작 정상 | [ ] |
| 모든 이전 Phase 기능 정상 동작 | [ ] |
| CLI 도구가 서버 실행 중에도 안전하게 동작 (파일 락 고려) | [ ] |

## 이슈

| # | 이슈 | 심각도 | 해결 |
|---|------|--------|------|
| - | - | - | - |
