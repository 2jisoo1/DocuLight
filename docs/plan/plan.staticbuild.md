# 정적 사이트 빌드 기능 구현 계획 (window.DOCS_MAP 방식)

**작성일**: 2025-11-07
**버전**: 2.0 (완전 개정)
**목표**: 전체 사이트를 정적 HTML로 빌드 (마크다운 포함, 검색 포함)
**핵심 아이디어**: window.DOCS_MAP에 모든 .md 저장 → 클라이언트 렌더링

---

## 📊 새로운 아키텍처

### 핵심 개념: window.DOCS_MAP

**기존 (동적 서버)**:
```javascript
// 브라우저
const md = await fetch('/api/raw?path=README.md');  // API 호출
const html = marked.parse(md);
```

**새로운 (정적)**:
```javascript
// 빌드 시 생성
window.DOCS_MAP = {
  'README.md': '# README\n\nThis is...',
  'guide/intro.md': '# Introduction\n...',
  // 모든 .md 파일 (25개)
};

// 브라우저
const md = window.DOCS_MAP['README.md'];  // 메모리에서 바로
const html = marked.parse(md);
```

**혁명적 장점**:
- ✅ API 호출 불필요 → 서버 불필요
- ✅ file:// 프로토콜 완벽 지원
- ✅ 오프라인 즉시 실행 (더블클릭)
- ✅ 기존 marked.js 코드 그대로 재사용

---

## 🎯 빌드 결과물 구조

```
doclight-static/
├── index.html                        # 메인 페이지 (현재와 동일)
├── data/
│   ├── docs-map.js                   # ⭐ window.DOCS_MAP 정의
│   └── tree-structure.json           # 트리 구조
├── docs/                             # ⭐ 원본 마크다운 (선택사항)
│   ├── README.md
│   ├── guide/
│   └── ...
├── lib/                              # JavaScript 라이브러리
│   ├── marked.min.js
│   ├── highlight.min.js
│   ├── mermaid.min.js
│   ├── purify.min.js
│   └── highlight-github.min.css
├── css/
│   └── style.css
├── js/
│   └── app.js                        # ⭐ 약간만 수정
└── images/
    └── ...
```

---

## 🔧 구현 상세

### data/docs-map.js 생성 예시

```javascript
// 빌드 스크립트가 생성
window.DOCS_MAP = {
  "README.md": `# DocLight Test Documentation

This is a test documentation set for DocLight.

## Features
- Markdown rendering
- Tree navigation
- Mermaid diagrams`,

  "guide/getting-started.md": `# Getting Started

Welcome to DocLight!

## Installation
...`,

  "프롬프트 강의/1강.md": `# 1강. 프롬프트 구조와 기능 탐구

## 목표와 개요
...`

  // ... 25개 모두
};

// 트리 구조도 함께 포함 (선택)
window.TREE_STRUCTURE = {
  "dirs": [...],
  "files": [...]
};
```

**크기 예상**:
- 844KB 마크다운 → ~900KB JavaScript (이스케이프 포함)
- GZIP 압축: ~300KB
- 전혀 문제없음!

---

## 📋 Phase별 구현 단계 (초세밀 분할)

### Phase 1: 빌드 스크립트 기초 (2시간)

#### Phase 1.1: 빌드 엔드포인트 생성 (30분)

**파일**: `src/controllers/build-controller.js` (새 파일)

```javascript
async function buildStaticSite(req, res, next) {
  try {
    const { config, logger } = req.app.locals;

    logger.info('Static build started');

    // 여기서 빌드 로직 호출 (Phase 1.2에서 구현)
    const zipStream = await generateStaticSite(config, logger);

    res.attachment('doclight-static.zip');
    zipStream.pipe(res);

    logger.info('Static build completed');
  } catch (error) {
    next(error);
  }
}

module.exports = { buildStaticSite };
```

**라우트 추가**: `src/routes/api.js`
```javascript
const { buildStaticSite } = require('../controllers/build-controller');
router.post('/build-static', buildStaticSite);
```

**성공 기준**:
- ✅ POST /api/build-static 응답 200
- ✅ 로그 기록됨



---

#### Phase 1.2: 마크다운 파일 수집 (30분)

**파일**: `src/services/static-builder.js` (새 파일)

```javascript
const fs = require('fs').promises;
const path = require('path');

async function getAllMarkdownFiles(docsRoot, relativePath = '') {
  const files = [];
  const absolutePath = path.join(docsRoot, relativePath);
  const entries = await fs.readdir(absolutePath, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;

    const entryRelativePath = path.join(relativePath, entry.name);
    const entryAbsolutePath = path.join(absolutePath, entry.name);

    if (entry.isDirectory()) {
      // 재귀적으로 하위 디렉토리 탐색
      const subFiles = await getAllMarkdownFiles(docsRoot, entryRelativePath);
      files.push(...subFiles);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push({
        name: entry.name,
        relativePath: entryRelativePath.replace(/\\/g, '/'),
        absolutePath: entryAbsolutePath
      });
    }
  }

  return files;
}

module.exports = { getAllMarkdownFiles };
```

