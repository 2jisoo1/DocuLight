# Phase 1 검증: 인프라 (config + activity-logger)

## 완료 체크리스트

| # | 항목 | 상태 | 검증 방법 |
|---|------|:----:|----------|
| 1.1 | config-loader signupMode 정규화 | ☐ | 서버 시작 후 설정 값 확인 |
| 1.2 | auth-settings-store 새 필드 읽기/쓰기 | ☐ | API 호출로 get/update 확인 |
| 1.3 | config.example.json5 업데이트 | ☐ | JSON5 파싱 테스트 |
| 1.4 | activity-logger.js 모듈 생성 | ☐ | 단위 호출 테스트 |
| 1.5 | app.js에서 activity-logger 초기화 | ☐ | 서버 시작 시 에러 없음 |

## 테스트 결과

| TC ID | 설명 | 결과 | 비고 |
|-------|------|:----:|------|
| TC-1-01 | signupMode 정상 로딩 | ☐ | |
| TC-1-02 | activity-logger 로그 기록 | ☐ | |
| TC-1-03 | signupMode 유효하지 않은 값 폴백 | ☐ | |
| TC-1-04 | selfSignup 미설정 기본값 | ☐ | |
| TC-1-05 | logger 미초기화 시 무시 | ☐ | |

## 회귀 테스트

- [ ] 기존 서버 시작 정상
- [ ] 기존 auth settings API 응답 구조 유지
- [ ] 기존 request-logger 로그 출력 변경 없음
- [ ] config.example.json5 JSON5 파싱 가능

## 이슈

| # | 설명 | 심각도 | 상태 |
|---|------|--------|------|
| - | - | - | - |
