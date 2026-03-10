# Phase 1 검증 보고서

## 완료 체크리스트

### 1.1 의존성 추가
- [ ] `package.json`에 `bcrypt`, `uuid` 추가
- [ ] `npm install bcrypt uuid` 실행
- [ ] 검증: `require('bcrypt')`, `require('uuid')` 정상 로드 확인

### 1.2 config-loader.js 수정
- [ ] `dataDir` 설정 추가 (기본값: `"./data"`)
- [ ] `dataDir` 절대 경로 변환 (`path.resolve`)
- [ ] `dataDir` 디렉토리 자동 생성 (`fs.mkdirSync({ recursive: true })`)
- [ ] `email` 설정 섹션 파싱 (선택적, 미설정 시 null)
- [ ] `config.example.json5`에 `dataDir` 및 `email` 설정 예시 추가
- [ ] 검증: `loadConfig()` 호출 시 `config.dataDir`가 절대 경로로 설정됨

### 1.3 base-json-store.js 구현
- [ ] `src/stores/base-json-store.js` 생성
- [ ] 생성자: `filePath`, 기본 스키마 수신
- [ ] `load()`: 파일 읽기, JSON 파싱, 파일 없으면 기본값 반환, 파싱 실패 시 에러 throw
- [ ] `save(data)`: 원자적 쓰기 (임시 파일 -> rename), `async-lock` 사용
- [ ] `backup()`: 저장 전 `.bak` 파일 생성 (최근 1개)
- [ ] 검증: 파일 없는 상태에서 `load()` -> 기본값 반환. `save()` 후 `load()` -> 저장된 값 반환

### 1.4 group-store.js 구현
- [ ] `src/stores/group-store.js` 생성
- [ ] `initialize()`: groups.json 로드, 없으면 기본 3개 그룹 생성
- [ ] `findAll()`: 전체 그룹 목록 반환
- [ ] `findById(id)`: ID로 그룹 조회
- [ ] `findByName(name)`: 이름으로 그룹 조회
- [ ] `create(groupData)`: 그룹 생성 (UUID, 중복 이름 검사)
- [ ] `update(id, updates)`: 그룹 수정 (시스템 그룹 권한 변경 불가)
- [ ] `delete(id)`: 그룹 삭제 (시스템 그룹 불가, 소속 사용자 0명 검사)
- [ ] `getMemberCount(groupId)`: 소속 사용자 수 반환
- [ ] 검증: CRUD 동작 + 시스템 그룹 보호 + 중복 이름 방지

### 1.5 user-store.js 구현
- [ ] `src/stores/user-store.js` 생성
- [ ] `initialize()`: users.json 로드, 인덱스 구축
- [ ] `getUserCount()`: 전체 사용자 수 반환
- [ ] `findByEmail(email)`: 이메일 인덱스로 O(1) 조회
- [ ] `findByUserKeyHash(hash)`: user-key 해시 인덱스로 O(1) 조회
- [ ] `findById(id)`: ID 인덱스로 O(1) 조회
- [ ] `findAll()`: 전체 사용자 목록 반환 (민감 정보 제외)
- [ ] `create(userData)`: 사용자 생성 (UUID, 이메일 중복 검사, bcrypt 해시, user-key 생성)
- [ ] `update(id, updates)`: 사용자 수정 (인덱스 갱신)
- [ ] `delete(id)`: 사용자 삭제 (인덱스 갱신)
- [ ] `updatePassword(id, newPasswordHash)`: 패스워드 변경
- [ ] `regenerateUserKey(id)`: user-key 재발급
- [ ] `incrementFailedLogin(id)`: 로그인 실패 카운터 증가 + 5회 시 잠금
- [ ] `resetFailedLogin(id)`: 카운터 리셋 + 잠금 해제
- [ ] `updateLastLogin(id)`: 마지막 로그인 시각 갱신
- [ ] `getSuperuserCount()`: 슈퍼유저 그룹 소속 활성 사용자 수
- [ ] 검증: CRUD + 인덱스 일관성 + 마지막 슈퍼유저 보호

### 1.6 auth-settings-store.js 구현
- [ ] `src/stores/auth-settings-store.js` 생성
- [ ] `initialize()`: auth-settings.json 로드, 없으면 기본값 생성
- [ ] `get()`: 현재 설정 반환
- [ ] `update(settings, updatedBy)`: 설정 업데이트 + 저장
- [ ] 기존 `admin.sessionTimeout` 마이그레이션
- [ ] 검증: 기본값 생성 + 업데이트 + 마이그레이션

### 1.7 registration-store.js 구현
- [ ] `src/stores/registration-store.js` 생성
- [ ] `initialize()`: pending-registrations.json 로드
- [ ] `create(registrationData)`: 가입 요청 생성
- [ ] `findByToken(token)`: 인증 토큰으로 조회
- [ ] `findByEmail(email)`: 이메일로 조회
- [ ] `findPendingApproval()`: 승인 대기 목록 반환
- [ ] `updateStatus(id, status, additionalData)`: 상태 변경
- [ ] `cleanup()`: 만료된 레코드 정리
- [ ] 검증: 생성/상태변경/정리 동작

## 테스트 결과

| 테스트 | 유형 | 결과 | 비고 |
|--------|------|------|------|
| data 디렉토리 비어있는 상태에서 `UserStore.initialize()` 후 `getUserCount()` = 0 | 정상 | [ ] | - |
| 사용자 1명 생성 후 `findByEmail("admin@test.com")` 반환 | 정상 | [ ] | - |
| users.json 손상 시 `UserStore.initialize()` 파싱 에러 throw | 예외 | [ ] | - |
| 동일 이메일로 `UserStore.create()` 시 `EMAIL_DUPLICATE` 에러 | 예외 | [ ] | - |
| 사용자 1,000명 상태에서 `findByUserKeyHash(hash)` O(1) 조회 | 경계 | [ ] | - |

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
| 기존 서버 시작이 정상 동작 (config-loader 변경 영향) | [ ] |
| 기존 API Key 인증이 아직 동작 (이 Phase에서는 변경하지 않음) | [ ] |
| 기존 admin 세션 기능이 정상 동작 | [ ] |
| data 디렉토리 자동 생성 확인 | [ ] |

## 이슈

| # | 이슈 | 심각도 | 해결 |
|---|------|--------|------|
| - | - | - | - |