**테스트**:
```javascript
const files = await getAllMarkdownFiles('/path/to/test-source');
console.log(files.length);  // 25
console.log(files[0]);      // { name: 'README.md', relativePath: 'README.md', ... }
```

**성공 기준**:
- ✅ 25개 파일 모두 수집
- ✅ 상대 경로 정확
- ✅ 계층 구조 유지



---

#### Phase 1.3: window.DOCS_MAP 생성 (1시간)

**파일**: `src/services/static-builder.js` (계속)

```javascript
async function generateDocsMapJS(docsRoot) {
  const files = await getAllMarkdownFiles(docsRoot);

  let jsCode = '// Auto-generated: All markdown documents\n';
  jsCode += 'window.DOCS_MAP = {\n';

  for (const file of files) {
    // 파일 읽기
    const content = await fs.readFile(file.absolutePath, 'utf-8');

    // 백틱 이스케이프 (중요!)
    const escaped = content
      .replace(/\\/g, '\\\\')    // \ → \\
      .replace(/`/g, '\\`')      // ` → \`
      .replace(/\${/g, '\\${');  // ${ → \${

    // 경로를 키로, 내용을 값으로
    jsCode += `  "${file.relativePath}": \`${escaped}\`,\n`;
  }

  jsCode += '};\n\n';

  // 파일 개수 정보 추가
  jsCode += `window.DOCS_COUNT = ${files.length};\n`;
  jsCode += `console.log('[Static Build] ${files.length} documents loaded');\n`;

  return jsCode;
}
```

**성공 기준**:
- ✅ 올바른 JavaScript 문법
- ✅ 백틱 이스케이프 정확
- ✅ 모든 파일 포함
- ✅ 브라우저 콘솔 에러 없음



---

### Phase 2: 트리 구조 생성 (1.5시간)

#### Phase 2.1: 트리 데이터 빌드 (45분)

**파일**: `src/services/tree-generator.js` (새 파일)

```javascript
async function buildTreeStructure(docsRoot) {
  // 기존 tree-controller.js 로직 재사용
  const tree = {
    dirs: [],
    files: []
  };

  const entries = await fs.readdir(docsRoot, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;

    if (entry.isDirectory()) {
      const subTree = await buildTreeStructure(path.join(docsRoot, entry.name));
      tree.dirs.push({
        name: entry.name,
        ...subTree
      });
    } else if (entry.name.endsWith('.md')) {
      const stats = await fs.stat(path.join(docsRoot, entry.name));
      tree.files.push({
        name: entry.name,
        size: stats.size
      });
    }
  }

  return tree;
}
```

**성공 기준**:
- ✅ 계층 구조 정확
- ✅ JSON 형식 올바름
- ✅ 25개 파일 모두 포함



---

#### Phase 2.2: DFS 파일 목록 생성 (45분)

**파일**: `src/services/tree-generator.js` (계속)

```javascript
function flattenTreeDFS(tree, parentPath = '') {
  const files = [];

  // 폴더 우선 (DFS)
  for (const dir of tree.dirs) {
    const dirPath = parentPath ? `${parentPath}/${dir.name}` : dir.name;
    const subFiles = flattenTreeDFS(dir, dirPath);
    files.push(...subFiles);
  }

  // 현재 레벨 파일
  for (const file of tree.files) {
    const filePath = parentPath ? `${parentPath}/${file.name}` : file.name;
    files.push({
      path: filePath,
      name: file.name
    });
  }

  return files;
}

// 이전/다음 링크 정보 추가
function addNavigationInfo(fileList) {
  return fileList.map((file, index) => ({
    ...file,
    prev: index > 0 ? fileList[index - 1].path : null,
    next: index < fileList.length - 1 ? fileList[index + 1].path : null
  }));
}
```

**성공 기준**:
- ✅ DFS 순서 정확 (현재 사이드바 순서와 동일)
- ✅ prev/next 정확



---

### Phase 3: ZIP 압축 로직 (1시간)

#### Phase 3.1: Archiver 설정 (15분)

**파일**: `src/services/static-builder.js` (계속)

```javascript
const archiver = require('archiver');

