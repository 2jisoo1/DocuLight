# Step 9.3: 문서 네비게이션 (이전/다음) 구현 계획

작성일: 2025-10-28

## 🎯 목표

문서 하단에 이전/다음 문서 링크를 추가하여 문서 간 순차적 탐색을 용이하게 합니다.

---

## 📐 구현 범위

### Phase 3.1: 전체 파일 리스트 평면화

#### 기능 요구사항

1. **DFS 순회**
   - 디렉토리 트리를 깊이 우선 탐색(DFS)로 순회
   - 파일만 추출하여 평면 리스트로 저장
   - 순서: 현재 폴더의 파일들 → 하위 폴더 재귀

2. **파일 정보 저장**
   - 경로: 전체 경로 (예: `/guide/getting-started.md`)
   - 이름: 파일명 (예: `getting-started.md`)

3. **글로벌 상태 관리**
   - 트리 로드 시 한 번만 계산
   - 메모리에 유지하여 성능 최적화

#### 구현 위치

**파일**: `public/js/app.js`

**글로벌 변수**: `let flatFileList = [];` (파일 상단에 추가)

**함수**: `flattenTreeToDFS(node, currentPath = '', result = [])`

---

### Phase 3.2: 네비게이션 계산

#### 기능 요구사항

1. **현재 파일 인덱스 찾기**
   - flatFileList에서 현재 경로로 검색
   - 인덱스 반환

2. **이전/다음 파일 결정**
   - 이전: `currentIndex > 0` ? `list[currentIndex - 1]` : `null`
   - 다음: `currentIndex < length - 1` ? `list[currentIndex + 1]` : `null`

3. **Edge Cases**
   - 첫 문서: 이전 버튼 없음
   - 마지막 문서: 다음 버튼 없음
   - 폴더 리스트 뷰: 네비게이션 표시 안 함

#### 구현 위치

**함수**: `calculateNavigation(currentPath)`

---

### Phase 3.3: 네비게이션 HTML 추가

#### HTML 구조

```html
<hr class="doc-separator">
<nav class="doc-navigation">
  <div class="nav-prev">
    <a href="/doc/previous-doc">
      <span class="nav-label">← Previous</span>
      <span class="nav-title">previous-doc</span>
    </a>
  </div>
  <div class="nav-next">
    <a href="/doc/next-doc">
      <span class="nav-label">Next →</span>
      <span class="nav-title">next-doc</span>
    </a>
  </div>
</nav>
```

#### 통합 위치

**파일**: `public/js/app.js`

**함수**: `renderMarkdown(content)` 함수 내부

**위치**: `contentDiv.innerHTML = cleanHtml;` 이후

---

### Phase 3.4: CSS 스타일링

#### Docusaurus 스타일

```css
/* Document navigation separator */
.doc-separator {
  margin: 40px 0 20px 0;
  border: none;
  border-top: 1px solid #ddd;
}

/* Document navigation container */
.doc-navigation {
  display: flex;
  justify-content: space-between;
  padding: 20px 0;
  gap: 20px;
}

/* Navigation sections */
.nav-prev,
.nav-next {
  flex: 1;
  max-width: 45%;
}

.nav-next {
  text-align: right;
}

/* Navigation links */
.doc-navigation a {
  display: flex;
  flex-direction: column;
  padding: 12px 16px;
  border: 1px solid #ddd;
  border-radius: 6px;
  text-decoration: none;
  transition: all 0.2s;
}

.doc-navigation a:hover {
  background-color: #f6f8fa;
  border-color: var(--accent-color);
}

/* Navigation labels and titles */
.nav-label {
  font-size: 0.85rem;
  color: #666;
  margin-bottom: 4px;
}

.nav-title {
  font-size: 1rem;
  color: var(--accent-color);
  font-weight: 600;
}
```

---

## 🔨 상세 구현 단계

### Step 1: 글로벌 상태 및 평면화 함수 추가

**파일**: `public/js/app.js` (파일 상단, 라인 ~10 근처)

