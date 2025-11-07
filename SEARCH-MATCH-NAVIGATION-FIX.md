# 검색 매치별 네비게이션 구현

**일시**: 2025-11-05
**이슈**: 카드 클릭 시 항상 첫 번째 매치로만 이동
**해결**: 각 카드 클릭 시 해당 매치 위치로 정확히 이동

---

## 🐛 문제 정의

### 현상
- "프롬프트" 검색 → 1강.md에 48개 매치
- 카드 48개 표시됨
- **10번째 카드 클릭** → 파일 로드 ✅
- **하지만** 스크롤은 항상 **첫 번째 매치**로만 이동 ❌
- 사용자는 **10번째 매치** 위치로 가길 원함

### 기대 동작
- 1번째 카드 클릭 → 1번째 매치로 스크롤
- 10번째 카드 클릭 → 10번째 매치로 스크롤
- 48번째 카드 클릭 → 48번째 매치로 스크롤

---

## 🔍 원인 분석

### 기존 코드 문제

```javascript
// Before: scrollToSearchTerm(searchQuery)
function scrollToSearchTerm(searchQuery) {
  // ...

  // Find first matching text node
  let firstMatch = walker.nextNode();  // ⚠️ 항상 첫 번째만 찾음

  if (firstMatch) {
    // Scroll to first match
    firstMatch.parentElement.querySelector('.search-highlight')
      .scrollIntoView();
  }
}
```

**문제점**:
- `walker.nextNode()` 한 번만 호출 → 첫 번째 매치만 반환
- 어떤 카드를 클릭했는지 정보 없음
- matchIndex를 전달받지 않음

---

## ✅ 해결 방법

### 1. 각 카드에 매치 인덱스 저장

```javascript
// public/js/app.js:1941-1950
result.matches.forEach((match, idx) => {
  const contentDiv = document.createElement('div');
  contentDiv.className = 'search-result-content';
  contentDiv.dataset.matchIndex = idx;  // ⭐ 매치 인덱스 저장
  contentDiv.innerHTML = DOMPurify.sanitize(match.content, {
    ALLOWED_TAGS: ['mark'],
    ALLOWED_ATTR: []
  });
  matchesContainer.appendChild(contentDiv);
});
```

**효과**:
- 0번째 카드: `data-match-index="0"`
- 1번째 카드: `data-match-index="1"`
- 47번째 카드: `data-match-index="47"`

---

### 2. scrollToSearchTerm 함수 개선

```javascript
// public/js/app.js:2028-2090
function scrollToSearchTerm(searchQuery, matchIndex = 0) {
  const contentDiv = document.getElementById('markdown-content');
  if (!contentDiv) return;

  const regex = new RegExp(searchQuery, 'gi');

  // TreeWalker로 텍스트 노드 탐색
  const walker = document.createTreeWalker(/* ... */);

  // ⭐ 모든 매치를 찾아서 배열에 저장
  const matches = [];
  let node;
  while (node = walker.nextNode()) {
    matches.push(node);
  }

  // ⭐ matchIndex에 해당하는 매치 선택
  const targetMatch = matches[matchIndex] || matches[0];

  if (targetMatch) {
    // 해당 위치로 스크롤 + 하이라이트
    const parent = targetMatch.parentElement;
    const highlightedHTML = parent.innerHTML.replace(regex,
      (match) => `<mark class="search-highlight">${match}</mark>`
    );
    parent.innerHTML = highlightedHTML;

    const mark = parent.querySelector('.search-highlight');
    mark.scrollIntoView({ behavior: 'auto', block: 'center' });

    setTimeout(() => parent.innerHTML = originalHTML, 3000);
  }
}
```

**개선 사항**:
- 모든 매치를 찾아서 배열에 저장
- `matchIndex` 파라미터로 특정 매치 선택
- 기본값 0 (첫 번째 매치)

---

### 3. 이벤트 핸들러 개선

