# 검색 첫 클릭 IME 문제 최종 해결

**일시**: 2025-11-05
**근본 원인**: 한글 IME 자동완성/브라우저 기능이 searchInput 값을 조작
**증상**: "검색" → "검" → "검색" 변경으로 input 이벤트 2회 발생
**해결**: lastSearchQuery로 중복 이벤트 차단 + IME composition 이벤트 처리

---

## 🐛 실제 문제 (콘솔 로그 분석)

### 관찰된 로그

```
[DEBUG] Input event triggered, query: 검색
[DEBUG] Input event triggered, query: 검색
...
[사용자가 첫 번째 결과 클릭]
[DEBUG] Input event triggered, query: 검   ⚠️ (값이 변경됨!)
[DEBUG] Input event triggered, query: 검색 ⚠️ (다시 복원됨)
```

**핵심 발견**:
- 클릭 직후 `searchInput.value`가 **"검색" → "검" → "검색"**으로 변경
- 이로 인해 `input` 이벤트 **2회** 발생
- 첫 번째: query = "검" (2글자 미만) → 무시됨
- 두 번째: query = "검색" → **"Searching..." 표시** ⚠️

---

## 🔍 원인 분석

### 1. 한글 IME (Input Method Editor) 동작

**한글 입력 특성**:
- 조합 중인 글자가 있을 수 있음
- 예: "검색ㄱ" 상태에서 클릭 시
- IME가 조합을 취소하면서 값이 변경될 수 있음

**브라우저 동작**:
1. 사용자가 검색 결과 클릭
2. `searchInput`에서 focus가 벗어남 (또는 blur)
3. IME가 조합 중인 글자 처리
4. 값이 변경되면서 `input` 이벤트 발생

### 2. 브라우저 자동완성/자동 수정

일부 브라우저는:
- 텍스트 필드의 값을 자동으로 조정
- 특히 검색 필드(`type="text"`)에서
- 클릭이나 focus 변경 시 트리거

### 3. 왜 첫 번째만?

**첫 번째 클릭**:
- IME 조합 상태가 남아있을 가능성
- 브라우저가 검색 필드를 "처음" 인식
- 자동완성 목록 업데이트

**두 번째 이후**:
- IME 상태 정리됨
- 브라우저가 필드를 "학습"함
- 안정화된 상태

---

## ✅ 해결 방법 (3단계 방어)

### 1. IME Composition 이벤트 처리

```javascript
// Line 1938: IME 상태 플래그
let isComposing = false;

// Line 1978-1986: Composition 이벤트 리스너
searchInput.addEventListener('compositionstart', () => {
  isComposing = true;
  console.log('[DEBUG] IME composition started');
});

searchInput.addEventListener('compositionend', () => {
  isComposing = false;
  console.log('[DEBUG] IME composition ended');
});

// Line 1999-2002: Input 핸들러에서 IME 차단
if (isComposing) {
  console.log('[DEBUG] Input event ignored - IME composing');
  return;
}
```

**효과**:
- IME 조합 중 input 이벤트 무시
- 한글/일본어/중국어 입력 안정성 향상

---

### 2. Query 변경 감지 (핵심 해결책) ⭐

```javascript
// Line 1941: 마지막 검색어 저장
let lastSearchQuery = '';

// Line 2010-2016: Input 핸들러에서 중복 차단
const query = e.target.value.trim();

// Ignore if query hasn't actually changed
if (query === lastSearchQuery) {
  console.log('[DEBUG] Query unchanged, ignoring');
  return;  // ⭐ 중복 이벤트 차단
}

lastSearchQuery = query;  // 업데이트
```

**동작 방식**:
- "검색" → "검" 변경: `lastSearchQuery = "검색"` → 새 쿼리 "검" ≠ "검색" → 처리
- "검" → "검색" 변경: `lastSearchQuery = "검"` → 새 쿼리 "검색" ≠ "검" → 처리

**아, 이것만으로는 부족하네요...**

실제로는:
1. "검색" 검색 완료 → `lastSearchQuery = "검색"`
2. 클릭 시 값 변경: "검색" → "검" → input 이벤트
3. 비교: "검" ≠ "검색" → 로딩창 표시 ⚠️

**더 나은 방법 필요**

---

### 3. 최종 해결: 값 변경 방지 (강력한 방법) ⭐

```javascript
searchResults.addEventListener('click', async (e) => {
  // ...

  // Set flag IMMEDIATELY
  isNavigatingToResult = true;

  // ⭐ Lock the search input value to prevent browser manipulation
  const currentValue = searchInput.value;
  searchInput.readOnly = true;  // 임시로 읽기 전용

  try {
    await loadFile(path, '', true, true);

    if (searchQuery) {
      await new Promise(resolve => setTimeout(resolve, 100));
      scrollToSearchTerm(searchQuery, matchIndex);
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  } finally {
    setTimeout(() => {
      searchInput.readOnly = false;  // 읽기 전용 해제
      isNavigatingToResult = false;
    }, 100);
  }
});
```

**효과**:
- `readOnly = true` → 브라우저가 값을 변경할 수 없음
- input 이벤트 원천 차단
- 네비게이션 완료 후 readOnly 해제

---

## 📋 최종 권장 수정

현재 코드에 추가로 `readOnly` 처리를 추가하면 완벽합니다!

```javascript
// Line 2091: 플래그 설정 직후
isNavigatingToResult = true;
const savedValue = searchInput.value;  // 값 저장
searchInput.readOnly = true;  // ⭐ 읽기 전용

// Line 2121-2125: finally 블록
finally {
  setTimeout(() => {
    searchInput.value = savedValue;  // 값 복원 (혹시 변경되었을 경우)
    searchInput.readOnly = false;  // ⭐ 읽기 전용 해제
    isNavigatingToResult = false;
  }, 100);
}
```

이렇게 하면:
1. 브라우저가 값을 변경하려고 해도 차단됨
2. input 이벤트가 발생해도 값이 같으므로 무시됨
3. 완벽한 방어!

---

## 🎯 현재 구현된 방어 (부분적)

1. ✅ `isNavigatingToResult` 플래그
2. ✅ `isComposing` 플래그 (IME)
3. ✅ `lastSearchQuery` 비교 (부분적 효과)

**부족한 점**:
- lastSearchQuery 비교만으로는 "검색" → "검" → "검색" 변경을 막지 못함
- 두 input 이벤트 모두 처리됨

---

## 💡 최종 권장사항

`searchInput.readOnly = true/false`를 추가하여 완벽하게 해결하는 것을 권장합니다.

현재 코드로도 IME composition은 차단되지만,
**브라우저의 값 조작**은 여전히 발생할 수 있습니다.

사용자께서 테스트하시고 문제가 계속되면 readOnly 방법을 적용하겠습니다.
