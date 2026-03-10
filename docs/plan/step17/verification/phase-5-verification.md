# Phase 5 검증 보고서

## 완료 체크리스트

### 5.1 인증 설정 API
- [ ] `src/controllers/admin/admin-auth-settings-controller.js` 생성
- [ ] `GET /api/admin/auth-settings` -- 현재 인증 설정 조회 (슈퍼유저 전용)
- [ ] `PUT /api/admin/auth-settings` -- 인증 설정 변경 (슈퍼유저 전용)
- [ ] 검증 로직: `sessionTimeout` >= 60000ms, `allowedEmailDomains` 문자열 배열
- [ ] `admin-api.js`에 라우트 등록
- [ ] 검증: 설정 조회 + 변경 + 즉시 반영

### 5.2 설정 변경 즉시 반영 메커니즘
- [ ] `AuthSettingsStore`의 `update()` 호출 시 in-memory 캐시 갱신
- [ ] 미들웨어에서 `AuthSettingsStore.get()`으로 매 요청마다 현재 설정 읽기
- [ ] `requireReadLogin` 변경 시 다음 요청부터 즉시 적용
- [ ] `sessionTimeout` 변경 시 새 세션부터 적용
- [ ] 검증: 설정 변경 후 다음 요청에서 즉시 반영

### 5.3 Admin UI -- 인증 설정 탭
- [ ] 읽기 로그인 (requireReadLogin): 토글 스위치
- [ ] 세션 타임아웃 (sessionTimeout): 숫자 입력 (분 단위 UI, ms 변환)
- [ ] 가입 요청 허용 (allowSignup): 토글 스위치
- [ ] 허용 이메일 도메인 (allowedEmailDomains): 태그 입력
- [ ] "저장" 버튼 + 성공/실패 토스트 메시지
- [ ] 검증: 각 설정 항목 변경 + 저장 + 즉시 반영

## 테스트 결과

| 테스트 | 유형 | 결과 | 비고 |
|--------|------|------|------|
| requireReadLogin false -> true 변경 후 미인증 GET /api/tree -> 401 | 정상 | [ ] | - |
| sessionTimeout 30분 변경 후 새 세션 만료 시간 30분 설정 | 정상 | [ ] | - |
| sessionTimeout에 0 입력 -> 400 `INVALID_SETTING_VALUE` | 예외 | [ ] | - |
| Editor 사용자로 GET /api/admin/auth-settings -> 403 | 예외 | [ ] | - |
| allowedEmailDomains에 빈 문자열 포함 -> 필터링 또는 400 | 경계 | [ ] | - |

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
| requireReadLogin 변경이 기존 읽기 API에 즉시 반영 | [ ] |
| sessionTimeout 변경이 기존 활성 세션에 영향 없음 | [ ] |
| 기존 admin 파일 관리 기능 정상 동작 | [ ] |

## 이슈

| # | 이슈 | 심각도 | 해결 |
|---|------|--------|------|
| - | - | - | - |
