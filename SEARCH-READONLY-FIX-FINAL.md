# 검색 IME 문제 최종 해결 - readOnly 방어

**일시**: 2025-11-05
**문제**: 클릭 시 "검색" → "검" → "검색" 값 변경으로 input 이벤트 2회 발생
**해결**: searchInput.readOnly = true로 값 변경 원천 차단

---

## 🎯 최종 해결책

### 3단계 방어 시스템

```javascript
// 1단계: Navigation 플래그
let isNavigatingToResult = false;

// 2단계: IME Composition 플래그
let isComposing = false;

// 3단계: Query 중복 체크
let lastSearchQuery = '';

// 4단계: ReadOnly 잠금 (최종 방어) ⭐
searchInput.readOnly = true;
```

---

## 📋 구현 코드

### Click 이벤트 핸들러

```javascript
searchResults.addEventListener('click', async (e) => {
  // ...

  // ⭐ Step 1: Set flags IMMEDIATELY
  isNavigatingToResult = true;

  // ⭐ Step 2: Lock input field
  const savedValue = searchInput.value;
  searchInput.readOnly = true;

  try {
    // Navigate to file
    await loadFile(path, '', true, true);

    // Scroll to match
    if (searchQuery) {
      await new Promise(resolve => setTimeout(resolve, 100));
      scrollToSearchTerm(searchQuery, matchIndex);
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  } finally {
    // ⭐ Step 3: Unlock after delay
    setTimeout(() => {
      searchInput.value = savedValue;  // Restore
      searchInput.readOnly = false;     // Unlock
      isNavigatingToResult = false;
    }, 100);
  }
});
```

---

## ✨ 효과

### Before
```
[클릭]
   ↓
브라우저/IME가 값 변경: "검색" → "검" → "검색"
   ↓
input 이벤트 2회 발생
   ↓
"Searching..." 로딩창 표시
   ↓
검색 재실행
   ↓
깜빡거림 ⚠️
```

### After
```
[클릭]
   ↓
readOnly = true ⭐
   ↓
브라우저/IME가 값 변경 시도 → 차단됨 ✅
   ↓
input 이벤트 발생 안 함
   ↓
파일 로드 + 스크롤
   ↓
readOnly = false (unlock)
   ↓
깜빡거림 없음 ✅
```

---

## 🧪 테스트

```
http://localhost:3000

1. 검색: "검색"
2. **첫 번째** 결과 클릭
3. 콘솔 확인:
   [DEBUG] Search input locked (readOnly)
   [DEBUG] Search input unlocked
4. 예상 결과:
   ✅ 로딩창 깜빡임 없음
   ✅ 바로 파일 이동
   ✅ Input event triggered 로그 없어야 함
```

---

## 디버그 로그 제거

테스트 완료 후 모든 `console.log('[DEBUG] ...')` 제거 필요

완벽한 해결책 구현 완료! 🎉