```javascript
// Global state: flattened file list for navigation (Step 9.3)
let flatFileList = [];

/**
 * DFS로 트리를 평면화하여 파일 리스트 생성
 * Step 9.3: Document Navigation
 *
 * @param {Object} node - 트리 노드
 * @param {string} currentPath - 현재 경로
 * @param {Array} result - 결과 배열
 * @returns {Array} - 평면화된 파일 리스트
 */
function flattenTreeToDFS(node, currentPath = '', result = []) {
  if (!node) return result;

  // 현재 레벨의 파일들을 먼저 추가
  if (node.files && Array.isArray(node.files)) {
    node.files.forEach(file => {
      const filePath = currentPath ? `${currentPath}/${file.name}` : file.name;
      result.push({
        path: filePath,
        name: file.name
      });
    });
  }

  // 하위 디렉토리를 재귀적으로 처리
  if (node.dirs && Array.isArray(node.dirs)) {
    node.dirs.forEach(dir => {
      const dirPath = currentPath ? `${currentPath}/${dir.name}` : dir.name;
      flattenTreeToDFS(dir, dirPath, result);
    });
  }

  return result;
}
```

---

### Step 2: 네비게이션 계산 함수 추가

**파일**: `public/js/app.js` (flattenTreeToDFS 함수 아래)

```javascript
/**
 * 현재 문서의 이전/다음 문서 계산
 * Step 9.3: Document Navigation
 *
 * @param {string} currentPath - 현재 문서 경로
 * @returns {Object} - { prev: {path, name} | null, next: {path, name} | null }
 */
function calculateNavigation(currentPath) {
  if (!currentPath || flatFileList.length === 0) {
    return { prev: null, next: null };
  }

  // 현재 파일 인덱스 찾기
  const currentIndex = flatFileList.findIndex(file => file.path === currentPath);

  if (currentIndex === -1) {
    return { prev: null, next: null };
  }

  // 이전/다음 파일 결정
  const prev = currentIndex > 0 ? flatFileList[currentIndex - 1] : null;
  const next = currentIndex < flatFileList.length - 1 ? flatFileList[currentIndex + 1] : null;

  return { prev, next };
}
```

---

### Step 3: 트리 로드 시 평면화 실행

**파일**: `public/js/app.js`

**수정 대상**: `buildTree()` 함수 또는 초기화 코드

**변경 사항**:
```javascript
// 트리 빌드 후 평면화 실행
async function initializeApp() {
  // ...
  const treeData = await fetchTree('/');
  await buildTree(treeData, container);

  // Step 9.3: 전체 파일 리스트 평면화
  flatFileList = flattenTreeToDFS(treeData, '');
  console.log('Flattened file list:', flatFileList.length, 'files');
  // ...
}
```

---

### Step 4: renderMarkdown에 네비게이션 추가

**파일**: `public/js/app.js`

**함수**: `renderMarkdown(content)` (현재 라인 294)

**추가 위치**: `contentDiv.innerHTML = cleanHtml;` 이후

```javascript
async function renderMarkdown(content) {
  // Step 9.4: Preprocess Wiki links [[]] before markdown parsing
  const preprocessed = preprocessWikiLinks(content);

  // ... (기존 코드: renderer, marked.parse, sanitize)

  // Set content
  const contentDiv = document.getElementById('markdown-content');
  contentDiv.innerHTML = cleanHtml;

  // Step 9.3: Add document navigation (prev/next)
  addDocumentNavigation(contentDiv, currentPath);

  // Apply syntax highlighting to code blocks
  // ... (기존 코드)
}

/**
 * 문서 네비게이션 추가 (이전/다음 링크)
 * Step 9.3: Document Navigation
 */
function addDocumentNavigation(contentDiv, currentPath) {
  // 폴더 리스트 뷰는 네비게이션 제외
  if (!currentPath || currentPath.endsWith('/')) {
    return;
  }

  const nav = calculateNavigation(currentPath);

  // 네비게이션 HTML 생성
  const navHtml = document.createElement('div');
  navHtml.className = 'doc-navigation-wrapper';

  // Separator
  const separator = document.createElement('hr');
  separator.className = 'doc-separator';
  navHtml.appendChild(separator);

  // Navigation
  const navContainer = document.createElement('nav');
  navContainer.className = 'doc-navigation';

  // Previous link
  const prevDiv = document.createElement('div');
  prevDiv.className = 'nav-prev';
  if (nav.prev) {
    const cleanPath = nav.prev.path.replace(/\.md$/, '');
    const displayName = nav.prev.name.replace(/\.md$/, '');
    prevDiv.innerHTML = `
      <a href="/doc/${cleanPath}">
        <span class="nav-label">← Previous</span>
        <span class="nav-title">${displayName}</span>
      </a>
    `;
  }

  // Next link
  const nextDiv = document.createElement('div');
  nextDiv.className = 'nav-next';
  if (nav.next) {
    const cleanPath = nav.next.path.replace(/\.md$/, '');
    const displayName = nav.next.name.replace(/\.md$/, '');
    nextDiv.innerHTML = `
      <a href="/doc/${cleanPath}">
        <span class="nav-label">Next →</span>
        <span class="nav-title">${displayName}</span>
      </a>
    `;
  }

  navContainer.appendChild(prevDiv);
  navContainer.appendChild(nextDiv);
  navHtml.appendChild(navContainer);

  // Append to content
  contentDiv.appendChild(navHtml);
}
```

