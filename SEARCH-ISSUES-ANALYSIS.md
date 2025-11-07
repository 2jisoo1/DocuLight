# 검색 기능 문제 분석 보고서

**일시**: 2025-11-05
**테스트 환경**: Chrome 브라우저 (Playwright MCP)
**서버 버전**: DocLight v1.0 (localhost:3000)

---

## 🔍 보고된 문제

### 문제 1: "검색 결과가 첫 번째만 표시됨"
**상태**: ❌ **재현 불가 (False Positive)**

**테스트 결과**:
- 검색어 "test" 입력 시 **16개 이상의 검색 결과** 정상 표시
- 서버 API `/api/search?query=test&limit=50`가 정상 동작
- 클라이언트에서 모든 결과를 정상적으로 렌더링

**결론**: 이 문제는 실제로 발생하지 않음. 사용자가 다른 문제와 혼동했을 가능성 있음.

---

### 문제 2: "검색 결과 클릭 시 스크롤되지 않음"
**상태**: ✅ **재현 성공 + 추가 버그 발견**

#### 2-1. 치명적 버그: 검색 결과 클릭 시 400 에러

**재현 단계**:
1. 검색창에서 "test" 입력
2. 첫 번째 검색 결과 `/test-images.md` 클릭
3. **HTTP 400 Bad Request 에러 발생**

**원인 분석**:

```
검색 서비스 (search-service.js:242):
  → path: '/' + relativePath  (예: "/test-images.md")

클라이언트 (app.js:1971):
  → loadFile(path)  (예: "/test-images.md")

API 요청 (app.js:246):
  → /api/raw?path=/test-images.md

서버 검증 (path-validator.js):
  → ❌ "Absolute paths are not allowed"
```

**검증**:
```bash
# 실패 (앞에 / 있음)
curl "http://localhost:3000/api/raw?path=/test-images.md"
→ {"error":{"code":"PATH_TRAVERSAL","message":"Absolute paths are not allowed"}}

# 성공 (앞에 / 없음)
curl "http://localhost:3000/api/raw?path=test-images.md"
→ 정상 응답
```

**파일 위치**:
- `src/services/search-service.js` (Line 242)
- `public/js/app.js` (Line 1958-1976)

---

#### 2-2. 기능 누락: 검색어 위치로 스크롤 안 됨

**현재 동작**:
- 검색 결과 클릭 → 파일 로드 → 페이지 상단으로 스크롤

**기대 동작**:
- 검색 결과 클릭 → 파일 로드 → 검색어가 있는 위치로 스크롤 + 하이라이트

**원인**:
- `app.js:1971`의 `loadFile(path)`는 hash 파라미터를 받지만, 검색 결과에서는 전달하지 않음
- 검색어가 문서 내 어디에 있는지 위치 정보가 없음

---

## 🛠 해결 계획

### 1단계: 경로 버그 수정 (Critical)

**방법 A: 서버 검색 결과 수정** (권장)
```javascript
// src/services/search-service.js:242
// 변경 전
path: '/' + relativePath.replace(/\\/g, '/'),

// 변경 후
path: relativePath.replace(/\\/g, '/'),  // 앞의 / 제거
```

**방법 B: 클라이언트에서 / 제거**
```javascript
// public/js/app.js:1971
const path = item.dataset.path.replace(/^\//, '');  // 앞의 / 제거
await loadFile(path);
```

**추천**: 방법 A (서버 수정)
- 검색 API 응답 형식 통일
- MCP 서버에서도 동일한 path 사용
- 클라이언트 여러 곳에서 일관되게 사용 가능

---

### 2단계: 검색어 위치 스크롤 기능 추가 (Enhancement)

#### 옵션 1: 첫 번째 매치 라인으로 스크롤 (간단)

**구현 방법**:
```javascript
// app.js 검색 결과 클릭 이벤트 수정
const path = item.dataset.path;
const firstMatch = result.matches[0];  // 검색 결과에서 첫 매치 가져오기

if (firstMatch && firstMatch.line > 0) {
  // 파일 로드 후 해당 라인으로 스크롤
  await loadFile(path);
  scrollToLine(firstMatch.line);  // 새로운 함수 구현 필요
}
```

**장점**:
- 구현 간단
- 서버 수정 불필요

**단점**:
- 라인 번호로만 스크롤 (정확한 텍스트 위치는 아님)
- 문서가 길면 라인 번호 계산이 어려울 수 있음

---

#### 옵션 2: Heading ID로 스크롤 (중간)

**전제 조건**:
- 검색 매치가 heading 내부에 있는 경우만 동작
- 이미 구현된 heading anchor 기능 활용

**구현 방법**:
```javascript
// 1. 검색 서비스에서 매치된 라인이 heading인지 확인
// 2. heading ID 생성 (현재 renderMarkdown에서 사용하는 로직과 동일)
// 3. 검색 결과에 headingId 필드 추가
// 4. 클라이언트에서 loadFile(path, headingId) 호출
```

**장점**:
- 기존 기능 재사용
- URL hash와 일관성 유지

**단점**:
- heading이 아닌 일반 텍스트는 스크롤 안 됨

---

#### 옵션 3: Text Fragment API 사용 (고급)

**Browser API 활용**:
```javascript
// URL에 text fragment 추가
const searchText = query;
const url = `/doc/${encodedPath}#:~:text=${encodeURIComponent(searchText)}`;
window.history.pushState({}, '', url);

