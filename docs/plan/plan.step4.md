d# DocuLight Phase 4: 반응형 UI 및 사용자 설정

**작성일**: 2025-10-24
**우선순위**: P1
**예상 소요 시간**: 8-10시간

---

## 📋 목표

사용자 설정 기능과 반응형 UI를 추가하여 더 나은 사용자 경험을 제공합니다.

---

## 🎯 요구사항 상세

### 1. 사이드바 제목 설정 기능

**현재 상태**: 하드코딩된 "DocuLight" 제목

**변경 후**: 설정 파일에서 제목 변경 가능

#### 1.1 설정 파일 (config.json5)
```json5
{
  docsRoot: "/data/docs",
  apiKey: "secret123",

  // 새로 추가
  ui: {
    title: "My Documentation",  // 사이드바 제목
    icon: "/images/my-icon.png" // 아이콘 경로 (선택적)
  },

  // ... 기존 설정
}
```

#### 1.2 서버에서 설정 전달
```javascript
// src/app.js
app.get('/', (req, res) => {
  res.render('index', {
    title: 'DocuLight - Markdown Viewer',
    uiTitle: config.ui?.title || 'DocuLight',
    uiIcon: config.ui?.icon || '/images/icon.png'
  });
});
```

#### 1.3 EJS 템플릿 수정
```html
<!-- views/index.ejs -->
<div class="sidebar-header">
  <div class="sidebar-title">
    <% if (uiIcon) { %>
      <img src="<%= uiIcon %>" alt="icon" class="sidebar-icon">
    <% } %>
    <h1 title="<%= uiTitle %>"><%= uiTitle %></h1>
  </div>
  <button id="refresh-btn" class="icon-btn">...</button>
</div>
```

#### 1.4 CSS - 긴 제목 처리
```css
.sidebar-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  max-width: 180px;  /* 최대 너비 제한 */
  overflow: hidden;
}

.sidebar-icon {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
}

.sidebar-title h1 {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

---

### 2. 아이콘 설정

#### 2.1 기본 아이콘 생성
- **위치**: `public/images/icon.png`
- **크기**: 24x24px, 32x32px, 64x64px (다양한 크기)
- **형식**: PNG (투명 배경)

#### 2.2 브라우저 파비콘 (favicon)
```html
<!-- views/index.ejs -->
<head>
  <link rel="icon" type="image/png" href="<%= uiIcon %>">
</head>
```

#### 2.3 경로 처리 규칙

**절대 경로** (/ 로 시작):
- 예: `/images/icon.png`
- 처리: 웹 서버 public 디렉터리 기준

**상대 경로** (/ 없음 또는 . 으로 시작):
- 예: `images/icon.png`, `./assets/logo.png`, `../shared/icon.png`
- 처리: docsRoot 기준 상대 경로

**기본값**:
- 설정 없으면 `/images/icon.png` (절대 경로)

**구현**:
```javascript
function resolveIconPath(iconPath, docsRoot) {
  if (!iconPath) {
    return '/images/icon.png';  // 기본값
  }

  if (iconPath.startsWith('/')) {
    // 절대 경로 (public 디렉터리 기준)
    return iconPath;
  } else {
    // 상대 경로 (docsRoot 기준)
    // 서버에서 파일 읽어서 제공하거나
    // API 엔드포인트로 제공
    return `/api/icon?path=${encodeURIComponent(iconPath)}`;
  }
}
```

---

### 3. 모바일 반응형 (햄버거 메뉴)

#### 3.1 미디어 쿼리
```css
@media (max-width: 768px) {
  .sidebar {
    position: fixed;
    left: -280px;  /* 숨김 */
    transition: left 0.3s ease;
    z-index: 1000;
  }

  .sidebar.open {
    left: 0;  /* 표시 */
  }

  .mobile-overlay {
    display: none;
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 999;
  }

  .mobile-overlay.active {
    display: block;
  }
}
```

#### 3.2 햄버거 버튼
```html
<!-- 모바일에서만 표시 -->
<button id="mobile-menu-btn" class="mobile-menu-btn">
  <svg><!-- 햄버거 아이콘 --></svg>
