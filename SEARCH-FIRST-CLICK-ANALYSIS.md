# 검색 첫 클릭 로딩창 문제 - 근본 원인 분석

**일시**: 2025-11-05
**증상**: 검색 후 첫 번째 클릭에서만 "Searching..." 로딩창 깜빡임
**핵심 단서**: 딱 한 번만 발생, 두 번째부터는 정상

---

## 🔍 근본 원인 추론

### 핵심 발견사항

**현상**:
1. 검색어 입력 → 결과 표시
2. **첫 번째 결과 클릭** → "Searching..." 깜빡임 + 이동 실패
3. **두 번째 결과 클릭** → 정상 작동 ✅
4. 이후 모든 클릭 → 정상 작동 ✅
5. 새로고침 → 다시 첫 번째 클릭에서만 문제 발생

---

## 🎯 문제의 본질: 이벤트 리스너 등록 순서

### 코드 실행 순서 분석

```javascript
// 1. 페이지 로드 시
document.addEventListener('DOMContentLoaded', () => {
  init();  // 여기서 initSearchFeature() 호출
});

// 2. initSearchFeature() 실행
function initSearchFeature() {
  // A. Input 이벤트 리스너 등록 (먼저)
  searchInput.addEventListener('input', (e) => {
    if (isNavigatingToResult) return;
    // 검색 로직...
  });

  // B. Click 이벤트 리스너 등록 (나중)
  searchResults.addEventListener('click', async (e) => {
    isNavigatingToResult = true;  // 플래그 설정
    // 클릭 처리...
  });
}
```

**핵심 문제**:
- 두 이벤트 리스너는 **같은 시점**에 등록됨
- 하지만 실행 순서는 **이벤트 발생 순서**에 따름

---

## 🐛 타이밍 시나리오 (첫 클릭)

### 시나리오 1: Click → Input 순서 (정상 케이스)

```
[사용자 클릭]
   ↓
click 이벤트 발생
   ↓
click 핸들러 실행 (동기)
   ↓
isNavigatingToResult = true ⭐
   ↓
await loadFile() (비동기로 전환)
   ↓
??? input 이벤트 발생
   ↓
input 핸들러 실행
   ↓
if (isNavigatingToResult) return; ✅ 무시됨
```

### 시나리오 2: Click + Input 동시 (문제 케이스) ⚠️

```
[사용자 클릭]
   ↓
click 이벤트 발생
click 핸들러 시작 (동기 부분만)
   ↓
isNavigatingToResult = true 설정 "대기 중" ⚠️
   ↓
??? 동시에 input 이벤트 큐에 추가됨
   ↓
이벤트 루프가 input 핸들러 먼저 실행 ⚠️
   ↓
isNavigatingToResult = false (아직) ⚠️
   ↓
검색 시작 → "Searching..." 표시 ⚠️
   ↓
300ms 후
   ↓
isNavigatingToResult = true (이제 설정됨, 하지만 늦음)
```

---

## 💡 왜 첫 번째만?

### 상태 차이

**첫 번째 클릭 전**:
- `isNavigatingToResult = false` (초기값)
- 검색 결과 DOM이 **막 생성**됨
- 클릭 이벤트 리스너가 **처음 실행**됨

**첫 번째 클릭 후**:
- `isNavigatingToResult`가 한 번 `true`였다가 `false`로 리셋됨
- 이후 클릭은 **이미 안정화된 상태**
- 플래그 설정이 충분히 빨리 동작

### 브라우저 최적화 차이

**첫 실행** (Cold Start):
- 이벤트 핸들러 코드 컴파일 (JIT)
- 메모리 할당
- 약간의 지연 가능

**이후 실행** (Warm):
- 이미 컴파일된 코드
- 최적화된 경로
- 빠른 실행

---

## 🔬 가설: 경쟁 조건 (Race Condition)

### 문제의 핵심