async function generateStaticSite(config, logger) {
  const archive = archiver('zip', {
    zlib: { level: 9 }  // 최대 압축
  });

  // 에러 핸들링
  archive.on('error', (err) => {
    logger.error('Archive error', { error: err.message });
    throw err;
  });

  archive.on('warning', (err) => {
    if (err.code !== 'ENOENT') {
      logger.warn('Archive warning', { error: err.message });
    }
  });

  // 진행률 로깅
  archive.on('progress', (progress) => {
    logger.info('Archive progress', {
      entries: progress.entries.processed,
      bytes: progress.fs.processedBytes
    });
  });

  return archive;
}
```

**성공 기준**:
- ✅ Archive 객체 생성
- ✅ 에러 핸들링 작동



---

#### Phase 3.2: 파일 추가 로직 (45분)

```javascript
async function generateStaticSite(config, logger) {
  const archive = archiver('zip', { zlib: { level: 9 } });

  // 1. window.DOCS_MAP 생성 및 추가
  const docsMapJS = await generateDocsMapJS(config.docsRoot);
  archive.append(docsMapJS, { name: 'data/docs-map.js' });

  // 2. 트리 구조 생성 및 추가
  const tree = await buildTreeStructure(config.docsRoot);
  const treeJSON = JSON.stringify(tree, null, 2);
  archive.append(treeJSON, { name: 'data/tree-structure.json' });

  // 3. 네비게이션 정보 생성
  const fileList = flattenTreeDFS(tree);
  const navInfo = addNavigationInfo(fileList);
  const navJSON = JSON.stringify(navInfo, null, 2);
  archive.append(navJSON, { name: 'data/navigation.json' });

  // 4. 정적 리소스 추가
  archive.directory('public/lib/', 'lib/');
  archive.directory('public/css/', 'css/');
  archive.directory('public/images/', 'images/');

  // 5. 마크다운 원본 추가 (선택사항, 편집 가능하게)
  archive.directory(config.docsRoot, 'docs/');

  // 6. index.html 생성 (Phase 4에서 구현)
  const indexHtml = await generateIndexHTML(config);
  archive.append(indexHtml, { name: 'index.html' });

  // 7. app.js 수정본 추가 (Phase 5에서 구현)
  const appJS = await generateStaticAppJS();
  archive.append(appJS, { name: 'js/app.js' });

  await archive.finalize();
  return archive;
}
```

**성공 기준**:
- ✅ 모든 파일 추가됨
- ✅ ZIP 구조 정확



---

### Phase 4: index.html 생성 (1시간)

#### Phase 4.1: 현재 index.ejs 복사 및 수정 (30분)

**작업**:
1. `src/views/index.ejs` 읽기
2. EJS 변수 처리 (title, uiIcon 등)
3. data/docs-map.js 로드 추가
4. 검색 API 관련 제거 (실제 제거는 app.js에서)

```javascript
async function generateIndexHTML(config) {
  // EJS 템플릿 읽기
  let html = await fs.readFile('src/views/index.ejs', 'utf-8');

  // EJS 변수 치환
  html = html.replace(/<%= title %>/g, config.ui?.title || 'DocLight');
  html = html.replace(/<%= uiIcon %>/g, config.ui?.icon || '/images/icon.png');
  html = html.replace(/<%= uiMaxWidth %>/g, config.ui?.maxWidth || '1200px');
  html = html.replace(/<%= uiTitle %>/g, config.ui?.title || 'DOCU LIGHT');

  // docs-map.js 로드 추가 (head에)
  html = html.replace(
    '</head>',
    '  <script src="data/docs-map.js"></script>\n</head>'
  );

  return html;
}
```

**성공 기준**:
- ✅ 유효한 HTML
- ✅ 모든 변수 치환됨
- ✅ docs-map.js 로드됨



---

#### Phase 4.2: 불필요한 요소 제거 (30분)

```javascript
// cheerio 사용 (HTML 파싱)
const cheerio = require('cheerio');

function cleanStaticHTML(html) {
  const $ = cheerio.load(html);

  // 파일 관리 버튼 제거
  $('#refresh-btn').remove();

  // API 의존 기능은 JavaScript에서 처리할 것이므로 유지
  // 검색 UI는 유지 (클라이언트 검색으로 전환)

  return $.html();
}
```

**성공 기준**:
- ✅ 불필요한 UI 제거
- ✅ HTML 구조 유지



---

### Phase 5: app.js 수정 (2시간)

#### Phase 5.1: fetchRaw 함수 수정 (30분)

**파일**: `public/js/app.js`

```javascript
// Before (API 호출)
async function fetchRaw(path) {
  const response = await fetchWithRetry(`/api/raw?path=${encodeURIComponent(path)}`);
  return await response.text();
}