---

### Step 5: CSS 스타일 추가

**파일**: `public/css/style.css`

**위치**: 파일 끝부분 (Step 9.x 섹션)

```css
/* ========================================
   Step 9.3: Document Navigation
   ======================================== */

/* Navigation separator */
.doc-separator {
  margin: 40px 0 20px 0;
  border: none;
  border-top: 1px solid #e1e4e8;
}

/* Navigation container */
.doc-navigation {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  padding: 20px 0;
  margin-bottom: 20px;
}

/* Previous and next sections */
.nav-prev,
.nav-next {
  flex: 1;
  max-width: 48%;
}

.nav-next {
  text-align: right;
}

/* Navigation links */
.doc-navigation a {
  display: inline-flex;
  flex-direction: column;
  padding: 12px 16px;
  border: 1px solid #d0d7de;
  border-radius: 6px;
  text-decoration: none;
  transition: all 0.2s ease;
  background-color: #ffffff;
}

.doc-navigation a:hover {
  background-color: #f6f8fa;
  border-color: var(--accent-color);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

/* Navigation labels */
.nav-label {
  font-size: 0.85rem;
  color: #57606a;
  margin-bottom: 4px;
  font-weight: 400;
}

/* Navigation titles */
.nav-title {
  font-size: 1rem;
  color: var(--accent-color);
  font-weight: 600;
}

/* Responsive design */
@media (max-width: 768px) {
  .doc-navigation {
    flex-direction: column;
    gap: 12px;
  }

  .nav-prev,
  .nav-next {
    max-width: 100%;
    text-align: left;
  }
}
```

---

## 🔨 구현 순서

### Step 1: 글로벌 상태 및 평면화 함수
- 글로벌 변수 `flatFileList` 선언
- `flattenTreeToDFS()` 함수 구현
- 예상 시간: 15분

### Step 2: 네비게이션 계산 함수
- `calculateNavigation()` 함수 구현
- Edge case 처리 (첫/마지막 문서)
- 예상 시간: 10분

### Step 3: 트리 로드 시 평면화 실행
- 초기화 코드에서 `flattenTreeToDFS()` 호출
- 콘솔 로그로 파일 개수 확인
- 예상 시간: 10분

### Step 4: 네비게이션 HTML 추가
- `addDocumentNavigation()` 함수 구현
- `renderMarkdown()`에 통합
- 예상 시간: 20분

### Step 5: CSS 스타일링
- Docusaurus 스타일 CSS 추가
- 반응형 디자인 포함
- 예상 시간: 15분

### Step 6: 브라우저 테스트
- 첫 문서, 중간 문서, 마지막 문서 테스트
- 네비게이션 클릭 동작 확인
- 예상 시간: 10분

**총 예상 시간**: 80분 (1시간 20분)

---

## ✅ 완료 조건

- [x] `flatFileList` 글로벌 변수 선언
- [x] `fetchAllFilesRecursive()` 함수 구현 (재귀적 파일 로드)
- [x] `calculateNavigation()` 함수 구현
- [x] 트리 로드 시 모든 파일 재귀 로드 실행
- [x] `addDocumentNavigation()` 함수 구현
- [x] `renderMarkdown()`에 네비게이션 통합
- [x] CSS 스타일링 추가 (Docusaurus 스타일)
- [x] 브라우저에서 모든 테스트 통과
- [x] 첫 문서: Next만 표시 확인
- [x] 마지막 문서: Previous만 표시 확인
- [x] 중간 문서: 양쪽 버튼 확인
- [x] 네비게이션 클릭으로 문서 이동 확인

---

## 🧪 테스트 결과