</button>
```

#### 3.3 JavaScript 로직
```javascript
// 햄버거 버튼 클릭
document.getElementById('mobile-menu-btn').addEventListener('click', () => {
  sidebar.classList.add('open');
  overlay.classList.add('active');
});

// 오버레이 클릭 (메뉴 닫기)
overlay.addEventListener('click', () => {
  sidebar.classList.remove('open');
  overlay.classList.remove('active');
});

// 파일 선택 시 메뉴 닫기
loadFile() 함수에서:
if (window.innerWidth <= 768) {
  sidebar.classList.remove('open');
  overlay.classList.remove('active');
}

// 뒤로가기 버튼 시 메뉴 닫기
window.addEventListener('popstate', () => {
  if (window.innerWidth <= 768) {
    sidebar.classList.remove('open');
    overlay.classList.remove('active');
  }
});
```

---

### 4. 리사이저 (Resizer) - 사이드바 너비 조절

#### 4.1 HTML 구조
```html
<div class="container">
  <aside class="sidebar">...</aside>
  <div class="resizer"></div>  <!-- 리사이저 -->
  <main class="main-content">...</main>
</div>
```

#### 4.2 CSS
```css
.resizer {
  width: 4px;
  background: var(--border-color);
  cursor: col-resize;
  transition: background 0.2s;
  flex-shrink: 0;
}

.resizer:hover {
  background: var(--accent-color);
}

.resizer.resizing {
  background: var(--accent-color);
}
```

#### 4.3 JavaScript - 드래그 로직
```javascript
const resizer = document.querySelector('.resizer');
const sidebar = document.querySelector('.sidebar');
let isResizing = false;

resizer.addEventListener('mousedown', (e) => {
  isResizing = true;
  document.body.style.cursor = 'col-resize';
  resizer.classList.add('resizing');
});

document.addEventListener('mousemove', (e) => {
  if (!isResizing) return;

  const newWidth = e.clientX;

  // 최소/최대 너비 제한
  if (newWidth < 100) return;  // 최소 100px
  if (newWidth > window.innerWidth - 100) return;  // 뷰어 최소 100px

  sidebar.style.width = `${newWidth}px`;

  // LocalStorage에 저장
  localStorage.setItem('sidebarWidth', newWidth);
});

document.addEventListener('mouseup', () => {
  if (isResizing) {
    isResizing = false;
    document.body.style.cursor = '';
    resizer.classList.remove('resizing');
  }
});

// 초기화 시 저장된 너비 복원
const savedWidth = localStorage.getItem('sidebarWidth');
if (savedWidth) {
  sidebar.style.width = `${savedWidth}px`;
}
```

---

### 5. 사이드바 스크롤

**현재 상태**: 이미 구현됨 (`.tree-container { overflow-y: auto; }`)

**확인 사항**:
- 트리가 높이를 초과하면 스크롤바 표시
- 가로 스크롤 방지 (`overflow-x: hidden`)

---

### 6. 스크롤바 스타일링

#### 6.1 얇고 예쁜 스크롤바
```css
/* 사이드바 스크롤바 */
.tree-container::-webkit-scrollbar {
  width: 6px;  /* 더 얇게 */
}

.tree-container::-webkit-scrollbar-track {
  background: transparent;  /* 투명 */
}

.tree-container::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.2);  /* 반투명 회색 */
  border-radius: 3px;
}

.tree-container::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.3);  /* 호버 시 진하게 */
}

/* 뷰어 스크롤바 */
.markdown-content::-webkit-scrollbar {
  width: 6px;
}

.markdown-content::-webkit-scrollbar-track {
  background: transparent;
}

.markdown-content::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 3px;
}

.markdown-content::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.3);
}

