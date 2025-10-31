# Step 11: 코드 리팩토링 및 아키텍처 개선 계획

## 📋 개요

**목표**: DocuLight 프로젝트의 코드 품질 향상, 중복 제거, 아키텍처 개선
**담당**: 리팩토링 TF팀
**예상 기간**: 3-5일
**우선순위**: P1 (기술 부채 해소)

---

## 🔍 분석 결과 요약

### 1. 사용되지 않는 파일 (Unused Files)

#### 📁 trash/ 디렉토리 (16개 파일)
**문제**: 개발 과정에서 생성된 테스트 파일들이 정리되지 않고 방치됨

**영향도**: 🟡 중간
- 실행 시간에는 영향 없음
- 프로젝트 크기 증가 (불필요한 파일 용량)
- 개발자 혼란 유발 (어떤 파일이 실제 사용되는지 불명확)
- 검색 결과 오염

**파일 목록**:
```
trash/check-headers.js
trash/test-add-debug-logs.js
trash/test-auto-load-final.js
trash/test-auto-load-fixed.js
trash/test-browser.js
trash/test-console-errors.js
trash/test-copy-button.js
trash/test-header-heights.js
trash/test-highlighting-detailed.js
trash/test-highlighting.js
trash/test-indexeddb-check.js
trash/test-marked-config.js
trash/test-syntax-highlighting.js
trash/test_auto_load.js
trash/test_auto_load_detailed.js
trash/test_auto_load_with_logs.js
```

**검증**:
- ✅ 어디에서도 require되지 않음 확인 완료
- ✅ package.json의 scripts에 없음 확인 완료

---

### 2. 사용되지 않는 import (Unused Imports)

#### src/routes/mcp.js:2
```javascript
const authMiddleware = require('../middleware/auth');
```

**문제**: import되었으나 사용되지 않음

**설명**:
- mcp.js는 자체적으로 validateApiKey 함수를 구현하여 인증 처리
- authMiddleware는 REST API(api.js)에서만 사용
- MCP는 JSON-RPC 2.0 프로토콜이라 middleware 패턴 불필요

**영향도**: 🟢 낮음
- 런타임 성능에 미미한 영향
- 코드 가독성 저하

---

### 3. 중복 코드 (Code Duplication)

#### 🔴 심각한 중복: REST Controller vs api-ctrl.js

**문제**: 동일한 비즈니스 로직이 두 곳에 구현됨
- **REST API**: 개별 controller 파일 사용 (tree-controller.js, raw-controller.js 등)
- **MCP API**: api-ctrl.js의 공통 함수 사용

**영향도**: 🔴 높음
- 버그 수정 시 두 곳 모두 수정 필요 (불일치 위험)
- 유지보수 비용 2배
- 코드 일관성 저하
- 테스트 복잡도 증가

#### 중복 상세 분석

##### 1) Tree 조회 로직
**파일**:
- `src/controllers/tree-controller.js::getTree()` (82줄)
- `src/routes/api-ctrl.js::getTreeData()` (80줄)

**중복률**: ~95% (거의 동일)
**차이점**:
- tree-controller: Express req/res 처리
- api-ctrl: 순수 함수 (config, logger 직접 전달)

**코드 비교**:
```javascript
// tree-controller.js
async function getTree(req, res, next) {
  const { config, logger } = req.app.locals;
  const userPath = req.query.path || '/';
  const absolutePath = validatePath(config.docsRoot, userPath);
  // ... 동일한 로직 ...
  res.json({ path: userPath, dirs, files });
}

// api-ctrl.js
async function getTreeData(config, logger, userPath = '/') {
  const absolutePath = validatePath(config.docsRoot, userPath);
  // ... 동일한 로직 ...
  return { path: userPath, dirs, files };
}
```

##### 2) Raw 파일 조회 로직
**파일**:
- `src/controllers/raw-controller.js::getRaw()` (66줄)
- `src/routes/api-ctrl.js::getRawContent()` (120줄)

**중복률**: ~90%
**차이점**:
- raw-controller: `res.type('text/plain').send(content)`
- api-ctrl: `return content`

##### 3) 파일 업로드 로직
**파일**:
- `src/controllers/upload-controller.js::uploadFile()` (221줄)
- `src/routes/api-ctrl.js::uploadFileData()` (273줄)

**중복률**: ~85%
**차이점**:
- upload-controller: multer middleware + Express 응답
- api-ctrl: Buffer 직접 전달 + 순수 함수 반환