```javascript
// public/js/app.js:1983-2019
searchResults.addEventListener('click', async (e) => {
  // 클릭된 카드 확인
  const clickedCard = e.target.closest('.search-result-content');
  const clickedItem = e.target.closest('.search-result-item');

  if (!clickedItem) return;

  const path = clickedItem.dataset.path;
  const searchQuery = clickedItem.dataset.query;

  // ⭐ 클릭된 카드의 매치 인덱스 추출
  let matchIndex = 0;  // 기본값: 첫 번째
  if (clickedCard && clickedCard.dataset.matchIndex !== undefined) {
    matchIndex = parseInt(clickedCard.dataset.matchIndex);
  }

  // 파일 로드
  await loadFile(path, '', true);

  // ⭐ 특정 매치로 스크롤
  if (searchQuery) {
    await new Promise(resolve => setTimeout(resolve, 100));
    scrollToSearchTerm(searchQuery, matchIndex);  // 인덱스 전달
  }
});
```

**동작 방식**:
- 카드 클릭 → `clickedCard.dataset.matchIndex` 읽음
- 경로나 카운터 클릭 → 기본값 0 (첫 번째 매치)
- `scrollToSearchTerm(query, index)` 호출

---

### 4. 카드 클릭 가능 스타일 추가

```css
/* public/css/style.css:1182-1201 */
.search-result-content {
  padding: 0.6rem 0.8rem;
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 4px;
  cursor: pointer;  /* ⭐ 클릭 가능 표시 */
  transition: all 0.2s ease;
}

.search-result-content:hover {
  background: #e9ecef;
  border-color: #3498db;  /* ⭐ 파란 테두리 */
  transform: translateX(2px);  /* ⭐ 약간 이동 */
}
```

**시각적 피드백**:
- `cursor: pointer` - 마우스 커서가 손가락 모양
- 호버 시 파란 테두리 + 오른쪽으로 2px 이동
- 클릭 가능한 카드임을 명확히 표시

---

## 🧪 회귀 테스트 시나리오

### Test Case 1: 특정 매치로 스크롤 (핵심 기능) ⭐

```
1. http://localhost:3000 접속
2. 검색: "프롬프트"
3. 1강.md 결과에 48개 카드 표시 확인
4. **1번째 카드 클릭**
   → 1강.md 로드
   → 문서 맨 위쪽의 첫 번째 "프롬프트" 위치로 스크롤
   → 하이라이트 표시
5. **10번째 카드 클릭**
   → 같은 파일 (1강.md)
   → 10번째 "프롬프트" 위치로 스크롤 ⭐
   → 첫 번째가 아닌 10번째 매치임을 확인
6. **48번째 카드 클릭**
   → 문서 맨 아래쪽의 48번째 "프롬프트" 위치로 스크롤 ⭐
```

### Test Case 2: 다른 파일의 매치 테스트

```
1. 검색: "프롬프트"
2. **1강.md의 5번째 카드** 클릭
   → 1강.md 로드 + 5번째 매치로 스크롤
3. **2강.md의 3번째 카드** 클릭
   → 2강.md 로드 + 3번째 매치로 스크롤 ⭐
4. **3강.md의 1번째 카드** 클릭
   → 3강.md 로드 + 1번째 매치로 스크롤
```

### Test Case 3: 카드 hover 효과

```
1. 검색: "test"
2. 카드에 마우스 올리기
3. 확인사항:
   ✅ 커서가 pointer (손가락)로 변경
   ✅ 배경색 진해짐
   ✅ 파란 테두리 표시
   ✅ 약간 오른쪽으로 이동
```

### Test Case 4: 검색 패널 유지 (이전 기능)

```
1. 검색: "image"
2. 5번째 카드 클릭
3. 확인사항:
   ✅ 검색 패널 열린 상태
   ✅ 검색어 "image" 유지
   ✅ 검색 결과 목록 유지
4. 다른 파일의 3번째 카드 클릭
   ✅ 정상 작동
```

### Test Case 5: 경로/카운터 클릭 (기본 동작)

```
1. 검색: "doclight"
2. **파일 경로** (파란색 텍스트) 클릭
   → 첫 번째 매치로 이동 (기본값)
3. **매치 카운터** ("N matches in this file") 클릭
   → 첫 번째 매치로 이동 (기본값)
```

---

## 📊 동작 흐름도

