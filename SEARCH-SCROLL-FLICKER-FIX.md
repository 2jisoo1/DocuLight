# 검색 스크롤 깜빡임 문제 해결

**일시**: 2025-11-05
**이슈**: 검색 결과 클릭 시 y=0으로 갔다가 다시 검색어 위치로 이동 (깜빡임)
**해결**: skipScroll 플래그 추가하여 불필요한 스크롤 초기화 방지

---

## 🐛 문제 정의

### 재현 단계
1. 검색창 오픈
2. "프롬프트" 검색
3. 아무 카드 클릭
4. **현상**:
   - 순간적으로 **문서 맨 위(y=0)**로 이동
   - 그 다음 **검색어 위치**로 다시 이동
   - **깜빡임** 효과로 사용자 경험 저해

### 시각적 효과
```
[검색 결과 클릭]
   ↓
[문서 로드] → scrollTop = 0  ⚠️
   ↓
[화면 깜빡] (맨 위로 순간 이동)
   ↓
[scrollToSearchTerm] → 검색어 위치로 이동
   ↓
[최종 위치] (하지만 깜빡임 발생)
```

---

## 🔍 원인 분석

### 코드 실행 흐름

```javascript
// 검색 결과 클릭 이벤트
searchResults.addEventListener('click', async (e) => {
  // ...
  await loadFile(path, '', true);  // hash = '' (빈 문자열)
  // ...
  scrollToSearchTerm(searchQuery, matchIndex);
});
```

↓

```javascript
// loadFile 함수 (public/js/app.js:1404)
async function loadFile(path, hash = '', updateUrl = true) {
  // ... 파일 로드 및 렌더링 ...

  // Line 1479-1505: 스크롤 처리
  if (hash) {
    // hash가 있으면 → 해당 섹션으로 스크롤
    targetElement.scrollIntoView();
  } else {
    // hash가 없으면 → 맨 위로 스크롤
    mainContent.scrollTop = 0;  // ⚠️ 여기서 문제 발생!
  }
}
```

**문제점**:
- 검색에서 호출 시 `hash = ''` (빈 문자열)
- `else` 블록 실행 → `scrollTop = 0`
- **이후** `scrollToSearchTerm()`으로 검색어 위치로 이동
- 결과: 0 → 검색어 위치로 **두 번 스크롤** (깜빡임)

---

## ✅ 해결 방법

### skipScroll 플래그 추가

#### 1. 함수 시그니처 변경

```javascript
// public/js/app.js:1404
// Before
async function loadFile(path, hash = '', updateUrl = true)

// After
async function loadFile(path, hash = '', updateUrl = true, skipScroll = false)
```

**새 파라미터**:
- `skipScroll`: `true`면 자동 스크롤 초기화 건너뜀
- 기본값: `false` (기존 동작 유지)

#### 2. 스크롤 초기화 조건 수정

```javascript
// public/js/app.js:1500-1505
// Before
} else {
  // No hash: scroll main-content to top
  if (mainContent) {
    mainContent.scrollTop = 0;  // 항상 실행
  }
}

// After
} else if (!skipScroll) {
  // No hash: scroll main-content to top (unless skipScroll is true)
  if (mainContent) {
    mainContent.scrollTop = 0;  // skipScroll이 false일 때만 실행
  }
}
```

**효과**:
- `skipScroll = false` → 기존처럼 맨 위로 스크롤 (일반 파일 클릭)
- `skipScroll = true` → 스크롤 초기화 건너뜀 (검색 결과 클릭)

#### 3. 검색 이벤트 핸들러 수정

```javascript
// public/js/app.js:2007
// Before
await loadFile(path, '', true);

// After
await loadFile(path, '', true, true);
//                      ↑     ↑
//                      |     skipScroll = true
//                      updateUrl = true
```

**파라미터 순서**:
1. `path`: 파일 경로
2. `hash`: 빈 문자열 (섹션 해시 없음)
3. `updateUrl`: `true` (URL 업데이트)
4. `skipScroll`: `true` ⭐ (스크롤 초기화 건너뜀)

---

## 🎯 실행 흐름 비교

### Before (깜빡임 발생)