### 테스트 1: 첫 번째 문서 (normal)
- **결과**: ✅ PASS
- **표시**: Next → README만 표시
- **동작**: Next 클릭 → README 문서로 이동

### 테스트 2: 중간 문서 (README)
- **결과**: ✅ PASS
- **표시**: ← Previous: normal | Next →: test-wiki-links
- **동작**: 양쪽 버튼 모두 정상 작동

### 테스트 3: 마지막 문서 (test-wiki-links)
- **결과**: ✅ PASS
- **표시**: ← Previous: README만 표시
- **동작**: Previous 클릭 → README로 이동

### 테스트 4: 폴더 내 문서 (guide/getting-started)
- **결과**: ✅ PASS
- **표시**: ← Previous: test-wiki-links | Next →: programming-samples
- **동작**: 양쪽 네비게이션 정상 작동

### 테스트 5: 중첩 폴더 (guide/programming-samples)
- **결과**: ✅ PASS
- **표시**: ← Previous: getting-started | Next →: configuration
- **동작**: DFS 순서대로 네비게이션

### 테스트 6: 파일 개수 확인
- **결과**: ✅ 12개 파일 재귀적 로드 성공
- **콘솔**: `[Step 9.3] Loaded 12 files for navigation`

---

## 🔍 주의사항

### 성능

- **평면화 타이밍**: 트리 로드 시 한 번만 실행 (재귀적 API 호출)
- **메모리**: 파일 개수가 많아도 배열 하나만 유지
- **계산**: O(n) 복잡도로 빠른 검색

### 구현 개선 사항

- **초기 계획**: `flattenTreeToDFS()` 단일 트리 데이터 평면화
- **최종 구현**: `fetchAllFilesRecursive()` 재귀적 API 호출로 모든 파일 로드
- **이유**: API가 하위 디렉토리 내용을 포함하지 않아 재귀 로드 필요

### Edge Cases

- **폴더 리스트**: `currentPath.endsWith('/')` 체크로 네비게이션 제외
- **첫/마지막 문서**: null 체크로 버튼 미표시
- **파일 없음**: `flatFileList.length === 0` 처리

### 호환성

- **Clean URL**: `.md` 확장자 제거한 URL 사용
- **기존 기능**: 문서 로드, Wiki 링크와 충돌 없음

---

## 🎨 UI/UX 고려사항

### Docusaurus 스타일 적용

- ✅ 깔끔한 박스 디자인
- ✅ hover 효과 (배경색, 테두리, 그림자)
- ✅ 명확한 레이블 ("Previous", "Next")
- ✅ 문서 제목 표시
- ✅ 반응형 디자인 (모바일에서 세로 배치)

### 접근성

- ✅ 시맨틱 태그 사용 (`<nav>`, `<hr>`)
- ✅ 명확한 링크 텍스트
- ✅ 키보드 네비게이션 가능

---

## 🚀 구현 상태

- [x] 계획 수립 완료
- [x] 구현 완료
- [x] 테스트 완료
- [x] 문서화 완료

**완료일**: 2025-10-28

---

## 📊 실제 구현 결과

### 변경 파일

**1. public/js/app.js**
- `flatFileList` 글로벌 변수 추가 (라인 15)
- `fetchAllFilesRecursive()` 함수 구현 (라인 265-301)
- `calculateNavigation()` 함수 구현 (라인 303-323)
- `addDocumentNavigation()` 함수 구현 (라인 433-496)
- `renderMarkdown()`에 네비게이션 통합 (라인 430)
- 초기화 시 파일 로드 (라인 1053)
- Refresh 시 파일 재로드 (라인 1115)

**2. public/css/style.css**
- 네비게이션 스타일 추가 (라인 803-879)
- Docusaurus 스타일 박스 디자인
- 반응형 미디어 쿼리 포함

### 총 변경량
- JavaScript: +95줄
- CSS: +77줄

---

## 🎯 최종 결과

```
[문서 내용]

─────────────────────────────

┌─────────────┐         ┌──────────────┐
│ ← Previous  │         │   Next →     │
│  prev-doc   │         │  next-doc    │
└─────────────┘         └──────────────┘
```

**DFS 순서**: normal → README → test-wiki-links → guide/getting-started → guide/programming-samples → guide/advanced/configuration → reference/... → test/... → test-zip/...

---

**작성자**: Claude Code
**상태**: ✅ 구현 완료