```javascript
// Click 이벤트 핸들러 (비동기 함수)
searchResults.addEventListener('click', async (e) => {
  // 1. 동기 코드
  const clickedItem = e.target.closest('.search-result-item');
  if (!clickedItem) return;
  e.preventDefault();
  e.stopPropagation();
  const path = clickedItem.dataset.path;

  // 2. 플래그 설정 (동기)
  isNavigatingToResult = true;  // ⭐ 여기까지는 동기

  // 3. try 블록 진입 (여전히 동기)
  try {
    // 4. await - 여기서 비동기로 전환 ⚠️
    await loadFile(...);
  }
});
```

**문제**:
- Line 1-2번은 **동기 실행**
- **하지만** 이벤트 루프에서 다른 이벤트가 먼저 큐에 있을 수 있음
- 특히 **input 이벤트가 이미 큐에 있으면** 먼저 실행될 수 있음

---

## ✅ 해결 방법

### 방법 1: Click 이벤트에서 즉시 input 차단 (임시)

```javascript
searchResults.addEventListener('click', async (e) => {
  const clickedItem = e.target.closest('.search-result-item');
  if (!clickedItem) return;

  e.preventDefault();
  e.stopPropagation();

  // IMMEDIATELY disable input
  searchInput.disabled = true;  // ⭐

  // ... navigate ...

  finally {
    setTimeout(() => {
      searchInput.disabled = false;  // ⭐ Re-enable
      isNavigatingToResult = false;
    }, 100);
  }
});
```

### 방법 2: Input 이벤트를 완전히 차단 (더 나은 방법) ⭐

```javascript
// Click 핸들러의 시작 부분에서 input 리스너 일시 제거
const tempInputHandler = null;

searchResults.addEventListener('click', async (e) => {
  // ...

  // Remove input listener temporarily
  searchInput.removeEventListener('input', inputHandler);

  // ... navigate ...

  // Re-add input listener
  searchInput.addEventListener('input', inputHandler);
});
```

**하지만 이것도 복잡함**

### 방법 3: 더 긴 지연으로 플래그 유지 (가장 간단) ⭐

```javascript
finally {
  setTimeout(() => {
    isNavigatingToResult = false;
  }, 500);  // 100ms → 500ms로 증가
}
```

**이유**:
- 300ms debounce + 여유 200ms = 500ms
- 모든 input 이벤트가 처리될 충분한 시간

---

## 🎯 추천 해결책

**현재 타이밍**:
- scrollToSearchTerm 후 50ms 대기
- finally에서 100ms 후 플래그 리셋
- **총 150ms** → 너무 짧을 수 있음

**개선된 타이밍**:
- scrollToSearchTerm 후 50ms 대기 (유지)
- finally에서 **400ms** 후 플래그 리셋
- **총 450ms** → debounce 300ms보다 길게

이렇게 하면 첫 번째 클릭에서도 안전함!

---

## 📋 수정 제안

```javascript
finally {
  // Reset flag after debounce period completes
  // 300ms debounce + 100ms buffer = 400ms
  setTimeout(() => {
    console.log('[DEBUG] Resetting isNavigatingToResult = false');
    isNavigatingToResult = false;
  }, 400);  // 100 → 400
}
```

---

## 디버그 로그 결과 예상

### 정상 케이스 (두 번째 클릭)
```
[DEBUG] Setting isNavigatingToResult = true (0ms)
[DEBUG] Navigating to: 2강.md matchIndex: 0
[DEBUG] Input event ignored - navigating to result (50ms)
[DEBUG] Resetting isNavigatingToResult = false (550ms)
```

### 문제 케이스 (첫 번째 클릭)
```
[DEBUG] Setting isNavigatingToResult = true (0ms)
[DEBUG] Input event triggered, query: 프롬프트 (5ms) ⚠️
  → Searching... 표시
[DEBUG] Navigating to: 1강.md matchIndex: 0 (10ms)
[DEBUG] Resetting isNavigatingToResult = false (250ms)
  → 검색 재실행 (debounce 305ms 후)
```

**차이점**: 첫 클릭에서는 플래그 설정 전에 input 이벤트가 발생!

---

## 최종 권장사항

타이밍을 **400ms**로 늘려서 안전하게 처리하는 것을 권장합니다.

사용자가 로그를 확인하여 정확한 타이밍을 파악한 후 최종 결정해주세요.