// After (정적 버전 - 호환성 유지)
async function fetchRaw(path) {
  // 1. window.DOCS_MAP에서 먼저 찾기
  if (window.DOCS_MAP && window.DOCS_MAP[path]) {
    return window.DOCS_MAP[path];
  }

  // 2. Fallback: API 호출 (동적 서버용)
  if (window.location.protocol !== 'file:') {
    const response = await fetchWithRetry(`/api/raw?path=${encodeURIComponent(path)}`);
    return await response.text();
  }

  // 3. file:// 프로토콜에서 docs/ 읽기 시도
  try {
    const response = await fetch(`docs/${path}`);
    if (response.ok) {
      return await response.text();
    }
  } catch (e) {}

  throw new Error(`Document not found: ${path}`);
}
```

**성공 기준**:
- ✅ 정적에서 작동
- ✅ 동적에서도 여전히 작동 (하위 호환)



---

#### Phase 5.2: fetchTree 함수 수정 (30분)

```javascript
// Before
async function fetchTree(path = '/') {
  const response = await fetchWithRetry(`/api/tree?path=${encodeURIComponent(path)}`);
  return await response.json();
}

// After
async function fetchTree(path = '/') {
  // 1. window.TREE_STRUCTURE 사용
  if (window.TREE_STRUCTURE) {
    return getSubTree(window.TREE_STRUCTURE, path);
  }

  // 2. data/tree-structure.json 로드 (최초 1회)
  if (!window._treeCache) {
    try {
      const response = await fetch('data/tree-structure.json');
      window._treeCache = await response.json();
      return getSubTree(window._treeCache, path);
    } catch (e) {}
  }

  // 3. Fallback: API 호출
  if (window.location.protocol !== 'file:') {
    const response = await fetchWithRetry(`/api/tree?path=${encodeURIComponent(path)}`);
    return await response.json();
  }

  throw new Error('Tree structure not found');
}

// 헬퍼 함수
function getSubTree(tree, path) {
  if (path === '/' || !path) return tree;

  const parts = path.split('/').filter(p => p);
  let current = tree;

  for (const part of parts) {
    const dir = current.dirs.find(d => d.name === part);
    if (!dir) return { dirs: [], files: [] };
    current = dir;
  }

  return current;
}
```

**성공 기준**:
- ✅ 트리 로드 정상
- ✅ 하위 디렉토리 탐색 가능



---

#### Phase 5.3: 검색 함수 수정 (1시간)

**파일**: `public/js/app.js`

```javascript
// Before
async function fetchSearch(query, limit = 50) {
  const response = await fetchWithRetry(`/api/search?query=${encodeURIComponent(query)}&limit=${limit}`);
  return await response.json();
}

// After
async function fetchSearch(query, limit = 50) {
  // 1. window.DOCS_MAP에서 검색
  if (window.DOCS_MAP) {
    return searchInDocsMap(query, limit);
  }

  // 2. Fallback: API 호출
  if (window.location.protocol !== 'file:') {
    const response = await fetchWithRetry(`/api/search?query=${encodeURIComponent(query)}&limit=${limit}`);
    return await response.json();
  }

  throw new Error('Search not available');
}

// 클라이언트 검색 구현
function searchInDocsMap(query, limit = 50) {
  const results = [];
  const regex = new RegExp(query, 'gi');

  for (const [path, content] of Object.entries(window.DOCS_MAP)) {
    const lines = content.split('\n');
    const matches = [];

    // 파일명 매칭
    if (path.toLowerCase().includes(query.toLowerCase())) {
      matches.push({
        line: 0,
        content: `<mark>Filename match: ${path}</mark>`,
        priority: 'filename'
      });
    }

    // 내용 매칭
    lines.forEach((line, idx) => {
      if (regex.test(line)) {
        const highlighted = line.replace(regex, (match) => `<mark>${match}</mark>`);
        matches.push({
          line: idx + 1,
          content: highlighted.substring(0, 100),
          priority: 'content'
        });

        if (matches.length >= 50) return;
      }
    });

    if (matches.length > 0) {
      results.push({
        path: path,
        name: path.split('/').pop(),
        matches: matches
      });
    }

    if (results.length >= limit) break;
  }

  return {
    query: query,
    total: results.length,
    results: results
  };
}
```

**성공 기준**:
- ✅ 검색 결과 형식 동일 (기존 API와)
- ✅ 하이라이팅 작동
- ✅ 파일명/내용 모두 검색



---

### Phase 6: UI 통합 (2시간)

#### Phase 6.1: 다운로드 버튼 UI 추가 (45분)

**파일**: `src/views/index.ejs`

**위치**: `toc-toggle-btn` 좌측 (content-header 내부)

```html
<!-- content-header 수정 -->
<div class="content-header">
  <button id="mobile-menu-btn" class="mobile-menu-btn" aria-label="Toggle menu">
    <!-- ... -->
  </button>
  <div class="breadcrumb" id="breadcrumb">
    <span>Select a document</span>
  </div>
  <!-- ⭐ 새로 추가: 정적 빌드 다운로드 버튼 -->
  <button id="download-static-btn" class="header-icon-btn" title="Download Static Site" aria-label="Download static site">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
      <polyline points="7 10 12 15 17 10"></polyline>
      <line x1="12" y1="15" x2="12" y2="3"></line>
    </svg>
  </button>
  <!-- TOC Toggle Button (기존) -->
  <button id="toc-toggle-btn" class="toc-toggle-btn" title="Table of Contents" aria-label="Toggle table of contents">
    <img src="/images/toc-icon.svg" alt="TOC" width="16" height="16">
  </button>