**공통 사항**: extractZipFile() 함수가 양쪽에 모두 존재 (완전히 동일)

##### 4) 삭제 로직
**파일**:
- `src/controllers/delete-controller.js::deleteEntry()` (79줄)
- `src/routes/api-ctrl.js::deleteEntryData()` (339줄)

**중복률**: ~90%

##### 5) Full Tree 조회 로직
**파일**:
- `src/controllers/tree-controller.js::getFullTree()` + `buildTreeRecursive()` (202줄)
- `src/routes/api-ctrl.js::getFullTreeData()` + 내부 재귀 함수 (447줄)

**중복률**: ~80%
**차이점**: api-ctrl.js가 maxDepth 옵션 지원

---

### 4. 검색 로직 불일치

#### search-controller.js vs api-ctrl.js::searchDocuments

**문제**: 두 가지 서로 다른 검색 구현이 존재

**search-controller.js** (REST API):
- 파일명, 제목, 내용 우선순위 검색
- HTML `<mark>` 태그로 하이라이팅
- 최대 3개 매치/파일

**api-ctrl.js::searchDocuments** (MCP API):
- 내용만 검색
- 컨텍스트 ±2줄 제공
- 최대 50개 매치/파일

**영향도**: 🟡 중간
- 사용자 경험 불일치 (REST vs MCP 결과가 다름)
- 기능 분산으로 유지보수 어려움

---

## 🎯 리팩토링 전략

### Phase 1: 긴급 정리 (1일)
**목표**: 불필요한 파일 제거 및 사용되지 않는 import 정리

#### Task 1.1: trash/ 디렉토리 삭제
```bash
rm -rf trash/
```
**위험도**: 🟢 낮음 (어디에서도 사용되지 않음)
**예상 시간**: 5분
**테스트**:
```bash
npm test
npm start
```

#### Task 1.2: 사용되지 않는 import 제거
**파일**: src/routes/mcp.js
```diff
- const authMiddleware = require('../middleware/auth');
```
**위험도**: 🟢 낮음
**예상 시간**: 2분
**테스트**:
```bash
node scripts/audit-config-capture.js
npm test
```

---

### Phase 2: 아키텍처 통합 (2-3일)
**목표**: Controller와 api-ctrl.js 중복 제거 및 아키텍처 일원화

#### 전략 A: Service Layer 패턴 (권장)
**개념**: 비즈니스 로직을 별도의 service 레이어로 분리

**새로운 구조**:
```
src/
├── services/           # 새로 생성
│   ├── tree-service.js      # 순수 비즈니스 로직
│   ├── file-service.js
│   ├── search-service.js
│   └── config-service.js
├── controllers/        # Express req/res 처리만
│   ├── tree-controller.js   # 얇은 wrapper
│   ├── raw-controller.js
│   └── ...
└── routes/
    ├── api.js          # REST API
    └── mcp.js          # MCP API (services 직접 사용)
```

**구현 예시**:
```javascript
// src/services/tree-service.js
async function getTree(config, logger, userPath = '/') {
  const absolutePath = validatePath(config.docsRoot, userPath);
  // ... 비즈니스 로직 (api-ctrl.js에서 이동) ...
  return { path: userPath, dirs, files };
}

// src/controllers/tree-controller.js (얇은 wrapper)
const treeService = require('../services/tree-service');

async function getTreeController(req, res, next) {
  try {
    const { config, logger } = req.app.locals;
    const userPath = req.query.path || '/';
    const result = await treeService.getTree(config, logger, userPath);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

// src/routes/mcp.js
const treeService = require('../services/tree-service');

case 'list_documents': {
  const result = await treeService.getTree(config, logger, args.path || '/');
  // MCP 포맷으로 변환
  return { content: [{ type: 'text', text: formatTree(result) }] };
}
```

**장점**:
- ✅ 단일 진실 공급원 (Single Source of Truth)
- ✅ 테스트 용이성 (순수 함수)
- ✅ 재사용성 (REST, MCP, CLI 등 어디서든 사용 가능)
- ✅ 명확한 책임 분리

**단점**:
- ⚠️ 파일 구조 대폭 변경 (마이그레이션 필요)
- ⚠️ 기존 코드 전면 수정

**예상 시간**: 2-3일
**위험도**: 🟡 중간

---

#### 전략 B: api-ctrl.js 확장 (빠른 수정)
**개념**: 기존 api-ctrl.js를 유지하고 controllers를 wrapper로 변경