```
사용자 클릭
    ↓
이벤트 버블링 → searchResults
    ↓
clickedCard = e.target.closest('.search-result-content')
    ↓
카드 클릭?
    ├─ Yes → matchIndex = clickedCard.dataset.matchIndex
    └─ No → matchIndex = 0 (기본값)
    ↓
loadFile(path)
    ↓
scrollToSearchTerm(query, matchIndex)
    ↓
모든 매치 찾기 (TreeWalker)
    ↓
matches[matchIndex] 선택
    ↓
해당 위치로 스크롤 + 하이라이트
```

---

## 🎯 구현 세부사항

### 매치 인덱스 매핑

**검색 API 응답**:
```json
{
  "results": [
    {
      "path": "1강.md",
      "matches": [
        { "line": 5, "content": "프롬프트 엔지니어링..." },   // idx: 0
        { "line": 7, "content": "프롬프트 구조..." },        // idx: 1
        { "line": 12, "content": "프롬프트를 작성할..." },   // idx: 2
        // ... 48개
      ]
    }
  ]
}
```

**DOM 구조**:
```html
<div class="search-result-item" data-path="1강.md" data-query="프롬프트">
  <div class="search-result-path">1강.md</div>
  <div class="search-matches-container">
    <div class="search-result-content" data-match-index="0">
      프롬프트 엔지니어링...
    </div>
    <div class="search-result-content" data-match-index="1">
      프롬프트 구조...
    </div>
    <div class="search-result-content" data-match-index="2">
      프롬프트를 작성할...
    </div>
    <!-- ... 48개 -->
  </div>
  <div class="search-match-count">48 matches in this file</div>
</div>
```

**클릭 처리**:
```javascript
// 10번째 카드 클릭
clickedCard.dataset.matchIndex = "9"  // 0-based
matchIndex = 9

// TreeWalker로 모든 매치 찾기
matches = [node0, node1, ..., node9, ..., node47]

// 10번째 매치 선택
targetMatch = matches[9]

// 해당 위치로 스크롤
targetMatch.scrollIntoView()
```

---

## 📁 수정된 파일

### 1. public/js/app.js

**Line 1944**: 각 카드에 매치 인덱스 저장
```javascript
contentDiv.dataset.matchIndex = idx;
```

**Line 2028**: scrollToSearchTerm 함수 시그니처 변경
```javascript
function scrollToSearchTerm(searchQuery, matchIndex = 0)
```

**Line 2054-2062**: 모든 매치 찾기 및 특정 매치 선택
```javascript
const matches = [];
let node;
while (node = walker.nextNode()) {
  matches.push(node);
}

const targetMatch = matches[matchIndex] || matches[0];
```

**Line 1985-2002**: 클릭된 카드의 인덱스 추출 및 전달
```javascript
const clickedCard = e.target.closest('.search-result-content');
let matchIndex = 0;
if (clickedCard && clickedCard.dataset.matchIndex !== undefined) {
  matchIndex = parseInt(clickedCard.dataset.matchIndex);
}
scrollToSearchTerm(searchQuery, matchIndex);
```

### 2. public/css/style.css

**Line 1194-1201**: 카드 클릭 가능 스타일
```css
.search-result-content {
  cursor: pointer;
  transition: all 0.2s ease;
}

.search-result-content:hover {
  border-color: #3498db;
  transform: translateX(2px);
}
```

---

## 🎨 사용자 경험 개선

### 시각적 피드백