</div>
```

**CSS**: `public/css/style.css`
```css
/* Download static site button - same size as toc-toggle-btn */
#download-static-btn {
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: background-color 0.2s;
  margin-right: 0.5rem;  /* Space before TOC button */
}

#download-static-btn:hover {
  background-color: rgba(0, 0, 0, 0.05);
}

#download-static-btn svg {
  color: var(--text-primary);
}

#download-static-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Loading spinner for download button */
#download-static-btn.loading svg {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
```

**성공 기준**:
- ✅ 버튼이 TOC 버튼 좌측에 표시
- ✅ 동일한 크기 (32x32px)
- ✅ Hover 효과
- ✅ 아이콘 렌더링



---

#### Phase 6.2: 캐싱 로직 추가 (30분)

**파일**: `src/services/static-builder.js` (새 함수)

**핵심 아이디어**: 파일 변경 감지 → 캐시 재사용

```javascript
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

/**
 * Generate hash from all file metadata (mtime + size)
 * This hash represents the current state of all documents
 */
async function generateContentHash(docsRoot) {
  const files = await getAllMarkdownFiles(docsRoot);

  // 모든 리소스 파일도 포함
  const resourceDirs = [
    'public/lib',
    'public/css',
    'public/js',
    'public/images',
    path.join(docsRoot, '../images')  // docs 내 이미지
  ];

  const allFiles = [...files];

  // 리소스 파일 수집
  for (const dir of resourceDirs) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true, recursive: true });
      for (const entry of entries) {
        if (entry.isFile()) {
          allFiles.push({
            absolutePath: path.join(dir, entry.name)
          });
        }
      }
    } catch (e) {
      // 디렉토리 없으면 무시
    }
  }

  // 각 파일의 mtime + size 수집
  const metadata = [];
  for (const file of allFiles) {
    try {
      const stats = await fs.stat(file.absolutePath);
      metadata.push({
        path: file.absolutePath,
        mtime: stats.mtimeMs,
        size: stats.size
      });
    } catch (e) {}
  }

  // mtime + size를 정렬하여 일관성 확보
  metadata.sort((a, b) => a.path.localeCompare(b.path));

  // 해시 생성
  const hashInput = metadata.map(m => `${m.path}:${m.mtime}:${m.size}`).join('|');
  const hash = crypto.createHash('sha256').update(hashInput).digest('hex');

  return {
    hash,
    fileCount: allFiles.length,
    totalSize: metadata.reduce((sum, m) => sum + m.size, 0)
  };
}

// 캐시 저장 위치
const CACHE_DIR = path.join(__dirname, '../../.cache/static-builds');
const CACHE_INFO_FILE = path.join(CACHE_DIR, 'cache-info.json');

/**
 * Check if cached build exists and is valid
 */
async function getCachedBuild(contentHash) {
  try {
    // 캐시 정보 읽기
    const cacheInfo = JSON.parse(await fs.readFile(CACHE_INFO_FILE, 'utf-8'));

    if (cacheInfo.hash === contentHash) {
      const zipPath = path.join(CACHE_DIR, `${contentHash}.zip`);

      // ZIP 파일 존재 확인
      await fs.access(zipPath);

      return {
        exists: true,
        zipPath: zipPath,
        cachedAt: cacheInfo.cachedAt
      };
    }
  } catch (e) {
    // 캐시 없음
  }

  return { exists: false };
}

/**
 * Save built ZIP to cache
 */
async function saveBuildToCache(contentHash, zipBuffer) {
  // 캐시 디렉토리 생성
  await fs.mkdir(CACHE_DIR, { recursive: true });

  const zipPath = path.join(CACHE_DIR, `${contentHash}.zip`);

  // ZIP 저장
  await fs.writeFile(zipPath, zipBuffer);

  // 캐시 정보 저장
  const cacheInfo = {
    hash: contentHash,
    cachedAt: new Date().toISOString(),
    zipPath: zipPath
  };
  await fs.writeFile(CACHE_INFO_FILE, JSON.stringify(cacheInfo, null, 2));

  return zipPath;
}
```

**성공 기준**:
- ✅ 해시 생성 정확 (모든 파일 반영)
- ✅ 캐시 저장/로드 작동
- ✅ 파일 변경 시 다른 해시 생성



---

#### Phase 6.3: 빌드 API에 캐싱 통합 (45분)

**파일**: `src/controllers/build-controller.js`

```javascript
const { generateContentHash, getCachedBuild, saveBuildToCache } = require('../services/static-builder');