**구조**:
```
src/
├── routes/
│   ├── api-ctrl.js     # 공통 로직 (그대로 유지)
│   ├── api.js
│   └── mcp.js
└── controllers/        # api-ctrl.js wrapper로 변경
    ├── tree-controller.js
    ├── raw-controller.js
    └── ...
```

**구현 예시**:
```javascript
// src/controllers/tree-controller.js
const { getTreeData } = require('../routes/api-ctrl');

async function getTree(req, res, next) {
  try {
    const { config, logger } = req.app.locals;
    const userPath = req.query.path || '/';
    const result = await getTreeData(config, logger, userPath);
    res.json(result);
  } catch (error) {
    next(error);
  }
}
```

**장점**:
- ✅ 빠른 구현 (1일 이내)
- ✅ 기존 구조 최소 변경
- ✅ 즉시 중복 제거 효과

**단점**:
- ⚠️ api-ctrl.js 위치가 어색 (routes/ 디렉토리에 비즈니스 로직)
- ⚠️ 파일명이 역할과 불일치
- ⚠️ 장기적으로는 전략 A로 마이그레이션 필요

**예상 시간**: 1일
**위험도**: 🟢 낮음

---

#### 권장 사항: 2단계 접근
1. **즉시 실행** (Phase 2A): 전략 B로 빠르게 중복 제거
2. **장기 계획** (Phase 2B): 전략 A로 점진적 마이그레이션

---

### Phase 3: 검색 로직 통합 (1일)
**목표**: search-controller.js와 api-ctrl.js::searchDocuments 통합

#### 옵션 1: 기능 통합
두 구현의 장점을 결합한 단일 search service 생성

**구현**:
```javascript
// src/services/search-service.js
async function searchDocuments(config, logger, query, options = {}) {
  const {
    limit = 10,
    path = '/',
    mode = 'standard', // 'standard' | 'detailed'
    highlight = true
  } = options;

  // 파일명, 제목, 내용 우선순위 검색 (search-controller 로직)
  // + 컨텍스트 제공 (api-ctrl 로직)
  // + 하이라이팅 옵션 (mode에 따라)
}
```

**장점**:
- ✅ 두 API의 결과가 일치
- ✅ 더 풍부한 기능

**단점**:
- ⚠️ 구현 복잡도 증가

#### 옵션 2: 개별 유지 + 문서화
현재 구현을 유지하되 차이점을 명확히 문서화

**장점**:
- ✅ 빠른 구현
- ✅ 각 API의 특성에 최적화

**단점**:
- ⚠️ 유지보수 부담 지속
- ⚠️ 사용자 혼란

**권장**: 옵션 1 (기능 통합)
**예상 시간**: 1일
**위험도**: 🟡 중간

---

## 📊 우선순위 매트릭스

| Phase | Task | 영향도 | 위험도 | 시간 | 우선순위 |
|-------|------|--------|--------|------|----------|
| 1.1 | trash/ 삭제 | 🟡 중간 | 🟢 낮음 | 5분 | **P0** |
| 1.2 | unused import 제거 | 🟢 낮음 | 🟢 낮음 | 2분 | **P1** |
| 2A | Controller wrapper화 (전략 B) | 🔴 높음 | 🟢 낮음 | 1일 | **P1** |
| 2B | Service Layer 도입 (전략 A) | 🔴 높음 | 🟡 중간 | 2-3일 | **P2** |
| 3 | 검색 로직 통합 | 🟡 중간 | 🟡 중간 | 1일 | **P2** |

---

## 🚀 실행 계획 (권장)

### Week 1: 긴급 개선
**Day 1** (2시간):
- ✅ Phase 1.1: trash/ 삭제
- ✅ Phase 1.2: unused import 제거
- ✅ Phase 2A: Controller wrapper화 시작

**Day 2-3** (2일):
- ✅ Phase 2A 완료: 모든 controller를 api-ctrl.js wrapper로 변경
- ✅ 단위 테스트 작성 및 검증

**Day 4** (1일):
- ✅ Phase 3: 검색 로직 통합
- ✅ E2E 테스트 및 회귀 테스트

**Day 5** (예비):
- 🔧 버그 수정 및 문서화
- 📝 리팩토링 보고서 작성

### Week 2-3: 장기 개선 (선택)
**Phase 2B**: Service Layer 도입
- src/services/ 디렉토리 생성
- 점진적 마이그레이션 (한 번에 하나씩)
- 테스트 커버리지 유지

---

## ✅ 성공 기준