// 브라우저가 자동으로 해당 텍스트로 스크롤 + 하이라이트
```

**장점**:
- 브라우저 네이티브 기능
- 정확한 텍스트 매칭
- 자동 하이라이트

**단점**:
- 최신 브라우저만 지원 (Chrome 80+, Edge 80+, Safari 16.1+)
- Firefox 미지원

**참고**: [Text Fragments Spec](https://wicg.github.io/scroll-to-text-fragment/)

---

#### 옵션 4: Custom 검색어 하이라이트 + 스크롤 (완전 구현)

**구현 단계**:
1. 파일 로드 후 DOM에서 검색어 찾기
2. 첫 번째 매치를 `<mark>` 태그로 감싸기
3. `scrollIntoView()`로 해당 요소로 스크롤
4. 자동으로 하이라이트 제거 (3초 후)

**구현 예시**:
```javascript
async function loadFileAndHighlightSearch(path, searchQuery) {
  await loadFile(path);

  // DOM에서 검색어 찾기
  const contentDiv = document.getElementById('markdown-content');
  const walker = document.createTreeWalker(
    contentDiv,
    NodeFilter.SHOW_TEXT,
    null
  );

  let node;
  let found = false;
  const regex = new RegExp(searchQuery, 'gi');

  while (node = walker.nextNode()) {
    if (regex.test(node.textContent) && !found) {
      // 첫 번째 매치를 하이라이트
      const parent = node.parentElement;
      const highlightedHTML = node.textContent.replace(
        regex,
        (match) => `<mark class="search-highlight">${match}</mark>`
      );
      parent.innerHTML = highlightedHTML;

      // 스크롤
      const mark = parent.querySelector('.search-highlight');
      if (mark) {
        mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
        found = true;
      }

      // 3초 후 하이라이트 제거
      setTimeout(() => {
        parent.innerHTML = node.textContent;
      }, 3000);

      break;
    }
  }
}
```

**장점**:
- 완전한 기능 구현
- 모든 브라우저 지원
- 사용자 경험 최상

**단점**:
- 구현 복잡도 높음
- DOM 조작 비용

---

## 📋 권장 구현 순서

### Phase 1: 버그 수정 (즉시)
- [ ] `search-service.js:242` 경로 수정 (앞의 `/` 제거)
- [ ] 테스트: 검색 결과 클릭 시 파일 정상 로드 확인

### Phase 2: 기본 스크롤 기능 (단기)
- [ ] **옵션 3 (Text Fragment API)** 구현 (최소 노력, 최대 효과)
- [ ] Fallback: Text Fragment 미지원 브라우저는 페이지 상단 스크롤
- [ ] 테스트: Chrome, Edge, Safari에서 동작 확인

### Phase 3: 완전 구현 (장기, 선택)
- [ ] **옵션 4 (Custom 하이라이트)** 구현
- [ ] 모든 브라우저 지원
- [ ] 애니메이션 효과 추가
- [ ] E2E 테스트 작성

---

## 🧪 테스트 계획

### 버그 수정 테스트
```bash
# 1. 서버 재시작
npm run dev

# 2. 브라우저에서 검색
- 검색창 열기 → "test" 입력
- 첫 번째 결과 클릭
- 예상: 파일 정상 로드 (에러 없음)

# 3. API 테스트
curl "http://localhost:3000/api/search?query=test" | jq '.results[0].path'
# 예상: "test-images.md" (앞에 / 없음)
```

### 스크롤 기능 테스트
```javascript
// Text Fragment API 테스트
// URL: http://localhost:3000/doc/test-images#:~:text=test

// 예상 결과:
// 1. 파일 로드
// 2. "test" 단어로 자동 스크롤
// 3. 브라우저가 자동으로 하이라이트 (노란색 배경)
```

---

## 📊 우선순위

| 이슈 | 심각도 | 우선순위 | 예상 시간 |
|------|--------|----------|-----------|
| 검색 결과 클릭 시 400 에러 | Critical | P0 | 5분 |
| 검색어 위치로 스크롤 안 됨 | Medium | P1 | 30분 (Option 3) |
| 완전한 하이라이트 구현 | Low | P2 | 2시간 (Option 4) |

---

## 💡 추가 개선 사항

### 검색 결과 UI 개선
- [ ] 검색어 하이라이트를 더 명확하게 (`<mark>` 태그 스타일링)
- [ ] 검색 결과 미리보기에서 더 많은 컨텍스트 제공
- [ ] 검색 결과 정렬 옵션 (관련도, 파일명, 날짜)

### 성능 최적화
- [ ] 검색 debounce 시간 조정 (현재 300ms)
- [ ] 검색 결과 캐싱
- [ ] 대용량 파일 검색 시 타임아웃 경고

---

## 🔗 관련 파일

### 서버 사이드
- `src/services/search-service.js` - 검색 로직 (Line 242 수정 필요)
- `src/controllers/search-controller.js` - REST API 컨트롤러
- `src/utils/path-validator.js` - 경로 검증 (절대 경로 거부)

### 클라이언트 사이드
- `public/js/app.js` - 검색 UI 및 이벤트 (Line 1841-1987)
  - `initSearchFeature()` - 검색 초기화
  - `fetchSearch()` - 검색 API 호출
  - Line 1958-1976 - 검색 결과 클릭 이벤트 (수정 필요)
  - `loadFile()` - 파일 로드 (Line 1403-1514)

### CSS
- `public/css/style.css` - 검색 패널 및 결과 스타일링

---

## 📝 요약

**문제 1 (재현 불가)**: 검색 결과는 정상적으로 모두 표시됨 → 조치 불필요

**문제 2 (재현 성공)**:
1. **치명적 버그**: 검색 결과 경로에 앞의 `/`가 있어서 400 에러 발생
   - 해결: `search-service.js:242`에서 `/` 제거

2. **기능 누락**: 검색어 위치로 스크롤 안 됨
   - 해결: Text Fragment API 사용 (권장) 또는 Custom 구현

**다음 단계**: Phase 1 버그 수정 후 Phase 2 스크롤 기능 구현