async function buildStaticSite(req, res, next) {
  try {
    const { config, logger } = req.app.locals;

    logger.info('Static build requested');

    // 1. 현재 콘텐츠 해시 생성
    const { hash, fileCount, totalSize } = await generateContentHash(config.docsRoot);

    logger.info('Content hash generated', {
      hash: hash.substring(0, 8) + '...',
      fileCount,
      totalSize
    });

    // 2. 캐시 확인
    const cached = await getCachedBuild(hash);

    if (cached.exists) {
      logger.info('Using cached build', {
        hash: hash.substring(0, 8) + '...',
        cachedAt: cached.cachedAt
      });

      // 캐시된 ZIP 전송
      res.attachment('doclight-static.zip');
      const fileStream = fs.createReadStream(cached.zipPath);
      fileStream.pipe(res);
      return;
    }

    // 3. 새로 빌드
    logger.info('Building new static site');

    const archive = await generateStaticSite(config, logger);

    // 4. 메모리에 버퍼링 (캐시 저장 위해)
    const chunks = [];
    archive.on('data', (chunk) => chunks.push(chunk));

    await new Promise((resolve, reject) => {
      archive.on('end', resolve);
      archive.on('error', reject);
    });

    const zipBuffer = Buffer.concat(chunks);

    // 5. 캐시 저장
    await saveBuildToCache(hash, zipBuffer);

    logger.info('Static build cached', {
      hash: hash.substring(0, 8) + '...',
      size: zipBuffer.length
    });

    // 6. 클라이언트로 전송
    res.attachment('doclight-static.zip');
    res.send(zipBuffer);

  } catch (error) {
    logger.error('Static build failed', { error: error.message });
    next(error);
  }
}
```

**캐시 디렉토리 구조**:
```
.cache/
└── static-builds/
    ├── cache-info.json           # 현재 해시 정보
    └── a1b2c3d4...zip            # 해시명으로 저장된 ZIP