### 정량적 지표
1. **중복 코드 감소**: ~500줄 제거 예상
2. **파일 수 감소**: 16개 trash 파일 제거
3. **테스트 통과율**: 100% 유지
4. **빌드 시간**: 현재와 동일 또는 개선
5. **번들 크기**: 감소 (trash 파일 제거로 인한)

### 정성적 지표
1. **코드 가독성**: Controller 로직이 명확히 분리됨
2. **유지보수성**: 비즈니스 로직 수정 시 한 곳만 수정
3. **테스트 용이성**: 순수 함수로 분리되어 테스트 간편
4. **일관성**: REST와 MCP API 결과가 일치

---

## ⚠️ 위험 요소 및 대응

### 위험 1: 회귀 버그 발생
**확률**: 🟡 중간
**영향**: 🔴 높음
**대응**:
- 각 단계마다 철저한 테스트
- 기존 테스트 스위트 100% 통과 확인
- Playwright E2E 테스트 실행

### 위험 2: 성능 저하
**확률**: 🟢 낮음
**영향**: 🟡 중간
**대응**:
- 벤치마크 테스트 실행
- 함수 호출 오버헤드 최소화 (인라인 최적화)

### 위험 3: 일정 지연
**확률**: 🟡 중간
**영향**: 🟡 중간
**대응**:
- Phase별 완료 후 다음 단계 진행
- Phase 2B는 선택 사항 (나중에 진행 가능)

---

## 📝 체크리스트

### Phase 1 완료 조건
- [ ] trash/ 디렉토리 삭제 완료
- [ ] mcp.js에서 authMiddleware import 제거
- [ ] `npm test` 통과
- [ ] `npm start` 정상 작동
- [ ] Git commit 및 push

### Phase 2A 완료 조건
- [ ] 모든 controller가 api-ctrl.js 함수를 호출하도록 수정
- [ ] tree-controller.js 수정 완료
- [ ] raw-controller.js 수정 완료
- [ ] upload-controller.js 수정 완료
- [ ] delete-controller.js 수정 완료
- [ ] download-controller.js 확인 (중복 없음)
- [ ] config-controller.js 확인 (중복 없음)
- [ ] doc-controller.js 확인 (중복 없음)
- [ ] 단위 테스트 작성
- [ ] 통합 테스트 통과
- [ ] Git commit 및 push

### Phase 3 완료 조건
- [ ] search service 구현 완료
- [ ] search-controller.js가 service 호출
- [ ] api-ctrl.js::searchDocuments가 service 호출
- [ ] REST API 검색 결과 검증
- [ ] MCP API 검색 결과 검증
- [ ] 단위 테스트 작성
- [ ] Git commit 및 push

### 최종 검증
- [ ] 전체 테스트 스위트 통과
- [ ] Playwright E2E 테스트 통과
- [ ] 수동 테스트: REST API 엔드포인트 전체
- [ ] 수동 테스트: MCP API 도구 전체
- [ ] 성능 벤치마크 확인
- [ ] 코드 리뷰 완료
- [ ] 리팩토링 보고서 작성
- [ ] Git tag 생성: `v1.x.x-refactored`

---

## 📚 참고 자료

### 관련 파일
```
src/routes/api-ctrl.js          # 공통 비즈니스 로직
src/controllers/                # REST API controllers
src/routes/api.js               # REST API 라우터
src/routes/mcp.js               # MCP API 라우터
trash/                          # 삭제 대상
```

### 아키텍처 패턴
- **Service Layer Pattern**: Martin Fowler's Pattern of Enterprise Application Architecture
- **Clean Architecture**: Robert C. Martin
- **Express Best Practices**: Express.js official documentation

### 테스트 전략
- **Unit Testing**: Jest / Mocha
- **Integration Testing**: Supertest
- **E2E Testing**: Playwright

---

## 🎓 학습 포인트

이번 리팩토링을 통해 다음을 학습할 수 있습니다:

1. **DRY 원칙**: Don't Repeat Yourself의 실전 적용
2. **SOLID 원칙**: 특히 SRP (Single Responsibility Principle)
3. **Service Layer Pattern**: 비즈니스 로직 분리의 중요성
4. **API 설계**: REST와 JSON-RPC의 차이점 이해
5. **리팩토링 전략**: 안전하고 점진적인 코드 개선 방법

---

**최종 수정**: 2025-10-31
**작성자**: 리팩토링 TF팀
**검토자**: (TBD)
**승인자**: (TBD)