**정적 상태**:
- 연한 회색 배경 (#f8f9fa)
- 얇은 회색 테두리 (#e9ecef)

**호버 상태**:
- 진한 회색 배경 (#e9ecef)
- **파란 테두리** (#3498db) ⭐
- **오른쪽으로 2px 이동** ⭐
- **커서: pointer** ⭐

**효과**:
- 각 카드가 독립적으로 클릭 가능함을 명확히 표시
- 어떤 카드를 클릭할지 쉽게 선택
- 일관된 상호작용 패턴

---

## 🔬 기술적 세부사항

### TreeWalker 최적화

**Before (비효율)**:
```javascript
let firstMatch = walker.nextNode();  // 첫 번째만 찾음
// 매번 TreeWalker를 새로 실행해야 N번째를 찾을 수 있음
```

**After (효율적)**:
```javascript
const matches = [];
let node;
while (node = walker.nextNode()) {
  matches.push(node);  // 모든 매치를 한 번에 찾음
}
const targetMatch = matches[matchIndex];  // O(1) 접근
```

**성능**:
- TreeWalker 한 번만 실행
- 배열 인덱스 접근은 O(1)
- 메모리: 노드 레퍼런스만 저장 (가벼움)

### 경계 조건 처리

```javascript
const targetMatch = matches[matchIndex] || matches[0];
```

- `matchIndex`가 범위를 벗어나면 → 첫 번째 매치로 폴백
- matches 배열이 비어있으면 → `undefined` (안전하게 처리)

---

## 🧪 수동 테스트 가이드

### 필수 테스트

```bash
# http://localhost:3000 접속

# Test 1: 특정 매치 위치로 스크롤
1. 검색: "프롬프트"
2. 1강.md 결과 확인 (48개 카드)
3. 첫 번째 카드 hover
   → 파란 테두리, 커서 pointer 확인
4. 첫 번째 카드 클릭
   → 문서 맨 위쪽의 "프롬프트" 위치로 이동
   → 하이라이트 확인
5. 열 번째 카드 클릭
   → 10번째 "프롬프트" 위치로 이동 ⭐
   → 스크롤 위치가 다른지 확인
6. 마지막 카드 클릭
   → 문서 맨 아래쪽의 "프롬프트" 위치로 이동 ⭐

# Test 2: 다른 파일의 특정 매치
1. 검색 유지 상태에서
2. 2강.md의 세 번째 카드 클릭
   → 2강.md 로드
   → 3번째 "프롬프트" 위치로 이동
3. 검색 패널 여전히 열려있는지 확인

# Test 3: 검색어 변경 후 테스트
1. 검색: "image"
2. 한글제목.md의 다섯 번째 카드 클릭
   → 5번째 "image" 위치로 이동
3. 하이라이트 3초 후 제거 확인
```

---

## 📋 예상 결과

### Before (v1.2)
```
"프롬프트" 검색 → 48개 카드
1번째 카드 클릭 → 1번째 매치 ✅
10번째 카드 클릭 → 1번째 매치 ❌ (항상 첫 번째)
48번째 카드 클릭 → 1번째 매치 ❌
```

### After (v1.3) ⭐
```
"프롬프트" 검색 → 48개 카드
1번째 카드 클릭 → 1번째 매치 ✅
10번째 카드 클릭 → 10번째 매치 ✅ ⭐
48번째 카드 클릭 → 48번째 매치 ✅ ⭐
```

---

## 🔍 디버깅 팁

### 브라우저 콘솔에서 확인

```javascript
// 카드의 매치 인덱스 확인
document.querySelectorAll('.search-result-content').forEach((card, i) => {
  console.log(`Card ${i}: matchIndex =`, card.dataset.matchIndex);
});

// 예상 출력:
// Card 0: matchIndex = 0
// Card 1: matchIndex = 1
// Card 2: matchIndex = 2
// ...
```

### 클릭 이벤트 디버깅

```javascript
// 임시로 이벤트 핸들러에 로그 추가
console.log('Clicked card matchIndex:', matchIndex);
console.log('Total matches found:', matches.length);
console.log('Target match:', targetMatch);
```

---

## 📊 개선 사항 총정리

| 기능 | Before | After |
|------|--------|-------|
| 카드 클릭 시 스크롤 | 항상 첫 번째 | 해당 매치 위치 ⭐ |
| matchIndex 저장 | 없음 | data-match-index ⭐ |
| scrollToSearchTerm | 첫 번째만 | N번째 매치 ⭐ |
| 카드 hover 피드백 | 배경만 변경 | 테두리+이동 ⭐ |
| 클릭 가능 표시 | 불명확 | cursor: pointer ⭐ |

---

## ✨ 최종 결과

이제 사용자는:
1. ✅ 검색 결과의 **모든 매치를 카드로 확인**
2. ✅ **원하는 카드를 클릭**
3. ✅ **정확히 그 매치 위치**로 이동
4. ✅ 검색 패널을 유지하며 **다른 매치도 계속 탐색**

**예시**:
- "프롬프트" 검색 → 1강.md 48개 매치
- 20번째 카드의 내용: "프롬프트 설계 시..."
- 클릭 → 문서에서 정확히 "프롬프트 설계 시..." 위치로 이동!

완벽한 검색 네비게이션 기능 구현 완료! 🎉