```

**성공 기준**:
- ✅ 첫 빌드: 새로 생성 (1초)
- ✅ 두 번째 빌드: 캐시 사용 (< 100ms) ⭐
- ✅ 파일 수정 후: 새로 빌드
- ✅ 로그에 캐시 사용 여부 표시



---

#### Phase 6.4: 빌드 버튼 이벤트 핸들러 (45분)

**파일**: `public/js/app.js`

```javascript
// init() 함수 내부에 추가
document.getElementById('build-static-btn')?.addEventListener('click', async () => {
  // 확인 다이얼로그
  if (!confirm('Build static site? This will create a ZIP file with all documents.\n\nEstimated time: 30-60 seconds')) {
    return;
  }

  const buildBtn = document.getElementById('build-static-btn');
  const originalHTML = buildBtn.innerHTML;

  try {
    // 로딩 표시
    buildBtn.innerHTML = '<span>Building...</span>';
    buildBtn.disabled = true;

    // API 호출
    const response = await fetch('/api/build-static', {
      method: 'POST',
      headers: {
        
      }
    });

    if (!response.ok) {
      throw new Error(`Build failed: ${response.status}`);
    }

    // ZIP 다운로드
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `doclight-static-${Date.now()}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // 성공 메시지
    alert('Static site built successfully!\n\nExtract the ZIP and open index.html');

  } catch (error) {
    console.error('Build failed:', error);
    alert(`Build failed: ${error.message}`);
  } finally {
    // 버튼 복원
    buildBtn.innerHTML = originalHTML;
    buildBtn.disabled = false;
  }
});
```

**성공 기준**:
- ✅ 클릭 시 확인 다이얼로그
- ✅ 로딩 표시
- ✅ ZIP 다운로드
- ✅ 에러 핸들링



---

### Phase 7: 정적 페이지 호환성 처리 (1.5시간)

#### Phase 7.1: 프로토콜 감지 로직 (30분)

**파일**: `public/js/app.js` (최상단)

```javascript
// 정적 vs 동적 모드 감지
const IS_STATIC = window.location.protocol === 'file:' || window.DOCS_MAP !== undefined;
const IS_DYNAMIC = !IS_STATIC;

console.log('[DocLight] Mode:', IS_STATIC ? 'Static' : 'Dynamic');

if (IS_STATIC) {
  console.log('[DocLight] Static mode - all documents loaded in memory');
  console.log('[DocLight] Documents:', window.DOCS_COUNT || 'unknown');
}
```

**성공 기준**:
- ✅ 모드 정확히 감지



---

#### Phase 7.2: 조건부 기능 비활성화 (1시간)

```javascript
// init() 함수 내부

// 정적 모드에서는 파일 관리 기능 숨김
if (IS_STATIC) {
  document.getElementById('refresh-btn')?.remove();
  document.getElementById('build-static-btn')?.remove();

  // 검색 기능은 유지 (클라이언트 검색으로 작동)
}

// IndexedDB는 file://에서도 작동하므로 유지
// localStorage도 작동하므로 트리 상태 유지 가능
```

**성공 기준**:
- ✅ 정적에서 불필요한 UI 숨김
- ✅ 필요한 기능은 유지



---

### Phase 8: 테스트 및 검증 (2시간)

#### Phase 8.1: Unit Tests (1시간)

**파일**: `test/static-builder.test.js` (새 파일)

```javascript
const { generateDocsMapJS, getAllMarkdownFiles } = require('../src/services/static-builder');
const { buildTreeStructure, flattenTreeDFS } = require('../src/services/tree-generator');

describe('Static Builder', () => {
  test('collects all markdown files', async () => {
    const files = await getAllMarkdownFiles('./test-source');
    expect(files.length).toBe(25);
    expect(files[0]).toHaveProperty('relativePath');
  });

  test('generates valid JavaScript', async () => {
    const js = await generateDocsMapJS('./test-source');
    expect(js).toContain('window.DOCS_MAP = {');
    expect(js).toContain('README.md');
    // 실제 실행 가능한지 확인
    eval(js);
    expect(window.DOCS_MAP).toBeDefined();
  });

  test('builds tree structure', async () => {
    const tree = await buildTreeStructure('./test-source');
    expect(tree.dirs).toBeInstanceOf(Array);
    expect(tree.files).toBeInstanceOf(Array);
  });

  test('flattens tree in DFS order', () => {
    const sampleTree = {
      dirs: [{ name: 'guide', files: [{name: 'intro.md'}] }],
      files: [{name: 'README.md'}]
    };
    const list = flattenTreeDFS(sampleTree);
    expect(list[0].path).toBe('guide/intro.md');  // 폴더 우선
    expect(list[1].path).toBe('README.md');
  });
});
```



---

#### Phase 8.2: Integration Test (1시간)

**파일**: `test/static-build-e2e.test.js` (새 파일)

```javascript
const request = require('supertest');
const app = require('../src/app');
const JSZip = require('jszip');

describe('Static Build E2E', () => {
  test('builds complete static site', async () => {
    const response = await request(app)
      .post('/api/build-static')
      .set(
      .expect(200)
      .expect('Content-Type', /zip/);

    // ZIP 검증
    const zip = await JSZip.loadAsync(response.body);

    // 필수 파일 확인
    expect(zip.file('index.html')).toBeDefined();
    expect(zip.file('data/docs-map.js')).toBeDefined();
    expect(zip.file('data/tree-structure.json')).toBeDefined();
    expect(zip.file('lib/marked.min.js')).toBeDefined();

    // docs-map.js 검증
    const docsMapJS = await zip.file('data/docs-map.js').async('string');
    expect(docsMapJS).toContain('window.DOCS_MAP');
    expect(docsMapJS).toContain('README.md');
  });

  test('static site works offline', async () => {
    // 실제로 ZIP 추출하여 브라우저 테스트는 수동
    // 여기서는 파일 존재 여부만 확인
  });
});
```



---

### Phase 9: 문서화 및 사용 가이드 (1시간)

#### Phase 9.1: README 업데이트 (30분)

**추가 내용**:
```markdown
## Static Site Export

Build a standalone static version of your documentation:

1. Click the "Build Static" button (download icon)
2. Wait 30-60 seconds
3. Download `doclight-static.zip`
4. Extract and double-click `index.html`

Features in static mode:
- ✅ Full offline support
- ✅ Tree navigation
- ✅ Search (client-side)
- ✅ TOC, code highlighting, diagrams
- ❌ File upload/delete (read-only)

Requirements:
- Modern browser (Chrome, Firefox, Safari)
- ~6MB disk space
```



---

#### Phase 9.2: 정적 사이트 사용 가이드 (30분)

**파일**: `docs/static-site-usage.md` (새 파일)

```markdown
# Static Site Usage Guide

## What is included

- All markdown documents rendered as HTML
- Tree navigation (expandable folders)
- Search functionality (client-side)
- Table of Contents
- Code syntax highlighting
- Mermaid diagrams
- Previous/Next links
- Responsive design (mobile-friendly)

## What is NOT included

- File upload/delete
- Live refresh
- Server-side search (uses client-side instead)

## How to use

1. Extract `doclight-static.zip`
2. Double-click `index.html`
3. Browse documents using tree navigation
4. Search with the search box (works offline!)
5. Use Ctrl+F for in-page search

## Technical details

- Size: ~6MB
- Files: ~40 (HTML, JS, CSS, images)
- Dependencies: All bundled (no CDN)
- Offline: 100% works without internet
```



---


### 핵심 아이디어

**문제**: 매번 빌드하면 1초 소요 (작지만 반복 시 불편)

**해결**: 파일 변경 없으면 캐시 재사용 → **< 100ms** ⭐

### 해시 생성 알고리즘

**포함 대상**:
1. 모든 .md 파일 (mtime + size)
2. 모든 리소스 파일:
   - public/lib/*.js (라이브러리)
   - public/css/style.css
   - public/js/app.js
   - public/images/*
   - test-source/images/*

**해시 계산**:
```javascript
// 각 파일: "path:mtime:size"
// 예: "README.md:1699344567890:1234"

const hashInput = [
  "README.md:1699344567890:1234",
  "guide/intro.md:1699344568901:5678",
  "public/css/style.css:1699344569012:30000",
  // ... 모든 파일
].sort().join('|');  // 정렬로 일관성 확보

const hash = crypto.sha256(hashInput);
// 결과: "a1b2c3d4e5f6..."
```

**변경 감지**:
- 파일 추가 → 해시 변경
- 파일 수정 (mtime 변경) → 해시 변경
- 파일 크기 변경 → 해시 변경
- 파일 삭제 → 해시 변경
- **아무 변경 없음 → 해시 동일 → 캐시 재사용** ⭐

### 캐시 사용 흐름

```
[다운로드 버튼 클릭]
   ↓
모든 파일 mtime + size 수집 (50ms)
   ↓
해시 생성 (10ms)
   ↓
캐시 확인: .cache/cache-info.json
   ↓
해시 동일?
   ├─ YES → 캐시된 ZIP 전송 (50ms) ⭐ 총 110ms
   └─ NO  → 새로 빌드 (1초) → 캐시 저장 → 전송
```

### 성능 비교

| 상황 | 시간 | 설명 |
|------|------|------|
| 첫 다운로드 | 1초 | 빌드 + 캐시 저장 |
| 변경 없이 재다운로드 | **110ms** ⭐ | 캐시 재사용 |
| 파일 1개 수정 후 | 1초 | 새로 빌드 |
| 리소스 변경 후 | 1초 | 새로 빌드 |

**체감 효과**: 두 번째부터는 **거의 즉시** 다운로드!

### 캐시 관리

**캐시 위치**:
```
.cache/static-builds/
├── cache-info.json              # 현재 캐시 정보
│   {
│     "hash": "a1b2c3d4...",
│     "cachedAt": "2025-11-07T...",
│     "zipPath": ".cache/static-builds/a1b2c3d4...zip",
│     "fileCount": 35,
│     "totalSize": 6291456
│   }
└── a1b2c3d4e5f6...zip          # 실제 ZIP (해시명)
```

**캐시 정리**:
- 기본: 캐시 1개만 유지 (가장 최근)
- 선택: 캐시 N개 유지 (LRU)
- 수동: `DELETE /api/build-static/cache`

**용량**:
- ZIP 1개: ~6MB
- 문제없음 (SSD 시대)

### 보안 고려사항

**API 인증**: 불필요 (공개 기능)

**이유**:
- 빌드가 빠름 (1초, 캐시 시 110ms)
- 서버 부하 낮음
- 캐싱으로 무분별한 빌드 자동 방지

---

## 🎯 핵심 장점 (window.DOCS_MAP 방식)

### vs Puppeteer 방식

| 항목 | Puppeteer | DOCS_MAP |
|------|-----------|----------|
| 빌드 시간 | 40초 | **1초** ⭐ |
| 서버 메모리 | 500MB | **10MB** ⭐ |
| 복잡도 | ⭐⭐⭐⭐ | **⭐☆☆☆** ⭐ |
| 개발 시간 | 4-5일 | **2일** ⭐ |
| 검색 포함 | 추가 작업 | **기본 포함** ⭐ |
| file:// 지원 | 제한적 | **완벽** ⭐ |
| 확장성 | 낮음 | **높음** ⭐ |

---

## ✨ 혁신적 이점

1. **빌드 = ZIP만 압축** (렌더링 없음!)
2. **검색 더 빠름** (메모리 검색 vs API)
3. **마크다운 편집 가능** (원본 포함)
4. **브라우저 호환성 100%**
5. **대용량 문서도 빠름** (1000개 파일도 2-3초)

---

## 🚀 실행 결과 예상

```
[빌드 버튼 클릭]
   ↓
서버: 파일 읽기 (25개 × 10ms) = 250ms
서버: JavaScript 생성 = 100ms
서버: ZIP 압축 = 500ms
   ↓
[총 1초 만에 다운로드!] ⭐
   ↓
[압축 해제]
   ↓
[index.html 더블클릭]
   ↓
[즉시 실행 - 검색 포함!] ✅
```

