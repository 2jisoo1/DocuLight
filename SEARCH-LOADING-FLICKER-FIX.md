# 검색 로딩창 깜빡거림 해결

**일시**: 2025-11-05
**이슈**: 검색 결과 클릭 시 "Searching..." 로딩창이 잠깐 나타났다 사라짐 (깜빡임)
**해결**: isNavigatingToResult 플래그로 재검색 방지

---

## 🐛 문제 재현

### 증상
1. "검색" 검색
2. 아무 결과 클릭
3. **로딩창 "Searching..." 잠깐 표시** (100-300ms)
4. 로딩창 사라지고 파일 표시
5. **깜빡거림** 발생

### 사용자 경험 저해
```
[검색 결과 클릭]
   ↓
[로딩창 표시] "Searching..." ⚠️
   ↓
[깜빡]
   ↓
[파일 표시]
```

---

## 🔍 원인 분석

### 이벤트 체인

```javascript
[사용자가 검색 결과 클릭]
   ↓
searchResults.click 이벤트 발생
   ↓
await loadFile(path)  // 파일 로드 중...
   ↓
??? 어떤 이유로 searchInput에 'input' 이벤트 발생
   ↓
searchInput.addEventListener('input') 핸들러 실행
   ↓
searchResults.innerHTML = '<div class="search-loading">...</div>'  // ⚠️
   ↓
기존 검색 결과가 사라지고 로딩창 표시
   ↓
300ms 후 다시 검색 실행
   ↓
검색 결과 다시 표시
```

### 가능한 원인

1. **브라우저 자동완성**: input 필드의 값이 변경되면서 input 이벤트 트리거
2. **DOM 조작 부작용**: loadFile이 DOM을 변경하면서 input에 영향
3. **Focus 이동**: 파일 로드 중 focus가 searchInput으로 돌아가며 이벤트 발생
4. **프로그래밍적 변경**: 어딘가에서 `searchInput.value` 변경

---

## ✅ 해결 방법: 네비게이션 플래그

### 1. 플래그 변수 추가

```javascript
// public/js/app.js:1856
let isNavigatingToResult = false;
```

**역할**: 검색 결과를 클릭하여 파일로 이동 중인지 추적

---

### 2. Input 이벤트 핸들러 수정

```javascript
// public/js/app.js:1896-1900
searchInput.addEventListener('input', (e) => {
  // Ignore input events during result navigation
  if (isNavigatingToResult) {
    return;  // ⭐ 네비게이션 중에는 검색 무시
  }

  const query = e.target.value.trim();
  // ... 검색 로직 ...
});
```

**효과**:
- 네비게이션 중 input 이벤트가 발생해도 무시
- 로딩창 표시 안 됨
- 기존 검색 결과 유지

---

### 3. 클릭 이벤트 핸들러에 플래그 설정

```javascript
// public/js/app.js:2012-2032
searchResults.addEventListener('click', async (e) => {
  // ... 클릭 처리 ...

  try {
    // Set flag BEFORE file loading
    isNavigatingToResult = true;  // ⭐

    await loadFile(path, '', true, true);

    if (searchQuery) {
      await new Promise(resolve => setTimeout(resolve, 100));
      scrollToSearchTerm(searchQuery, matchIndex);
    }
  } catch (error) {
    console.error('Failed to load search result:', error);
  } finally {
    // Reset flag AFTER navigation completes
    isNavigatingToResult = false;  // ⭐
  }
});
```

**타이밍**:
- 클릭 직후: `isNavigatingToResult = true`
- 파일 로드 + 스크롤 완료 후: `isNavigatingToResult = false`
- finally 블록 사용으로 에러 시에도 플래그 리셋 보장

---

## 🎯 실행 흐름 비교

### Before (로딩창 깜빡임)

```
[검색 결과 클릭]
   ↓
loadFile() 시작
   ↓
??? input 이벤트 발생
   ↓
searchResults.innerHTML = 'Searching...'  ⚠️
   ↓
[로딩창 깜빡]
   ↓
300ms 후 다시 검색
   ↓
결과 재표시
```

### After (깜빡임 없음) ✅

```
[검색 결과 클릭]
   ↓
isNavigatingToResult = true  ⭐
   ↓
loadFile() 시작
   ↓
??? input 이벤트 발생
   ↓
if (isNavigatingToResult) return;  ⭐ 무시됨
   ↓
[로딩창 표시 안 됨] ✅
   ↓
파일 로드 + 스크롤 완료
   ↓
isNavigatingToResult = false
```

---

## 📋 수정 내용 요약

### public/js/app.js

**Line 1856**: 플래그 변수 추가
```javascript
let isNavigatingToResult = false;
```

**Line 1897-1900**: Input 핸들러에 early return 추가
```javascript
if (isNavigatingToResult) {
  return;  // 네비게이션 중 검색 무시
}
```

**Line 2014**: 네비게이션 시작 시 플래그 설정
```javascript
isNavigatingToResult = true;
```

**Line 2030-2031**: 네비게이션 완료 시 플래그 리셋
```javascript
finally {
  isNavigatingToResult = false;
}
```

---

## 🧪 회귀 테스트 시나리오

### Test Case 1: 로딩창 깜빡임 제거 (핵심) ⭐