```
[카드 클릭]
   ↓
loadFile(path, '', true)
   ↓
hash === '' → else 블록 실행
   ↓
mainContent.scrollTop = 0  ⚠️ (y=0으로 이동)
   ↓
[화면 깜빡]
   ↓
scrollToSearchTerm(query, idx)
   ↓
[검색어 위치로 이동]
```

**총 스크롤 횟수**: 2회 (0 → 검색어 위치)

### After (깜빡임 없음) ✅

```
[카드 클릭]
   ↓
loadFile(path, '', true, true)
                        ↑
                        skipScroll = true
   ↓
hash === '' AND skipScroll === true
   ↓
스크롤 초기화 건너뜀 ✅
   ↓
scrollToSearchTerm(query, idx)
   ↓
[검색어 위치로 바로 이동]
```

**총 스크롤 횟수**: 1회 (검색어 위치로만)

---

## 📋 수정 내용 요약

### public/js/app.js

**Line 1404**: 함수 시그니처에 `skipScroll` 플래그 추가
```javascript
async function loadFile(path, hash = '', updateUrl = true, skipScroll = false)
```

**Line 1500**: 조건문 수정 (skipScroll 체크)
```javascript
} else if (!skipScroll) {
```

**Line 2007**: 검색에서 호출 시 skipScroll=true 전달
```javascript
await loadFile(path, '', true, true);
```

---

## 🧪 회귀 테스트 시나리오

### Test Case 1: 검색 결과 클릭 (깜빡임 제거) ⭐

```
1. http://localhost:3000 접속
2. 검색: "프롬프트"
3. 아무 카드 클릭
4. 확인사항:
   ✅ 깜빡임 없이 바로 검색어 위치로 이동 ⭐
   ✅ 부드러운 사용자 경험
   ❌ 맨 위로 갔다가 다시 이동하는 현상 없음
```

### Test Case 2: 일반 파일 클릭 (기존 동작 유지)

```
1. 사이드바에서 일반 파일 클릭 (예: normal.md)
2. 확인사항:
   ✅ 문서 맨 위(y=0)로 스크롤 (기존 동작)
   ✅ skipScroll이 없으므로 기본값 false
```

### Test Case 3: 해시 링크 클릭 (기존 동작 유지)

```
1. 문서 내 heading 앵커 클릭 (🔗)
2. 확인사항:
   ✅ 해당 섹션으로 스크롤 (기존 동작)
   ✅ hash가 있으므로 else if 블록 실행 안 됨
```

### Test Case 4: 연속 검색 결과 클릭

```
1. 검색: "image"
2. 1번째 카드 클릭
   ✅ 깜빡임 없이 1번째 매치로 이동
3. 5번째 카드 클릭 (같은 파일)
   ✅ 깜빡임 없이 5번째 매치로 이동 ⭐
4. 다른 파일의 3번째 카드 클릭
   ✅ 깜빡임 없이 3번째 매치로 이동 ⭐
```

### Test Case 5: 뒤로 가기 버튼 (브라우저 히스토리)

```
1. 여러 검색 결과 클릭
2. 브라우저 뒤로 가기 버튼
3. 확인사항:
   ✅ 이전 문서로 이동
   ✅ 스크롤 위치 복원 (기존 기능)
```

---

## 🔬 기술적 세부사항

### loadFile 함수 파라미터 용도

| 파라미터 | 타입 | 기본값 | 용도 |
|----------|------|--------|------|
| `path` | string | (필수) | 로드할 파일 경로 |
| `hash` | string | `''` | 스크롤할 섹션 ID (예: `#intro`) |
| `updateUrl` | boolean | `true` | URL을 history에 추가할지 여부 |
| `skipScroll` | boolean | `false` | 자동 스크롤 초기화 건너뛸지 여부 ⭐ |

### 호출 패턴

**일반 파일 클릭** (사이드바):
```javascript
await loadFile('normal.md', '', true);
// skipScroll = false (기본값) → 맨 위로 스크롤
```

**섹션 링크 클릭** (TOC, 앵커):
```javascript
await loadFile('guide.md', 'intro', true);
// hash가 있음 → 해당 섹션으로 스크롤
```

**검색 결과 클릭** ⭐:
```javascript
await loadFile('1강.md', '', true, true);
// skipScroll = true → 스크롤 초기화 건너뜀
// → scrollToSearchTerm()이 스크롤 담당
```