/* Firefox 스크롤바 */
.tree-container,
.markdown-content {
  scrollbar-width: thin;
  scrollbar-color: rgba(0, 0, 0, 0.2) transparent;
}
```

---

## 📝 구현 체크리스트

### Step 1: 설정 파일 확장
- [ ] config.example.json5에 ui 섹션 추가
- [ ] config-loader.js에서 ui 설정 읽기
- [ ] 기본값 설정 (title: "DocuLight", icon: "/images/icon.png")

### Step 2: 서버에서 UI 설정 전달
- [ ] app.js에서 EJS에 uiTitle, uiIcon 전달
- [ ] /doc/* 라우트에도 동일 설정 전달

### Step 3: 사이드바 헤더 개선
- [ ] EJS 템플릿 수정 (아이콘 + 제목)
- [ ] CSS: 긴 제목 ... 처리
- [ ] 기본 아이콘 이미지 생성

### Step 4: 브라우저 파비콘
- [ ] EJS에 favicon link 추가
- [ ] 설정 아이콘 사용

### Step 5: 모바일 반응형
- [ ] 햄버거 버튼 HTML 추가
- [ ] 모바일 오버레이 추가
- [ ] 미디어 쿼리 CSS
- [ ] JavaScript 토글 로직
- [ ] 파일 선택/뒤로가기 시 메뉴 닫기

### Step 6: 리사이저 구현
- [ ] 리사이저 HTML 추가
- [ ] 리사이저 CSS
- [ ] 드래그 이벤트 JavaScript
- [ ] LocalStorage에 너비 저장
- [ ] 최소/최대 너비 제한

### Step 7: 스크롤바 스타일
- [ ] Webkit 스크롤바 스타일
- [ ] Firefox 스크롤바 스타일
- [ ] 사이드바 및 뷰어 모두 적용

---

## 🧪 테스트 시나리오

### 제목 설정
1. config.json5에서 title 변경
2. 서버 재시작
3. 브라우저 확인 → 새 제목 표시
4. 긴 제목 테스트 (30자 이상) → ... 표시 확인

### 아이콘 설정
1. config.json5에서 icon 경로 설정
2. 서버 재시작
3. 사이드바 헤더 아이콘 확인
4. 브라우저 탭 파비콘 확인

### 모바일 반응형
1. 브라우저 너비 768px 이하로 축소
2. 사이드바 숨김 확인
3. 햄버거 버튼 표시 확인
4. 햄버거 버튼 클릭 → 사이드바 표시
5. 오버레이 클릭 → 사이드바 숨김
6. 파일 선택 → 사이드바 자동 숨김

### 리사이저
1. 사이드바-뷰어 사이 선에 마우스 올리기
2. 커서 변경 (col-resize) 확인
3. 드래그하여 사이드바 너비 조절
4. 최소 너비 100px 제한 확인
5. 뷰어 최소 너비 100px 제한 확인
6. 페이지 새로고침 → 너비 유지 확인

### 스크롤바
1. 많은 파일/폴더 추가하여 트리 높이 초과
2. 얇은 스크롤바 표시 확인
3. 스크롤바 호버 → 색상 진하게 확인
4. 긴 문서 → 뷰어 스크롤바 확인

---

## 🔧 파일 변경 사항

### 수정할 파일

1. **config.example.json5**
   - ui 섹션 추가

2. **src/utils/config-loader.js**
   - ui 설정 읽기 및 기본값 설정

3. **src/app.js**
   - EJS에 uiTitle, uiIcon 전달

4. **src/views/index.ejs**
   - 사이드바 헤더 구조 변경
   - 햄버거 버튼 추가
   - 모바일 오버레이 추가
   - 리사이저 추가
   - 파비콘 링크 추가

5. **public/css/style.css**
   - 사이드바 제목 스타일
   - 모바일 미디어 쿼리
   - 햄버거 버튼 스타일
   - 리사이저 스타일
   - 스크롤바 스타일

6. **public/js/app.js**
   - 햄버거 메뉴 토글 로직
   - 리사이저 드래그 로직
   - LocalStorage 너비 저장/복원

### 생성할 파일

7. **public/images/icon.png**
   - 기본 아이콘 이미지

---

## 📊 예상 소요 시간

| 작업 | 예상 시간 |
|------|-----------|
| 설정 파일 및 제목 기능 | 1시간 |
| 아이콘 설정 및 파비콘 | 1시간 |
| 기본 아이콘 이미지 생성 | 0.5시간 |
| 모바일 반응형 UI | 2.5시간 |
| 리사이저 구현 | 2시간 |
| 스크롤바 스타일 | 1시간 |
| 테스트 및 디버깅 | 2시간 |
| **총계** | **10시간** |

---

## 🎯 완료 기준

### 기능 완료
- [ ] 설정 파일에서 제목 변경 가능
- [ ] 긴 제목 ... 처리
- [ ] 아이콘 설정 (상대/절대 경로)
- [ ] 브라우저 파비콘 표시
- [ ] 모바일에서 햄버거 메뉴
- [ ] 사이드바 토글 동작
- [ ] 리사이저로 너비 조절
- [ ] 너비 LocalStorage 저장
- [ ] 얇고 예쁜 스크롤바

### 품질 기준
- [ ] 반응형: 768px 이하 모바일 모드
- [ ] 터치 친화적 (햄버거 버튼 크기)
- [ ] 부드러운 애니메이션
- [ ] 최소 너비 제한 작동
- [ ] 크로스 브라우저 (Chrome, Firefox, Safari)

### 테스트 통과
- [ ] 데스크톱 모드
- [ ] 모바일 모드 (768px 이하)
- [ ] 태블릿 모드 (768px ~ 1024px)
- [ ] 리사이저 드래그
- [ ] 스크롤바 스타일

---

## 💡 기술적 고려사항

### LocalStorage vs IndexedDB
- **리사이저 너비**: LocalStorage (간단, 빠름)
- **트리 상태**: IndexedDB (이미 구현됨)

### 터치 이벤트
- 리사이저: `touchstart`, `touchmove`, `touchend` 추가
- 모바일 스와이프: 선택적 구현

### 성능
- 리사이저 드래그 중 throttle/debounce 고려
- 애니메이션 GPU 가속 (`transform` 사용)

---

## 🎨 UI 변경 사항

### Before (현재)
```
┌────────┬─────────────────┐
│DocuLight│ 문서 경로        │
├────────┼─────────────────┤
│ 트리   │                 │
│        │   뷰어           │
│        │                 │
```

### After (변경 후)
```
데스크톱:
┌────────┃─────────────────┐
│🎨 제목  │ 문서 경로        │  ← 아이콘 + 설정 제목
├────────┃─────────────────┤
│ 트리   ┃                 │  ← 리사이저 (드래그 가능)
│ (스크롤)┃   뷰어 (스크롤)   │  ← 얇은 스크롤바
│        ┃                 │

모바일:
┌─────────────────────────┐
│ ≡ (햄버거)  문서 경로     │
├─────────────────────────┤
│                         │
│      뷰어 (전체 너비)     │
│                         │

(사이드바는 슬라이드로 열림)
```

---

## 🚀 구현 우선순위

### Phase 4.1 (P0 - 필수)
1. 설정 파일 UI 섹션
2. 제목 및 아이콘 기능
3. 스크롤바 스타일

### Phase 4.2 (P1 - 중요)
4. 리사이저 구현
5. 모바일 반응형

---

## 🔍 참고 자료

### Responsive Design
- 미디어 쿼리: https://developer.mozilla.org/en-US/docs/Web/CSS/Media_Queries
- 모바일 우선 디자인

### Drag & Drop
- Mouse events: https://developer.mozilla.org/en-US/docs/Web/API/MouseEvent
- Touch events: https://developer.mozilla.org/en-US/docs/Web/API/Touch_events

### CSS Scrollbar
- Webkit scrollbar: https://developer.mozilla.org/en-US/docs/Web/CSS/::-webkit-scrollbar
- scrollbar-width: https://developer.mozilla.org/en-US/docs/Web/CSS/scrollbar-width

---

**작성자**: Claude Code
**버전**: 1.0