```
1. http://localhost:3000 접속
2. 검색: "검색"
3. 첫 번째 결과 클릭
4. 주의깊게 관찰:
   ❌ "Searching..." 로딩창 표시되면 안 됨
   ✅ 바로 파일 로드되어야 함
5. 두 번째 결과 클릭
   ❌ 로딩창 없어야 함
   ✅ 바로 이동
```

### Test Case 2: 정상적인 검색은 로딩창 표시

```
1. 검색: "test"
2. 검색 중 확인:
   ✅ "Searching..." 로딩창 정상 표시
   ✅ 결과 로드 후 사라짐
3. 검색어 변경: "image"
4. 확인:
   ✅ 로딩창 다시 표시 (정상)
```

### Test Case 3: 연속 클릭 (빠른 클릭)

```
1. 검색: "프롬프트"
2. 첫 번째 결과 클릭
3. 0.5초 후 두 번째 결과 클릭
4. 0.5초 후 세 번째 결과 클릭
5. 확인:
   ❌ 로딩창 표시되면 안 됨
   ✅ 각 파일로 바로 이동
```

### Test Case 4: 에러 발생 시 플래그 리셋

```
1. 검색: "test"
2. 존재하지 않는 경로의 결과 클릭 (억지로 만들어서)
3. 에러 발생
4. 다시 검색: "image"
5. 확인:
   ✅ 검색 정상 작동 (플래그가 리셋되었음)
```

---

## 🔬 기술적 세부사항

### try-finally 패턴 사용 이유

```javascript
try {
  isNavigatingToResult = true;
  await loadFile(...);
} catch (error) {
  console.error(error);
} finally {
  isNavigatingToResult = false;  // 항상 실행
}
```

**장점**:
- 에러 발생 시에도 플래그 리셋 보장
- 플래그가 true로 고착되는 것 방지
- 안정적인 상태 관리

### 플래그 스코프

```javascript
function initSearchFeature() {
  let isNavigatingToResult = false;  // 클로저 변수

  // input 핸들러에서 접근 가능
  searchInput.addEventListener('input', (e) => {
    if (isNavigatingToResult) return;
  });

  // click 핸들러에서 접근 가능
  searchResults.addEventListener('click', async (e) => {
    isNavigatingToResult = true;
  });
}
```

**특징**:
- 함수 스코프에 캡슐화
- 외부에서 접근 불가 (안전)
- 여러 이벤트 핸들러가 공유

---

## 📊 성능 개선

| 항목 | Before | After |
|------|--------|-------|
| 불필요한 검색 | 매 클릭마다 | 없음 ⭐ |
| 로딩창 표시 | 깜빡임 | 없음 ⭐ |
| DOM 조작 | 2회 (로딩+결과) | 1회 ⭐ |
| 네트워크 요청 | 중복 가능 | 방지 ⭐ |

---

## ✅ 검증 방법

### 브라우저 콘솔 디버깅

```javascript
// 검색 실행 횟수 추적
let searchCount = 0;
const originalFetch = window.fetchSearch;
window.fetchSearch = async function(...args) {
  console.log(`Search ${++searchCount}:`, args[0]);
  return originalFetch.apply(this, args);
};

// 검색 결과 클릭 후 콘솔 확인
// Before: Search 1: test, Search 2: test (중복)
// After: Search 1: test (중복 없음) ⭐
```

### Network 탭 확인

```
[검색 결과 클릭]
   ↓
GET /api/raw?path=1강.md (200 OK)
   ↓
[완료]

Before: GET /api/search?query=... (불필요한 중복 요청)
After: (중복 요청 없음) ⭐
```

---

## 🎉 최종 결과

### 사용자 경험

**Before**:
1. 검색 결과 클릭
2. **깜빡** "Searching..." 표시
3. **깜빡** 검색 결과 다시 표시
4. 파일 로드
5. 불안정하고 어지러운 UX

**After** ✅:
1. 검색 결과 클릭
2. **바로 파일 로드**
3. **깜빡임 없음**
4. 부드러운 UX

---

## 📁 수정 파일

```
public/js/app.js
  - Line 1856: isNavigatingToResult 플래그 추가
  - Line 1897-1900: Input 핸들러에 early return
  - Line 2014: 플래그 true 설정
  - Line 2030-2031: finally로 플래그 리셋
```

---

## 🚀 수동 테스트

```
http://localhost:3000

1. 검색: "검색"
2. 아무 결과 클릭
3. 확인:
   ❌ "Searching..." 로딩창 나타나면 안 됨
   ✅ 바로 파일 로드되어야 함
4. 다른 결과 계속 클릭
   ✅ 모두 깜빡임 없이 바로 로드
```

---

## 🎯 전체 검색 기능 개선 요약 (v1.5 Final)

1. ✅ 경로 400 에러 수정
2. ✅ 검색어 위치 자동 스크롤 + 하이라이트
3. ✅ 카드 형식으로 모든 매치 표시 (50개)
4. ✅ 검색 패널 유지
5. ✅ 스크롤 애니메이션 제거
6. ✅ 연속 클릭 버그 수정 (이벤트 위임)
7. ✅ 각 카드별 정확한 매치 위치로 스크롤
8. ✅ 스크롤 깜빡임 제거 (skipScroll)
9. ✅ **로딩창 깜빡임 제거** ⭐ (최신 수정)

완벽한 검색 경험 달성! 🎉