**뒤로 가기**:
```javascript
await loadFile(state.path, state.hash, false);
// updateUrl = false → 스크롤 위치 복원
```

---

## 📊 성능 영향

### 스크롤 횟수 감소

**Before**:
```
loadFile: scrollTop = 0  (1회)
scrollToSearchTerm: scrollIntoView  (1회)
총: 2회 스크롤
```

**After**:
```
loadFile: (스크롤 없음)
scrollToSearchTerm: scrollIntoView  (1회)
총: 1회 스크롤 ⭐
```

**효과**:
- 렌더링 횟수 감소
- 부드러운 사용자 경험
- CPU 사용량 감소

---

## ✅ 검증 방법

### 브라우저 개발자 도구로 확인

```javascript
// 콘솔에 스크롤 이벤트 로그
const mainContent = document.querySelector('.main-content');
let scrollCount = 0;

mainContent.addEventListener('scroll', () => {
  console.log(`Scroll event ${++scrollCount}:`, mainContent.scrollTop);
});

// 검색 결과 클릭 후 확인
// Before: Scroll event 1: 0, Scroll event 2: 1234 (깜빡임)
// After: Scroll event 1: 1234 (깜빡임 없음) ⭐
```

### 네트워크 탭 확인

```
[검색 결과 클릭]
   ↓
GET /api/raw?path=1강.md (200 OK)
   ↓
[렌더링]
   ↓
[스크롤 1회만] ✅
```

---

## 🎉 최종 결과

### Before (v1.3)
- 검색 결과 클릭
- 0.1초간 맨 위 표시 (깜빡임) ⚠️
- 검색어 위치로 이동

### After (v1.4) ⭐
- 검색 결과 클릭
- **바로 검색어 위치로 이동** ✅
- **깜빡임 없음** ✅

---

## 📁 수정된 파일

```
public/js/app.js
  - Line 1404: skipScroll 플래그 추가
  - Line 1500: 조건문에 skipScroll 체크 추가
  - Line 2007: 검색 호출 시 skipScroll=true 전달
```

---

## 🔧 회귀 테스트 체크리스트

### 검색 기능
- [ ] 검색 결과 클릭 시 깜빡임 없음 ⭐
- [ ] 각 카드가 해당 매치로 정확히 이동
- [ ] 검색 패널 유지
- [ ] 연속 클릭 정상 작동

### 기존 기능 (회귀 방지)
- [ ] 일반 파일 클릭 시 맨 위로 스크롤 ✅
- [ ] TOC 클릭 시 해당 섹션으로 스크롤 ✅
- [ ] 앵커 링크 클릭 시 정상 작동 ✅
- [ ] 뒤로 가기 버튼 정상 작동 ✅

### 성능
- [ ] 스크롤 이벤트 1회만 발생
- [ ] 부드러운 사용자 경험
- [ ] CPU 사용량 정상

---

## 💡 추가 개선 사항

### 향후 고려사항

1. **프리로딩**: 검색 결과 hover 시 파일 미리 로드
2. **스크롤 위치 기억**: 같은 파일 재방문 시 이전 위치로
3. **애니메이션 옵션**: 사용자 설정으로 smooth/auto 선택 가능

---

## ✨ 요약

**문제**: 검색 결과 클릭 시 스크롤 깜빡임 (y=0 → 검색어 위치)

**원인**: loadFile에서 hash 없을 때 무조건 scrollTop = 0 실행

**해결**: skipScroll 플래그 추가
- 검색 호출: `loadFile(path, '', true, true)` → 초기화 건너뜀
- 일반 호출: `loadFile(path, '', true)` → 기존 동작 유지

**효과**: 깜빡임 없이 바로 검색어 위치로 이동! 🎉

---

## 🚀 테스트 방법

```bash
# http://localhost:3000 접속

1. 검색: "프롬프트"
2. 중간쯤 카드 (20번째) 클릭
3. 주의깊게 관찰:
   ❌ 맨 위로 깜빡이는 현상 없어야 함
   ✅ 바로 검색어 위치로 부드럽게 이동
```

**성공 기준**: 화면 깜빡임이 없고 즉시 정확한 위치로 이동
