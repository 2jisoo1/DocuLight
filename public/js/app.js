// DocuLight Client Application

// Disable automatic scroll restoration by browser
if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}

// Initialize Mermaid
mermaid.initialize({
  startOnLoad: true,
  theme: 'default'
});

// IndexedDB management
const DB_NAME = 'DocuLight';
const DB_VERSION = 2;  // Step 12: Upgraded for TOC state
let db;

// Global state: flattened file list for navigation (Step 9.3)
let flatFileList = [];

// Initialize IndexedDB
async function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Tree state store
      if (!db.objectStoreNames.contains('treeState')) {
        db.createObjectStore('treeState', { keyPath: 'path' });
      }

      // Last opened file store
      if (!db.objectStoreNames.contains('lastOpened')) {
        db.createObjectStore('lastOpened', { keyPath: 'key' });
      }

      // TOC state store (Step 12: Phase 1)
      if (!db.objectStoreNames.contains('tocState')) {
        db.createObjectStore('tocState', { keyPath: 'key' });
      }
    };
  });
}

// Save tree state
async function saveTreeState(path, expanded) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('treeState', 'readwrite');
    const store = tx.objectStore('treeState');
    const request = store.put({ path, expanded, ts: Date.now() });

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Get tree state
async function getTreeState(path) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('treeState', 'readonly');
    const store = tx.objectStore('treeState');
    const request = store.get(path);

    request.onsuccess = () => {
      const result = request.result;
      resolve(result ? result.expanded : false);
    };

    request.onerror = () => reject(request.error);
  });
}

// Save last opened file
async function saveLastOpened(path) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('lastOpened', 'readwrite');
    const store = tx.objectStore('lastOpened');
    const request = store.put({ key: 'file', path, ts: Date.now() });

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Get last opened file
async function getLastOpened() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('lastOpened', 'readonly');
    const store = tx.objectStore('lastOpened');
    const request = store.get('file');

    request.onsuccess = () => {
      const result = request.result;
      resolve(result ? result.path : null);
    };

    request.onerror = () => reject(request.error);
  });
}

// Save TOC state (Step 12: Phase 3)
async function saveTOCState(isOpen, width) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('tocState', 'readwrite');
    const store = tx.objectStore('tocState');
    const request = store.put({
      key: 'toc',
      isOpen,
      width,
      ts: Date.now()
    });

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Get TOC state (Step 12: Phase 3)
async function getTOCState() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('tocState', 'readonly');
    const store = tx.objectStore('tocState');
    const request = store.get('toc');

    request.onsuccess = () => {
      resolve(request.result || null);
    };

    request.onerror = () => reject(request.error);
  });
}

// Error handling utilities
const ErrorHandler = {
  // Retry configuration
  maxRetries: 3,
  retryDelay: 1000,
  timeout: 10000,

  // Show error notification
  showError(message, details = '') {
    const contentDiv = document.getElementById('markdown-content');
    contentDiv.innerHTML = `
      <div class="error-message">
        <div class="error-icon">⚠️</div>
        <h2>Error Occurred</h2>
        <p class="error-main">${message}</p>
        ${details ? `<p class="error-details">${details}</p>` : ''}
        <button class="error-retry-btn" onclick="location.reload()">Retry</button>
      </div>
    `;
  },

  // Network error check
  isNetworkError(error) {
    return error.message.includes('fetch') ||
           error.message.includes('network') ||
           error.message.includes('Failed to fetch');
  },

  // Timeout error check
  isTimeoutError(error) {
    return error.message.includes('timeout') ||
           error.message.includes('timed out');
  },

  // Get user-friendly error message
  getUserMessage(error, context = '') {
    if (this.isNetworkError(error)) {
      return 'Please check your network connection.';
    }
    if (this.isTimeoutError(error)) {
      return 'Request timed out. Please try again.';
    }
    if (error.message.includes('404')) {
      return context ? `${context} not found.` : 'Requested resource not found.';
    }
    if (error.message.includes('403')) {
      return 'Access forbidden.';
    }
    if (error.message.includes('401')) {
      return 'Authentication required.';
    }
    if (error.message.includes('500')) {
      return 'Server error occurred.';
    }
    return 'An error occurred while processing the request.';
  }
};

// API Functions with retry logic
async function fetchWithRetry(url, options = {}, retries = ErrorHandler.maxRetries) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ErrorHandler.timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
      error.status = response.status;
      throw error;
    }

    return response;
  } catch (error) {
    clearTimeout(timeoutId);

    // Check if we should retry
    if (retries > 0 && (ErrorHandler.isNetworkError(error) || ErrorHandler.isTimeoutError(error))) {
      console.warn(`Retrying request (${retries} attempts left)...`);
      await new Promise(resolve => setTimeout(resolve, ErrorHandler.retryDelay));
      return fetchWithRetry(url, options, retries - 1);
    }

    throw error;
  }
}

async function fetchTree(path = '/') {
  try {
    const response = await fetchWithRetry(DocLightUtils.prefixPath(`/api/tree?path=${encodeURIComponent(path)}`));
    return await response.json();
  } catch (error) {
    console.error('Failed to fetch tree:', error);
    throw error;
  }
}

async function fetchRaw(path) {
  try {
    const response = await fetchWithRetry(DocLightUtils.prefixPath(`/api/raw?path=${encodeURIComponent(path)}`));
    return await response.text();
  } catch (error) {
    console.error('Failed to fetch file:', error);
    throw error;
  }
}

/**
 * Search documents by keyword
 * GET /api/search?query=<keyword>&limit=<limit>
 */
async function fetchSearch(query, limit = 50) {
  try {
    const response = await fetchWithRetry(
      DocLightUtils.prefixPath(`/api/search?query=${encodeURIComponent(query)}&limit=${limit}`)
    );
    return await response.json();
  } catch (error) {
    console.error('Failed to search documents:', error);
    throw error;
  }
}

// Copy code to clipboard
async function copyCodeToClipboard(codeElement, button) {
  try {
    const code = codeElement.textContent;
    await navigator.clipboard.writeText(code);

    // Change button text to "Copied!"
    button.textContent = 'Copied!';

    // Reset to "Copy" after 2 seconds
    setTimeout(() => {
      button.textContent = 'Copy';
    }, 2000);
  } catch (error) {
    console.error('Failed to copy code:', error);
  }
}

// Add copy button to code blocks
function addCopyButtons(contentDiv) {
  const codeBlocks = contentDiv.querySelectorAll('pre > code');

  codeBlocks.forEach((codeElement) => {
    const pre = codeElement.parentElement;

    // Skip if already has wrapper
    if (pre.parentElement.classList.contains('code-block-wrapper')) {
      return;
    }

    // Create wrapper
    const wrapper = document.createElement('div');
    wrapper.className = 'code-block-wrapper';

    // Create copy button
    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy-btn';
    copyBtn.textContent = 'Copy';
    copyBtn.title = 'Copy code';

    // Add click event
    copyBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      await copyCodeToClipboard(codeElement, copyBtn);
    });

    // Wrap code block
    pre.parentNode.insertBefore(wrapper, pre);
    wrapper.appendChild(copyBtn);
    wrapper.appendChild(pre);
  });
}

/**
 * 재귀적으로 모든 파일을 가져와서 평면화된 리스트 생성
 * Step 9.3: Document Navigation
 *
 * @param {string} path - 시작 경로
 * @param {Array} result - 결과 배열
 * @returns {Promise<Array>} - 평면화된 파일 리스트 [{path, name}, ...]
 */
async function fetchAllFilesRecursive(path = '/', result = []) {
  try {
    const data = await fetchTree(path);

    // 하위 디렉토리를 먼저 재귀적으로 처리 (폴더 우선 정렬)
    if (data.dirs && Array.isArray(data.dirs)) {
      for (const dir of data.dirs) {
        const dirPath = path === '/' ? dir.name : `${path}/${dir.name}`;
        await fetchAllFilesRecursive(dirPath, result);
      }
    }

    // 현재 레벨의 파일들을 나중에 추가 (sidebar 순서와 동일)
    // Only add .md files to navigation
    if (data.files && Array.isArray(data.files)) {
      data.files.forEach(file => {
        // Skip non-markdown files
        if (!file.name.endsWith('.md')) {
          return;
        }

        const filePath = path === '/' ? file.name : `${path}/${file.name}`;
        result.push({
          path: filePath,
          name: file.name,
          displayName: file.displayName || null
        });
      });
    }

    return result;
  } catch (error) {
    console.error(`Failed to fetch files in ${path}:`, error);
    return result;
  }
}

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

// Render markdown (uses DocLightUtils for preprocessing)
async function renderMarkdown(content) {
  // Step 9.4: Preprocess Wiki links [[]] before markdown parsing (using shared module)
  const preprocessed = DocLightUtils.preprocessWikiLinks(content);

  // Configure marked with custom renderer to add IDs to headings
  const renderer = new marked.Renderer();
  const originalHeading = renderer.heading.bind(renderer);

  renderer.heading = function(text, level, raw) {
    // Generate ID from heading text (slug format)
    // Keep alphanumeric, spaces, hyphens, and Korean characters (가-힣)
    const id = raw
      .toLowerCase()
      .replace(/[^\w\s\-가-힣]/gu, '') // Keep Korean characters (한글 유지)
      .replace(/\s+/g, '-')             // Replace spaces with hyphens
      .replace(/-+/g, '-')              // Replace multiple hyphens with single hyphen
      .trim();

    return `<h${level} id="${id}">${text}</h${level}>\n`;
  };

  // Step 9.5: Custom image renderer for lazy loading
  renderer.image = function(href, title, text) {
    const titleAttr = title ? ` title="${title}"` : '';
    return `<img src="${href}" alt="${text}"${titleAttr} loading="lazy">`;
  };

  // Configure marked options
  marked.setOptions({
    breaks: true,
    gfm: true,
    renderer: renderer
  });

  // Parse markdown (with preprocessed Wiki links)
  const rawHtml = marked.parse(preprocessed);

  // Sanitize HTML with DOMPurify - allow Highlight.js classes, heading IDs, and image attributes
  const cleanHtml = DOMPurify.sanitize(rawHtml, {
    ADD_ATTR: ['class', 'data-language', 'data-highlighted', 'id', 'loading', 'title', 'alt', 'src', 'width', 'height'],
    ADD_TAGS: ['span']
  });

  // Set content
  const contentDiv = document.getElementById('markdown-content');
  contentDiv.innerHTML = cleanHtml;

  // Apply syntax highlighting to code blocks
  const codeBlocks = contentDiv.querySelectorAll('pre code');
  codeBlocks.forEach((block) => {
    // Skip mermaid blocks
    if (!block.classList.contains('language-mermaid')) {
      hljs.highlightElement(block);
    }
  });

  // Render mermaid diagrams (using shared module)
  await DocLightUtils.renderMermaidDiagrams(contentDiv);

  // Add copy buttons to code blocks
  addCopyButtons(contentDiv);

  // Add anchor links to headings
  addHeadingAnchors(contentDiv);

  // Step 9.3: Add document navigation (prev/next)
  addDocumentNavigation(contentDiv);

  // Add click handlers for internal links (SPA navigation)
  addInternalLinkHandlers(contentDiv);
}

/**
 * 문서 네비게이션 추가 (이전/다음 링크)
 * Step 9.3: Document Navigation
 */
function addDocumentNavigation(contentDiv) {
  // Get current path from breadcrumb
  const breadcrumb = document.getElementById('breadcrumb');
  if (!breadcrumb) return;

  const currentPath = breadcrumb.textContent.trim();

  // 폴더 리스트 뷰는 네비게이션 제외
  if (!currentPath || currentPath === 'Select a document' || currentPath.endsWith('/')) {
    return;
  }

  const nav = calculateNavigation(currentPath);

  // 이전/다음이 모두 없으면 네비게이션 추가 안 함
  if (!nav.prev && !nav.next) {
    return;
  }

  // Separator
  const separator = document.createElement('hr');
  separator.className = 'doc-separator';
  contentDiv.appendChild(separator);

  // Navigation container
  const navContainer = document.createElement('nav');
  navContainer.className = 'doc-navigation';

  // Previous link
  const prevDiv = document.createElement('div');
  prevDiv.className = 'nav-prev';
  if (nav.prev) {
    const cleanPath = nav.prev.path.replace(/\.md$/, '');
    const displayName = nav.prev.displayName || nav.prev.name.replace(/\.md$/, '');
    const prevLink = document.createElement('a');
    prevLink.href = DocLightUtils.prefixPath(`/doc/${cleanPath}`);
    prevLink.innerHTML = `
      <span class="nav-label">← Previous</span>
      <span class="nav-title">${displayName}</span>
    `;
    // Add click event to use SPA navigation
    prevLink.addEventListener('click', async (e) => {
      e.preventDefault();
      await loadFile(nav.prev.path);
    });
    prevDiv.appendChild(prevLink);
  }

  // Next link
  const nextDiv = document.createElement('div');
  nextDiv.className = 'nav-next';
  if (nav.next) {
    const cleanPath = nav.next.path.replace(/\.md$/, '');
    const displayName = nav.next.displayName || nav.next.name.replace(/\.md$/, '');
    const nextLink = document.createElement('a');
    nextLink.href = DocLightUtils.prefixPath(`/doc/${cleanPath}`);
    nextLink.innerHTML = `
      <span class="nav-label">Next →</span>
      <span class="nav-title">${displayName}</span>
    `;
    // Add click event to use SPA navigation
    nextLink.addEventListener('click', async (e) => {
      e.preventDefault();
      await loadFile(nav.next.path);
    });
    nextDiv.appendChild(nextLink);
  }

  navContainer.appendChild(prevDiv);
  navContainer.appendChild(nextDiv);
  contentDiv.appendChild(navContainer);
}

/**
 * Add click handlers for internal /doc/ links (SPA navigation)
 * Prevents page reload and uses loadFile/loadFolder instead
 */
function addInternalLinkHandlers(contentDiv) {
  const bp = DocLightUtils.getBasePath();
  const docPrefix = bp + '/doc/';
  const selector = bp ? `a[href^="${docPrefix}"], a[href^="/doc/"]` : 'a[href^="/doc/"]';
  const links = contentDiv.querySelectorAll(selector);

  links.forEach(link => {
    link.addEventListener('click', async (e) => {
      e.preventDefault();
      const href = link.getAttribute('href');

      // Strip basePath prefix if present, then /doc/
      let rawPath;
      if (bp && href.startsWith(docPrefix)) {
        rawPath = href.substring(docPrefix.length);
      } else if (href.startsWith('/doc/')) {
        rawPath = href.substring(5);
      } else {
        return;
      }
      const decodedPath = rawPath.split('/').map(seg => decodeURIComponent(seg)).join('/');

      // Check if it's a file or folder by trying to fetch as file first
      const fileResponse = await fetch(DocLightUtils.prefixPath(`/api/raw?path=${encodeURIComponent(decodedPath + '.md')}`));

      if (fileResponse.ok) {
        // It's a file
        await loadFile(decodedPath + '.md');
      } else {
        // Not a file, try as folder
        await showFolderList(decodedPath);
      }
    });
  });
}

/**
 * Generate TOC data from document headings
 * Step 12: Phase 2
 *
 * @returns {Array} TOC data [{id, level, text}, ...]
 */
function generateTOC() {
  const contentDiv = document.getElementById('markdown-content');
  if (!contentDiv) return [];

  const headings = contentDiv.querySelectorAll('h1, h2, h3, h4, h5, h6');
  const tocData = [];

  headings.forEach(heading => {
    // Skip document title
    if (heading.classList.contains('document-title')) return;

    // Skip if no ID
    if (!heading.id) return;

    const level = parseInt(heading.tagName.substring(1)); // h1 -> 1
    const text = heading.textContent.replace('🔗', '').trim();

    tocData.push({
      id: heading.id,
      level: level,
      text: text
    });
  });

  return tocData;
}

/**
 * Render TOC in sidebar
 * Step 12: Phase 2
 *
 * @param {Array} tocData - TOC data from generateTOC()
 */
function renderTOC(tocData) {
  const tocTree = document.getElementById('toc-tree');
  if (!tocTree) return;

  tocTree.innerHTML = '';

  if (tocData.length === 0) {
    tocTree.innerHTML = '<p class="toc-empty">No headings found</p>';
    return;
  }

  tocData.forEach(item => {
    const tocItem = document.createElement('div');
    tocItem.className = 'toc-item';
    tocItem.dataset.level = item.level;
    tocItem.dataset.headingId = item.id;
    tocItem.textContent = item.text;
    tocItem.title = item.text;  // Tooltip for long titles

    // Click handler
    tocItem.addEventListener('click', () => {
      scrollToHeading(item.id);

      // Mobile: close TOC after click
      if (window.innerWidth <= 768) {
        closeTOCSidebar();
      }

      // Update URL hash
      updateURLHash(item.id);
    });

    tocTree.appendChild(tocItem);
  });
}

/**
 * Scroll to heading
 * Step 12: Phase 2
 *
 * @param {string} headingId - Heading element ID
 */
function scrollToHeading(headingId) {
  const targetElement = document.getElementById(headingId);
  if (!targetElement) return;

  // Scroll to target
  targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Update active state
  updateActiveTOCItem(headingId);
}

/**
 * Update active TOC item
 * Step 12: Phase 2
 *
 * @param {string} headingId - Heading element ID
 */
function updateActiveTOCItem(headingId) {
  // Remove all active states
  document.querySelectorAll('.toc-item').forEach(item => {
    item.classList.remove('active');
  });

  // Add active to clicked item
  const activeItem = document.querySelector(`.toc-item[data-heading-id="${headingId}"]`);
  if (activeItem) {
    activeItem.classList.add('active');

    // Scroll TOC to center active item for better visibility
    activeItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

/**
 * Update URL hash
 * Step 12: Phase 2
 *
 * @param {string} headingId - Heading element ID
 */
function updateURLHash(headingId) {
  const breadcrumb = document.getElementById('breadcrumb');
  if (!breadcrumb) return;

  const currentPath = breadcrumb.textContent.trim();
  if (!currentPath || currentPath === 'Select a document') return;

  // Build URL with hash
  const cleanPath = currentPath.replace(/\.md$/, '');
  const encodedPath = cleanPath.split('/').map(seg => encodeURIComponent(seg)).join('/');
  const encodedHash = encodeURIComponent(headingId);

  window.history.pushState({
    path: currentPath,
    cleanPath: cleanPath,
    hash: headingId
  }, '', DocLightUtils.prefixPath(`/doc/${encodedPath}#${encodedHash}`));
}

/**
 * Close TOC sidebar
 * Step 12: Phase 2
 */
function closeTOCSidebar() {
  const tocSidebar = document.getElementById('toc-sidebar');
  const tocOverlay = document.getElementById('toc-overlay');

  if (tocSidebar) {
    tocSidebar.classList.remove('open');
  }

  if (tocOverlay) {
    tocOverlay.classList.remove('active');
  }
}

// Global Intersection Observer for TOC
let tocObserver = null;

/**
 * Initialize TOC scroll sync (Intersection Observer)
 * Step 12: Phase 3
 */
function initTOCScrollSync() {
  // Cleanup previous observer
  if (tocObserver) {
    tocObserver.disconnect();
  }

  const headings = document.querySelectorAll('#markdown-content h1, #markdown-content h2, #markdown-content h3, #markdown-content h4, #markdown-content h5, #markdown-content h6');

  if (headings.length === 0) return;

  // Observer options
  const options = {
    root: document.querySelector('.main-content'),
    rootMargin: '-80px 0px -80% 0px',  // Top 80px excluded, bottom 80% excluded
    threshold: 0
  };

  tocObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const headingId = entry.target.id;
        if (headingId) {
          updateActiveTOCItem(headingId);
        }
      }
    });
  }, options);

  headings.forEach(heading => {
    if (heading.id && !heading.classList.contains('document-title')) {
      tocObserver.observe(heading);
    }
  });
}

/**
 * Add document title (filename without .md) at the top of content
 */
function addDocumentTitle(path, contentDiv) {
  // Remove any existing document title
  const existingTitle = contentDiv.querySelector('.document-title');
  if (existingTitle) {
    existingTitle.remove();
  }

  // Extract filename from path
  const filename = path.split('/').pop(); // Get last segment
  const titleText = filename.replace(/\.md$/, ''); // Remove .md extension

  // Decode for display
  const decodedTitle = decodeURIComponent(titleText);

  // Create title element
  const titleElement = document.createElement('h1');
  titleElement.className = 'document-title';
  titleElement.textContent = decodedTitle;

  // Insert at the beginning of content
  contentDiv.insertBefore(titleElement, contentDiv.firstChild);
}

// Copy heading link to clipboard
async function copyHeadingLink(heading, anchorLink) {
  try {
    // Get current file path from breadcrumb
    const breadcrumb = document.getElementById('breadcrumb');
    if (!breadcrumb) {
      console.error('Breadcrumb element not found');
      return;
    }

    const currentPath = breadcrumb.textContent.trim();
    if (!currentPath || currentPath === '문서를 선택하세요') {
      console.error('No document loaded');
      return;
    }

    console.log('Current path:', currentPath);
    console.log('Heading ID:', heading.id);

    // Build full URL with anchor (Clean URL: remove .md extension)
    const cleanPath = currentPath.replace(/\.md$/, '');
    const encodedPath = cleanPath.split('/').map(seg => encodeURIComponent(seg)).join('/');
    const encodedHash = encodeURIComponent(heading.id); // UTF-8 encode for Korean characters
    const fullUrl = `${window.location.origin}${DocLightUtils.prefixPath(`/doc/${encodedPath}#${encodedHash}`)}`;

    console.log('Copying URL:', fullUrl);

    // Copy to clipboard
    await navigator.clipboard.writeText(fullUrl);

    // Update URL
    const newUrl = DocLightUtils.prefixPath(`/doc/${encodedPath}#${encodedHash}`);
    window.history.pushState({
      path: currentPath,
      cleanPath: cleanPath,
      hash: heading.id
    }, '', newUrl);

    console.log('URL updated to:', newUrl);

    // Visual feedback
    const originalIcon = anchorLink.innerHTML;
    anchorLink.innerHTML = '✓';
    setTimeout(() => {
      anchorLink.innerHTML = originalIcon;
    }, 1500);
  } catch (error) {
    console.error('Failed to copy heading link:', error);
  }
}

// Add anchor links to headings
function addHeadingAnchors(contentDiv) {
  const headings = contentDiv.querySelectorAll('h1, h2, h3, h4, h5, h6');

  headings.forEach((heading) => {
    // Skip if heading doesn't have an id
    if (!heading.id) return;

    // Skip document title
    if (heading.classList.contains('document-title')) return;

    // Create anchor link icon
    const anchorLink = document.createElement('span');
    anchorLink.className = 'heading-anchor';
    anchorLink.innerHTML = '🔗';
    anchorLink.title = 'Copy link to this section';

    // Add to heading
    heading.appendChild(anchorLink);

    // Make entire heading clickable
    heading.style.cursor = 'pointer';
    heading.addEventListener('click', async (e) => {
      e.preventDefault();
      await copyHeadingLink(heading, anchorLink);
    });
  });
}

// Build tree UI with expansion support
async function buildTree(data, container, currentPath = '', level = 0) {
  const fragment = document.createDocumentFragment();

  // Store directory info for state restoration
  const dirsToRestore = [];

  // Add directories
  for (const dir of data.dirs) {
    const dirPath = currentPath ? `${currentPath}/${dir.name}` : dir.name;

    // Create directory item wrapper
    const wrapper = document.createElement('div');
    wrapper.className = 'tree-item-wrapper';
    wrapper.dataset.path = dirPath;

    // Create directory item
    const item = document.createElement('div');
    item.className = 'tree-item directory';
    item.dataset.path = dirPath;
    item.style.paddingLeft = `${level * 1.2}rem`;

    // Create expand icon (toggle) - Obsidian-style chevron SVG
    const expandIcon = document.createElement('span');
    expandIcon.className = 'expand-icon';
    expandIcon.dataset.action = 'toggle';  // For event delegation
    expandIcon.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M5 3 L9 7 L5 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;

    // Create name span (folder link)
    const nameSpan = document.createElement('span');
    nameSpan.className = 'folder-name';
    nameSpan.textContent = dir.name;
    nameSpan.dataset.action = 'list';      // For event delegation

    item.appendChild(expandIcon);
    item.appendChild(nameSpan);

    // Create children container
    const childrenContainer = document.createElement('div');
    childrenContainer.className = 'tree-children';
    childrenContainer.style.display = 'none';

    // Click handlers are handled by event delegation in init()
    // (Step 9.2: removed individual item click handlers)

    wrapper.appendChild(item);
    wrapper.appendChild(childrenContainer);
    fragment.appendChild(wrapper);

    // Save for state restoration after DOM insertion
    dirsToRestore.push({ dirPath, wrapper, childrenContainer, expandIcon, level });
  }

  // Add files (only .md files)
  data.files.forEach(file => {
    // Skip non-markdown files
    if (!file.name.endsWith('.md')) {
      return;
    }

    const filePath = currentPath ? `${currentPath}/${file.name}` : file.name;
    const item = document.createElement('div');
    item.className = 'tree-item file';
    item.dataset.path = filePath;
    item.style.paddingLeft = `${level * 1.2}rem`;  // 폴더와 동일한 레벨 (level + 1 제거)

    // Remove .md extension from display name
    const displayName = file.displayName || file.name.slice(0, -3);

    const nameSpan = document.createElement('span');
    nameSpan.textContent = displayName;

    item.appendChild(nameSpan);

    // Add click event for .md files
    item.addEventListener('click', async (e) => {
      e.stopPropagation();
      await loadFile(filePath);
    });

    fragment.appendChild(item);
  });

  // Append fragment to DOM first
  container.appendChild(fragment);

  // Restore expanded states after DOM insertion
  for (const dir of dirsToRestore) {
    const isExpanded = await getTreeState(dir.dirPath);
    if (isExpanded) {
      await toggleDirectory(dir.dirPath, dir.wrapper, dir.childrenContainer, dir.expandIcon, dir.level + 1);
    }
  }
}

// Toggle directory expansion
async function toggleDirectory(dirPath, wrapper, childrenContainer, expandIcon, level) {
  const isExpanded = childrenContainer.style.display !== 'none';

  if (isExpanded) {
    // Collapse
    childrenContainer.style.display = 'none';
    expandIcon.classList.remove('expanded');
    wrapper.classList.remove('expanded');
    await saveTreeState(dirPath, false);
  } else {
    // Expand
    expandIcon.classList.add('expanded');
    wrapper.classList.add('expanded');

    // Load children if not loaded
    if (childrenContainer.children.length === 0) {
      try {
        const treeData = await fetchTree(dirPath);
        await buildTree(treeData, childrenContainer, dirPath, level);
      } catch (error) {
        console.error('Failed to load directory:', error);
        childrenContainer.innerHTML = `
          <div class="tree-error" style="padding-left: ${level * 1.2}rem; color: #e74c3c;">
            Failed to load directory
          </div>
        `;
      }
    }

    childrenContainer.style.display = 'block';
    await saveTreeState(dirPath, true);
  }
}

// Show folder contents as a list in main area (Step 9.2)
async function showFolderList(folderPath) {
  try {
    // Save current path
    currentPath = folderPath;

    // Update breadcrumb
    document.getElementById('breadcrumb').textContent = folderPath + '/';

    // Fetch folder contents
    const response = await fetch(DocLightUtils.prefixPath(`/api/tree?path=${encodeURIComponent(folderPath)}`));

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    // Generate markdown for folder contents
    const markdown = generateFolderListMarkdown(folderPath, data);

    // Render markdown
    await renderMarkdown(markdown);

    // Add folder-list-view class to content div
    const contentDiv = document.getElementById('markdown-content');
    contentDiv.classList.add('folder-list-view');

    // Scroll to top when showing folder list
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
      mainContent.scrollTop = 0;
    }

    // Update URL (clean URL without .md)
    const cleanPath = folderPath.replace(/^\//, '');
    const encodedPath = cleanPath.split('/').map(seg => encodeURIComponent(seg)).join('/');
    window.history.pushState({
      path: folderPath,
      type: 'folder'
    }, '', cleanPath ? DocLightUtils.prefixPath(`/doc/${encodedPath}`) : DocLightUtils.prefixPath('/'));

    // Update active state in tree
    document.querySelectorAll('.tree-item').forEach(item => {
      item.classList.remove('active');
    });

    const activeItem = document.querySelector(`.tree-item[data-path="${folderPath}"]`);
    if (activeItem) {
      activeItem.classList.add('active');
    }

  } catch (error) {
    console.error('Failed to load folder list:', error);
    const userMessage = ErrorHandler.getUserMessage(error, 'Folder');
    ErrorHandler.showError(userMessage, error.message);
  }
}

// Expand all folders (Step 9.3)
async function expandAll() {
  try {
    const allWrappers = document.querySelectorAll('.tree-item-wrapper');

    for (const wrapper of allWrappers) {
      const directoryItem = wrapper.querySelector('.tree-item.directory');
      if (!directoryItem) continue;

      const dirPath = wrapper.dataset.path;
      const childrenContainer = wrapper.querySelector('.tree-children');
      const expandIcon = wrapper.querySelector('.expand-icon');
      const level = parseInt(directoryItem.style.paddingLeft) / 1.2;

      // Check if already expanded
      if (childrenContainer.style.display === 'none') {
        // Load children if not loaded
        if (childrenContainer.children.length === 0) {
          try {
            const treeData = await fetchTree(dirPath);
            await buildTree(treeData, childrenContainer, dirPath, level);
          } catch (error) {
            console.error(`Failed to load directory ${dirPath}:`, error);
          }
        }

        // Show children
        expandIcon.classList.add('expanded');
        wrapper.classList.add('expanded');
        childrenContainer.style.display = 'block';

        // Save state
        await saveTreeState(dirPath, true);
      }
    }
  } catch (error) {
    console.error('Failed to expand all:', error);
    ErrorHandler.showError('Failed to expand all folders', error.message);
  }
}

// Collapse all folders (Step 9.3)
async function collapseAll() {
  try {
    const allWrappers = document.querySelectorAll('.tree-item-wrapper');

    for (const wrapper of allWrappers) {
      const childrenContainer = wrapper.querySelector('.tree-children');
      const expandIcon = wrapper.querySelector('.expand-icon');

      if (!childrenContainer || !expandIcon) continue;

      const dirPath = wrapper.dataset.path;

      // Check if already expanded
      if (childrenContainer.style.display !== 'none') {
        // Hide children
        expandIcon.classList.remove('expanded');
        wrapper.classList.remove('expanded');
        childrenContainer.style.display = 'none';

        // Save state
        await saveTreeState(dirPath, false);
      }
    }
  } catch (error) {
    console.error('Failed to collapse all:', error);
    ErrorHandler.showError('Failed to collapse all folders', error.message);
  }
}

// Generate markdown for folder list view (Step 9.2)
function generateFolderListMarkdown(folderPath, treeData) {
  // Extract folder name for title (decode for display)
  const folderName = folderPath.split('/').filter(p => p).pop() || 'Root';
  const decodedFolderName = decodeURIComponent(folderName);

  let markdown = `# 📂 ${decodedFolderName}\n\n`;

  // Show current path (decode for display)
  const decodedPath = folderPath.split('/').map(seg => decodeURIComponent(seg)).join('/');
  markdown += `**Path**: \`${decodedPath || '/'}\`\n\n`;

  // Subdirectories section
  if (treeData.dirs && treeData.dirs.length > 0) {
    markdown += `## Subdirectories\n\n`;

    for (const dir of treeData.dirs) {
      const dirPath = folderPath ? `${folderPath}/${dir.name}` : dir.name;
      const cleanDirPath = dirPath.replace(/^\//, '');
      // Encode path for URL, but display decoded name
      const encodedPath = cleanDirPath.split('/').map(seg => encodeURIComponent(seg)).join('/');
      const displayDirName = decodeURIComponent(dir.name);
      markdown += `- **[${displayDirName}](${DocLightUtils.prefixPath(`/doc/${encodedPath}`)})**\n`;
    }

    markdown += '\n';
  }

  // Documents section
  if (treeData.files && treeData.files.length > 0) {
    markdown += `## Documents\n\n`;

    for (const file of treeData.files) {
      // Only show .md files
      if (!file.name.endsWith('.md')) continue;

      const filePath = folderPath ? `${folderPath}/${file.name}` : file.name;
      const cleanFilePath = filePath.replace(/^\//, '').replace(/\.md$/, '');

      // Display name without .md extension (decode for display)
      const displayName = decodeURIComponent(file.name.replace(/\.md$/, ''));

      // Encode path for URL
      const encodedPath = cleanFilePath.split('/').map(seg => encodeURIComponent(seg)).join('/');

      // File size (human readable)
      const sizeKB = (file.size / 1024).toFixed(1);

      markdown += `- [📄 ${displayName}](${DocLightUtils.prefixPath(`/doc/${encodedPath}`)}) _${sizeKB} KB_\n`;
    }

    markdown += '\n';
  }

  // Empty folder message
  if ((!treeData.dirs || treeData.dirs.length === 0) &&
      (!treeData.files || treeData.files.length === 0)) {
    markdown += `\n---\n\n`;
    markdown += `_This folder is empty._\n\n`;
  }

  // Footer with stats
  const totalDirs = treeData.dirs ? treeData.dirs.length : 0;
  const totalFiles = treeData.files ? treeData.files.filter(f => f.name.endsWith('.md')).length : 0;

  markdown += `\n---\n\n`;
  markdown += `**Total**: ${totalDirs} subdirectories, ${totalFiles} documents\n`;

  return markdown;
}

// Expand folder path to make file visible in tree
async function expandPathToFile(filePath) {
  // Parse path to get parent folders
  const parts = filePath.split('/');
  parts.pop(); // Remove filename

  if (parts.length === 0) {
    // File is at root level, no expansion needed
    return;
  }

  // Expand each parent folder sequentially
  let currentPath = '';
  for (const part of parts) {
    currentPath = currentPath ? `${currentPath}/${part}` : part;

    // Find the folder wrapper in DOM with retry logic
    // (Wait for buildTree state restoration to complete)
    const maxRetries = 10;
    const retryDelay = 300; // ms
    let wrapper = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      wrapper = document.querySelector(`.tree-item-wrapper[data-path="${currentPath}"]`);

      if (wrapper) break; // Found it!

      if (attempt < maxRetries - 1) {
        // Wait and retry
        console.log(`Waiting for folder ${currentPath} (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }

    if (!wrapper) {
      console.warn(`Folder not found after ${maxRetries} retries: ${currentPath}`);
      continue;
    }

    // Check if already expanded
    const childrenContainer = wrapper.querySelector('.tree-children');
    if (childrenContainer && childrenContainer.style.display === 'none') {
      // Need to expand
      const dirItem = wrapper.querySelector('.tree-item.directory');
      const expandIcon = wrapper.querySelector('.expand-icon');

      if (dirItem && expandIcon) {
        // Calculate level for toggleDirectory
        const level = parseInt(dirItem.style.paddingLeft) / 1.2;

        // Directly call toggleDirectory and wait for completion
        await toggleDirectory(currentPath, wrapper, childrenContainer, expandIcon, level + 1);
      }
    }
  }
}

/**
 * Expand parent folders for a given file path
 * Step 9.3: Navigation fix - ensure parent folders are expanded
 *
 * @param {string} filePath - File path (e.g., 'test-zip/file1.md')
 */
async function expandParentFolders(filePath) {
  if (!filePath || !filePath.includes('/')) {
    return; // Root level file, no parent folders
  }

  // Extract directory path (remove file name)
  const parts = filePath.split('/');
  parts.pop(); // Remove file name

  if (parts.length === 0) {
    return; // No parent folders
  }

  // Expand each parent folder sequentially
  let currentPath = '';
  for (const part of parts) {
    currentPath = currentPath ? `${currentPath}/${part}` : part;

    // Find the folder wrapper in DOM with retry logic
    // (Wait for buildTree state restoration to complete)
    const maxRetries = 10;
    const retryDelay = 300; // ms
    let wrapper = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      wrapper = document.querySelector(`.tree-item-wrapper[data-path="${currentPath}"]`);

      if (wrapper) break; // Found it!

      if (attempt < maxRetries - 1) {
        // Wait and retry
        console.log(`Waiting for folder ${currentPath} (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }

    if (!wrapper) {
      console.warn(`Folder not found after ${maxRetries} retries: ${currentPath}`);
      continue;
    }

    // Check if already expanded
    const childrenContainer = wrapper.querySelector('.tree-children');
    if (childrenContainer && childrenContainer.style.display === 'none') {
      // Need to expand
      const dirItem = wrapper.querySelector('.tree-item.directory');
      const expandIcon = wrapper.querySelector('.expand-icon');

      if (dirItem && expandIcon) {
        // Calculate level for toggleDirectory
        const level = parseInt(dirItem.style.paddingLeft) / 1.2;

        // Directly call toggleDirectory and wait for completion
        await toggleDirectory(currentPath, wrapper, childrenContainer, expandIcon, level + 1);
      }
    }
  }
}

// Load file and render
async function loadFile(path, hash = '', updateUrl = true, skipScroll = false) {
  try {
    // Close mobile menu if open (mobile only)
    if (window.innerWidth <= 768 && leftMobilePanel) {
      leftMobilePanel.close();
    }

    // Save current scroll position before navigating (for back button)
    if (updateUrl) {
      const mainContent = document.querySelector('.main-content');
      const currentState = window.history.state;
      if (currentState && mainContent) {
        window.history.replaceState({
          ...currentState,
          scrollTop: mainContent.scrollTop
        }, '', window.location.href);
      }
    }

    // Update breadcrumb
    document.getElementById('breadcrumb').textContent = path;

    // Step 13: Phase 6 - Try server-side HTML cache first
    let htmlContent;
    let tocData;
    let fromCache = false;

    try {
      const response = await fetch(DocLightUtils.prefixPath(`/api/html?path=${encodeURIComponent(path)}`));

      if (response.ok) {
        const data = await response.json();
        htmlContent = data.html;
        tocData = data.toc;
        fromCache = data.fromCache;

        console.log('Loaded from server cache', {
          path,
          fromCache,
          htmlSize: htmlContent.length,
          tocItems: tocData.length
        });
      } else {
        throw new Error(`Server cache unavailable: HTTP ${response.status}`);
      }
    } catch (cacheError) {
      // Fallback to client-side rendering
      console.warn('Falling back to client-side rendering:', cacheError.message);
      const content = await fetchRaw(path);
      await renderMarkdown(content);
      tocData = generateTOC();
    }

    // Remove folder-list-view class (if previously set)
    const contentDiv = document.getElementById('markdown-content');
    contentDiv.classList.remove('folder-list-view');

    // If we got HTML from cache, inject it directly
    if (htmlContent) {
      contentDiv.innerHTML = htmlContent;

      // Process Mermaid diagrams if present (using shared module)
      await DocLightUtils.renderMermaidDiagrams(contentDiv);

      // Add copy buttons to code blocks (same as renderMarkdown)
      addCopyButtons(contentDiv);

      // Add anchor links to headings (same as renderMarkdown)
      addHeadingAnchors(contentDiv);

      // Add document navigation (prev/next)
      addDocumentNavigation(contentDiv);

      // Add click handlers for internal links (SPA navigation)
      addInternalLinkHandlers(contentDiv);
    }

    // Add document title (filename without .md)
    addDocumentTitle(path, contentDiv);

    // Render TOC (either from cache or generated)
    renderTOC(tocData);

    // Initialize scroll sync (Step 12: Phase 3)
    if (tocData.length > 0) {
      initTOCScrollSync();
    }

    // Update active state
    document.querySelectorAll('.tree-item').forEach(item => {
      item.classList.remove('active');
    });

    // Expand parent folders if needed (Step 9.3 fix)
    await expandParentFolders(path);

    const activeItem = document.querySelector(`.tree-item[data-path="${path}"]`);
    if (activeItem) {
      activeItem.classList.add('active');
    }

    // Update URL if requested
    if (updateUrl) {
      // Clean URL: remove .md extension
      const cleanPath = path.replace(/\.md$/, '');

      // Encode each path segment, but keep / separator
      const encodedPath = cleanPath.split('/').map(seg => encodeURIComponent(seg)).join('/');
      const newUrl = DocLightUtils.prefixPath(`/doc/${encodedPath}${hash ? '#' + hash : ''}`);

      // Save both paths in history state
      window.history.pushState({
        path: path,           // Real file path (e.g., '/guide/intro.md')
        cleanPath: cleanPath, // Clean path for display (e.g., '/guide/intro')
        hash: hash
      }, '', newUrl);
    }

    // Handle scrolling after all DOM operations complete
    const mainContent = document.querySelector('.main-content');

    if (hash) {
      // Hash provided: scroll to specific section
      // Wait for rendering and retry if element not found
      const maxRetries = 5;
      const retryDelay = 200;

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));

        const targetElement = document.getElementById(hash);
        if (targetElement) {
          targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
          // Update TOC active state
          updateActiveTOCItem(hash);
          break;
        }

        if (attempt < maxRetries - 1) {
          console.log(`Waiting for target element #${hash} (attempt ${attempt + 1}/${maxRetries})`);
        }
      }
    } else if (!skipScroll) {
      // No hash: scroll main-content to top (unless skipScroll is true)
      if (mainContent) {
        mainContent.scrollTop = 0;
      }
    }

    // Save last opened
    await saveLastOpened(path);
  } catch (error) {
    console.error('Failed to load file:', error);
    const userMessage = ErrorHandler.getUserMessage(error, 'File');
    ErrorHandler.showError(userMessage, error.message);
  }
}

// Check if index file is configured
async function checkIndexFile() {
  try {
    const response = await fetch(DocLightUtils.prefixPath('/api/config/index'));
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    return data.indexFile; // Returns null if no index configured
  } catch (error) {
    console.warn('Failed to check index file:', error.message);
    return null;
  }
}

// Show welcome screen programmatically
async function showWelcomeScreen() {
  const contentDiv = document.getElementById('markdown-content');
  const breadcrumb = document.getElementById('breadcrumb');

  // Update breadcrumb
  breadcrumb.innerHTML = '<span>Select a document</span>';

  // Show simple welcome screen
  contentDiv.innerHTML = `
    <div class="welcome">
      <div class="welcome-header">
        <h1>Welcome to DocuLight</h1>
        <p class="welcome-subtitle">A lightweight Markdown documentation viewer and management system</p>
      </div>
    </div>
  `;

  // Clear TOC (Issue 2: Welcome 페이지에서 이전 TOC 표시 방지)
  renderTOC([]);

  // Clear active state from tree
  document.querySelectorAll('.tree-item').forEach(item => {
    item.classList.remove('active');
  });

  // Clear lastOpened from IndexedDB (Issue 1)
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction('lastOpened', 'readwrite');
      const store = tx.objectStore('lastOpened');
      const request = store.delete('file');

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.warn('Failed to clear lastOpened:', error);
  }

  // Clear URL
  window.history.pushState({}, '', DocLightUtils.prefixPath('/'));
}

// Initialize application
async function init() {
  try {
    // Initialize IndexedDB
    await initDB();

    // Load tree
    const treeData = await fetchTree('/');
    const treeMenu = document.getElementById('tree-menu');
    await buildTree(treeData, treeMenu);

    // Step 9.3: Recursively fetch all files for document navigation
    flatFileList = await fetchAllFilesRecursive('/');
    console.log(`[Step 9.3] Loaded ${flatFileList.length} files for navigation`);

    // Tree item click event delegation (Step 9.2)
    treeMenu.addEventListener('click', async (e) => {
      // First check if we clicked on a folder item or its children
      const directoryItem = e.target.closest('.tree-item.directory');

      if (directoryItem) {
        // Folder item clicked
        const wrapper = directoryItem.closest('.tree-item-wrapper');
        if (!wrapper) return;

        const dirPath = wrapper.dataset.path;
        e.stopPropagation();

        // Check if expand-icon was specifically clicked
        const expandIcon = e.target.closest('.expand-icon');
        if (expandIcon) {
          // Toggle icon clicked → expand/collapse tree
          const childrenContainer = wrapper.querySelector('.tree-children');
          const icon = wrapper.querySelector('.expand-icon');
          const level = parseInt(directoryItem.style.paddingLeft) / 1.2;

          await toggleDirectory(dirPath, wrapper, childrenContainer, icon, level + 1);
        } else {
          // Other parts of folder clicked → show folder list in main area
          await showFolderList(dirPath);
        }
      }
    });

    // Tree item double-click event delegation (Step 9.2)
    treeMenu.addEventListener('dblclick', async (e) => {
      // First check if we double-clicked on a folder item
      const directoryItem = e.target.closest('.tree-item.directory');

      if (directoryItem) {
        // Folder item double-clicked → expand/collapse tree
        const wrapper = directoryItem.closest('.tree-item-wrapper');
        if (!wrapper) return;

        const dirPath = wrapper.dataset.path;
        e.stopPropagation();

        const childrenContainer = wrapper.querySelector('.tree-children');
        const expandIcon = wrapper.querySelector('.expand-icon');
        const level = parseInt(directoryItem.style.paddingLeft) / 1.2;

        await toggleDirectory(dirPath, wrapper, childrenContainer, expandIcon, level + 1);
      }
    });

    // Refresh button
    document.getElementById('refresh-btn').addEventListener('click', async () => {
      try {
        treeMenu.innerHTML = '<div class="loading">Loading...</div>';
        const treeData = await fetchTree('/');
        treeMenu.innerHTML = '';
        await buildTree(treeData, treeMenu);

        // Step 9.3: Re-fetch all files for navigation
        flatFileList = await fetchAllFilesRecursive('/');
        console.log(`[Step 9.3] Reloaded ${flatFileList.length} files after refresh`);
      } catch (error) {
        console.error('Failed to refresh tree:', error);
        const userMessage = ErrorHandler.getUserMessage(error, 'Directory tree');
        treeMenu.innerHTML = `
          <div class="tree-error">
            <p>${userMessage}</p>
            <p class="error-details">${error.message}</p>
          </div>
        `;
      }
    });

    // Expand All button (Step 9.3)
    document.getElementById('expand-all-btn')?.addEventListener('click', async () => {
      try {
        await expandAll();
      } catch (error) {
        console.error('Error in expand all:', error);
      }
    });

    // Collapse All button (Step 9.3)
    document.getElementById('collapse-all-btn')?.addEventListener('click', async () => {
      try {
        await collapseAll();
      } catch (error) {
        console.error('Error in collapse all:', error);
      }
    });

    // Initialize search feature (Step 8.4)
    initSearchFeature();

    // Initialize TOC toggle (Step 12: Phase 2-3)
    await initTOCToggle();

    // Sidebar header click - navigate to welcome or index
    const sidebarTitle = document.querySelector('.sidebar-title');
    if (sidebarTitle) {
      sidebarTitle.addEventListener('click', async () => {
        const homePath = DocLightUtils.prefixPath('/');
        // If not on home page, do a full navigation to home
        if (window.location.pathname !== homePath) {
          window.location.href = homePath;
          return;
        }

        // Already on home - chatbot mode: do nothing
        if (window.CHATBOT_MODE) {
          return;
        }

        // Check if index file is configured
        const indexFile = await checkIndexFile();
        if (indexFile) {
          // Navigate to index file
          try {
            await expandPathToFile(indexFile);
            await loadFile(indexFile, '', true);
          } catch (error) {
            console.warn('Failed to load index file:', error.message);
            await showWelcomeScreen();
          }
        } else {
          // Show welcome screen
          await showWelcomeScreen();
        }
      });

      // Add keyboard navigation support (Enter key)
      sidebarTitle.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          sidebarTitle.click();
        }
      });

      // Make it focusable for keyboard navigation
      sidebarTitle.setAttribute('tabindex', '0');
      sidebarTitle.setAttribute('role', 'button');
      sidebarTitle.setAttribute('aria-label', 'Navigate to home');
    }

    // Check URL for document path
    const pathname = window.location.pathname;
    const bp = DocLightUtils.getBasePath();
    // Strip basePath prefix from pathname for route matching
    const strippedPath = bp && pathname.startsWith(bp) ? pathname.substring(bp.length) : pathname;
    const hashRaw = window.location.hash.substring(1); // Remove '#'
    const hash = hashRaw ? decodeURIComponent(hashRaw) : ''; // Decode hash
    let pathFromUrl = null;

    if (strippedPath.startsWith('/doc/')) {
      // Extract path from /doc/... URL and decode each segment
      const rawPath = strippedPath.substring(5); // Remove '/doc/'
      pathFromUrl = rawPath.split('/').map(seg => decodeURIComponent(seg)).join('/');

      // Clean URL handling: add .md extension if not present
      if (pathFromUrl && !pathFromUrl.endsWith('.md')) {
        pathFromUrl = pathFromUrl + '.md';
      }
    }

    if (pathFromUrl) {
      // Try to load as file first, then as folder (Step 9.2)
      const folderPath = pathFromUrl.replace(/\.md$/, '');

      // Try loading as file
      let isFile = false;
      try {
        // Check if it's a file by trying to fetch it
        const testResponse = await fetch(DocLightUtils.prefixPath(`/api/raw?path=${encodeURIComponent(pathFromUrl)}`));
        isFile = testResponse.ok;
      } catch (e) {
        isFile = false;
      }

      if (isFile) {
        // Load as file
        try {
          await expandPathToFile(pathFromUrl);
          await loadFile(pathFromUrl, hash, false);
        } catch (error) {
          console.error('Failed to load file:', error);
          ErrorHandler.showError('Failed to load file', error.message);
        }
      } else {
        // Try as folder
        try {
          await showFolderList(folderPath);
        } catch (error) {
          console.error('Failed to load folder:', error);
          ErrorHandler.showError('Not found', `Path "${pathname}" does not exist`);
        }
      }
    } else if (window.CHATBOT_MODE) {
      // Chatbot mode: skip index file loading, chatbot.js handles UI
      console.log('[app.js] Chatbot mode enabled, skipping markdown initialization');
    } else {
      // Check for configured index file (second priority)
      const indexFile = await checkIndexFile();
      if (indexFile) {
        try {
          await expandPathToFile(indexFile);
          await loadFile(indexFile, '', true); // Update URL
        } catch (error) {
          console.warn('Failed to load configured index file:', error.message);
          // Fallback to last opened file
          const lastOpened = await getLastOpened();
          if (lastOpened) {
            try {
              await expandPathToFile(lastOpened);
              await loadFile(lastOpened, '', true); // Update URL
            } catch (error) {
              console.warn('Failed to load last opened file:', error.message);
            }
          }
        }
      } else {
        // Fallback to last opened file (third priority)
        const lastOpened = await getLastOpened();
        if (lastOpened) {
          try {
            await expandPathToFile(lastOpened);
            await loadFile(lastOpened, '', true); // Update URL
          } catch (error) {
            console.warn('Failed to load last opened file:', error.message);
          }
        }
      }
    }

    // Handle browser back/forward buttons
    window.addEventListener('popstate', async (event) => {
      if (event.state && event.state.path) {
        try {
          await expandPathToFile(event.state.path);
          await loadFile(event.state.path, event.state.hash || '', false);

          // Restore scroll position after loading
          if (event.state.scrollTop !== undefined) {
            const mainContent = document.querySelector('.main-content');
            if (mainContent) {
              // Use requestAnimationFrame to ensure DOM is ready
              requestAnimationFrame(() => {
                mainContent.scrollTop = event.state.scrollTop;
              });
            }
          }
        } catch (error) {
          console.error('Failed to load file from history:', error);
        }
      }
    });
  } catch (error) {
    console.error('Initialization error:', error);
    const userMessage = ErrorHandler.getUserMessage(error);
    ErrorHandler.showError(
      'An error occurred while initializing the application.',
      `${userMessage}\n${error.message}`
    );
  }
}

/**
 * Initialize search feature (Step 8.4)
 * Handles search UI toggle, real-time search, and result display
 */
function initSearchFeature() {
  const searchToggleBtn = document.getElementById('search-toggle-btn');
  const searchCloseBtn = document.getElementById('search-close-btn');
  const searchPanel = document.getElementById('search-panel');
  const treeMenu = document.getElementById('tree-menu');
  const treeControls = document.getElementById('tree-controls');
  const searchInput = document.getElementById('search-input');
  const searchResults = document.getElementById('search-results');

  if (!searchToggleBtn || !searchPanel || !searchInput) return;

  // Debounce timer for search input
  let searchTimeout;

  // Flag to prevent re-searching during result navigation
  let isNavigatingToResult = false;

  // Flag to track IME composition state (for Korean, Japanese, Chinese input)
  let isComposing = false;

  /**
   * Toggle search panel visibility
   */
  searchToggleBtn.addEventListener('click', () => {
    const isSearchVisible = searchPanel.style.display !== 'none';

    if (isSearchVisible) {
      // Close search
      searchPanel.style.display = 'none';
      treeMenu.style.display = 'block';
      if (treeControls) treeControls.style.display = 'flex';
      searchInput.value = '';
      searchResults.innerHTML = '';
    } else {
      // Open search
      searchPanel.style.display = 'flex';
      treeMenu.style.display = 'none';
      if (treeControls) treeControls.style.display = 'none';
      searchInput.focus();
    }
  });

  /**
   * Close search button
   */
  if (searchCloseBtn) {
    searchCloseBtn.addEventListener('click', () => {
      searchPanel.style.display = 'none';
      treeMenu.style.display = 'block';
      if (treeControls) treeControls.style.display = 'flex';
      searchInput.value = '';
      searchResults.innerHTML = '';
    });
  }

  /**
   * Handle IME composition events (Korean, Japanese, Chinese input)
   */
  searchInput.addEventListener('compositionstart', () => {
    isComposing = true;
    console.log('[DEBUG] IME composition started');
  });

  searchInput.addEventListener('compositionend', () => {
    isComposing = false;
    console.log('[DEBUG] IME composition ended');
  });

  /**
   * Real-time search with debounce (300ms)
   */
  searchInput.addEventListener('input', (e) => {
    // Ignore input events during result navigation
    if (isNavigatingToResult) {
      console.log('[DEBUG] Input event ignored - navigating to result');
      return;
    }

    // Ignore input events during IME composition
    if (isComposing) {
      console.log('[DEBUG] Input event ignored - IME composing');
      return;
    }

    const query = e.target.value.trim();
    console.log('[DEBUG] Input event triggered, query:', query);

    // Clear previous timeout
    clearTimeout(searchTimeout);

    // Clear results if query is too short
    if (query.length < 2) {
      searchResults.innerHTML = '';
      return;
    }

    // Show loading state
    searchResults.innerHTML = '<div class="search-loading">Searching...</div>';

    // Debounce search
    searchTimeout = setTimeout(async () => {
      try {
        const data = await fetchSearch(query, 50);

        if (data.results.length === 0) {
          searchResults.innerHTML = `
            <div class="search-results empty">
              <p>No results found for "<strong>${escapeHtml(query)}</strong>"</p>
            </div>
          `;
          return;
        }

        // Display results as HTML elements
        searchResults.innerHTML = '';
        data.results.forEach(result => {
          const itemDiv = document.createElement('div');
          itemDiv.className = 'search-result-item';
          itemDiv.dataset.path = result.path;  // Store path directly in dataset
          itemDiv.dataset.query = query;  // Store search query for text fragment scroll

          // File path
          const pathDiv = document.createElement('div');
          pathDiv.className = 'search-result-path';
          pathDiv.textContent = result.path;
          itemDiv.appendChild(pathDiv);

          // Matches container (card style)
          const matchesContainer = document.createElement('div');
          matchesContainer.className = 'search-matches-container';

          // Show ALL matches (no limit, no expand button)
          result.matches.forEach((match, idx) => {
            const contentDiv = document.createElement('div');
            contentDiv.className = 'search-result-content';
            contentDiv.dataset.matchIndex = idx;  // Store match index for specific scroll
            contentDiv.innerHTML = DOMPurify.sanitize(match.content, {
              ALLOWED_TAGS: ['mark'],
              ALLOWED_ATTR: []
            });
            matchesContainer.appendChild(contentDiv);
          });

          itemDiv.appendChild(matchesContainer);

          // Total match count (if more than 1)
          if (result.matches.length > 1) {
            const countDiv = document.createElement('div');
            countDiv.className = 'search-match-count';
            countDiv.textContent = `${result.matches.length} matches in this file`;
            itemDiv.appendChild(countDiv);
          }

          searchResults.appendChild(itemDiv);
        });

        // Event listeners are now handled by event delegation (see below)
        // No need to attach listeners here
      } catch (error) {
        console.error('Search failed:', error);
        searchResults.innerHTML = `
          <div class="search-results empty">
            <p>Search failed. Please try again.</p>
          </div>
        `;
      }
    }, 300); // 300ms debounce
  });

  /**
   * Event delegation for search result clicks
   * This ensures clicks work even after DOM changes
   * Supports clicking on specific match cards to scroll to that match
   */
  searchResults.addEventListener('click', async (e) => {
    // Check if a specific match card was clicked
    const clickedCard = e.target.closest('.search-result-content');
    const clickedItem = e.target.closest('.search-result-item');

    if (!clickedItem) return; // Not a search result item

    e.preventDefault();
    e.stopPropagation();

    const path = clickedItem.dataset.path;
    const searchQuery = clickedItem.dataset.query;

    if (!path) return;

    // Set flag IMMEDIATELY before any async operations
    // This prevents race condition with input event
    console.log('[DEBUG] Setting isNavigatingToResult = true');
    isNavigatingToResult = true;

    // Lock search input to prevent browser/IME from changing value
    const savedValue = searchInput.value;
    searchInput.readOnly = true;
    console.log('[DEBUG] Search input locked (readOnly)');

    // Determine which match to scroll to
    let matchIndex = 0;  // Default: first match
    if (clickedCard && clickedCard.dataset.matchIndex !== undefined) {
      matchIndex = parseInt(clickedCard.dataset.matchIndex);
    }

    console.log('[DEBUG] Navigating to:', path, 'matchIndex:', matchIndex);

    try {

      // Keep search panel open
      // Load file (skipScroll=true to prevent scroll to top)
      await loadFile(path, '', true, true);

      // Scroll to specific match and highlight it (no animation)
      if (searchQuery) {
        // Wait for rendering to complete
        await new Promise(resolve => setTimeout(resolve, 100));

        scrollToSearchTerm(searchQuery, matchIndex);

        // Wait a bit more to ensure scrollToSearchTerm completes
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    } catch (error) {
      console.error('Failed to load search result:', error);
    } finally {
      // Reset all flags and unlock input after operations complete
      setTimeout(() => {
        searchInput.value = savedValue;  // Restore value if changed
        searchInput.readOnly = false;    // Unlock input
        console.log('[DEBUG] Search input unlocked, isNavigatingToResult = false');
        isNavigatingToResult = false;
      }, 100);
    }
  });
}

/**
 * Escape HTML special characters for safe display
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Scroll to search term and highlight it (Custom implementation for SPA)
 * @param {string} searchQuery - The search term to find and scroll to
 * @param {number} matchIndex - Index of the match to scroll to (0-based, default: 0)
 */
function scrollToSearchTerm(searchQuery, matchIndex = 0) {
  const contentDiv = document.getElementById('markdown-content');
  if (!contentDiv) return;

  // Create a case-insensitive regex for the search term
  const regex = new RegExp(searchQuery, 'gi');

  // TreeWalker to find text nodes
  const walker = document.createTreeWalker(
    contentDiv,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: function(node) {
        // Skip script and style tags
        if (node.parentElement.tagName === 'SCRIPT' ||
            node.parentElement.tagName === 'STYLE') {
          return NodeFilter.FILTER_REJECT;
        }
        // Only accept nodes that contain the search term
        return regex.test(node.textContent) ?
          NodeFilter.FILTER_ACCEPT :
          NodeFilter.FILTER_SKIP;
      }
    }
  );

  // Find all matching text nodes
  const matches = [];
  let node;
  while (node = walker.nextNode()) {
    matches.push(node);
  }

  // Get the target match (default to first if index out of range)
  const targetMatch = matches[matchIndex] || matches[0];

  if (targetMatch) {
    // Reset regex lastIndex
    regex.lastIndex = 0;

    // Get parent element
    const parent = targetMatch.parentElement;

    // Replace text with highlighted version
    const originalHTML = parent.innerHTML;
    const highlightedHTML = parent.innerHTML.replace(regex, (match) => {
      return `<mark class="search-highlight">${match}</mark>`;
    });

    parent.innerHTML = highlightedHTML;

    // Find the mark element and scroll to it (no animation)
    const mark = parent.querySelector('.search-highlight');
    if (mark) {
      mark.scrollIntoView({ behavior: 'auto', block: 'center' });

      // Remove highlight after 3 seconds
      setTimeout(() => {
        parent.innerHTML = originalHTML;
      }, 3000);
    }
  }
}

/**
 * Initialize panel resizer (works for both left and right panels)
 * @param {Object} config
 * @param {string} config.resizerId - Resizer element ID
 * @param {string} config.panelSelector - Panel element selector
 * @param {string} config.direction - 'left' or 'right'
 * @param {number} config.minWidth - Minimum panel width
 * @param {number} config.maxWidth - Maximum panel width
 * @param {string} config.storageKey - localStorage key for saving width
 * @param {Function} config.onResize - Callback when panel is resized (optional)
 */
function initPanelResizer(config) {
  const {
    resizerId,
    panelSelector,
    direction = 'left',
    minWidth = 100,
    maxWidth = 500,
    storageKey,
    onResize = null
  } = config;

  const resizer = document.getElementById(resizerId);
  const panel = document.querySelector(panelSelector);

  if (!resizer || !panel) {
    console.warn('Panel resizer elements not found:', config);
    return;
  }

  let isResizing = false;
  let startX = 0;
  let startWidth = 0;

  resizer.addEventListener('mousedown', (e) => {
    isResizing = true;
    startX = e.clientX;
    startWidth = panel.offsetWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    resizer.classList.add('resizing');

    // Disable transition during resize for smooth real-time update
    if (onResize) {
      const mainContent = document.querySelector('.main-content');
      if (mainContent) {
        mainContent.style.transition = 'none';
      }
    }
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;

    // Calculate delta based on direction
    const delta = direction === 'left'
      ? e.clientX - startX          // Left: drag right to increase
      : startX - e.clientX;          // Right: drag left to increase

    const newWidth = startWidth + delta;

    if (newWidth >= minWidth && newWidth <= maxWidth) {
      panel.style.width = `${newWidth}px`;

      // Call onResize during drag for real-time update (not final)
      if (onResize) {
        onResize(newWidth, false);
      }
    }
  });

  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      resizer.classList.remove('resizing');

      // Re-enable transition after resize
      if (onResize) {
        const mainContent = document.querySelector('.main-content');
        if (mainContent) {
          mainContent.style.transition = '';  // Restore default
        }
      }

      // Save width
      if (storageKey) {
        localStorage.setItem(storageKey, panel.offsetWidth);
      }

      // Final onResize call (for any cleanup and DB save)
      if (onResize) {
        onResize(panel.offsetWidth, true);  // isFinal = true
      }
    }
  });

  // Restore saved width
  if (storageKey) {
    const savedWidth = localStorage.getItem(storageKey);
    if (savedWidth) {
      panel.style.width = `${savedWidth}px`;
    }
  }
}

/**
 * Initialize mobile panel (overlay + toggle)
 * @param {Object} config
 * @param {string} config.panelSelector - Panel element selector
 * @param {string} config.toggleBtnId - Toggle button ID
 * @param {string} config.closeBtnId - Close button ID (optional)
 * @param {string} config.overlayId - Overlay element ID
 * @param {boolean} config.autoCloseOnItemClick - Auto close when item clicked
 * @returns {Object} { open, close, toggle } - Control functions
 */
function initMobilePanel(config) {
  const {
    panelSelector,
    toggleBtnId,
    closeBtnId = null,
    overlayId,
    autoCloseOnItemClick = false
  } = config;

  const panel = document.querySelector(panelSelector);
  const toggleBtn = document.getElementById(toggleBtnId);
  const closeBtn = closeBtnId ? document.getElementById(closeBtnId) : null;
  const overlay = document.getElementById(overlayId);

  if (!panel || !toggleBtn || !overlay) {
    console.warn('Mobile panel elements not found:', config);
    return null;
  }

  const open = () => {
    panel.classList.add('open');
    overlay.classList.add('active');
  };

  const close = () => {
    panel.classList.remove('open');
    overlay.classList.remove('active');
  };

  const toggle = () => {
    if (panel.classList.contains('open')) {
      close();
    } else {
      open();
    }
  };

  // Toggle button click
  toggleBtn.addEventListener('click', toggle);

  // Close button click
  if (closeBtn) {
    closeBtn.addEventListener('click', close);
  }

  // Overlay click
  overlay.addEventListener('click', close);

  // Auto close on item click (mobile only)
  if (autoCloseOnItemClick) {
    panel.addEventListener('click', (e) => {
      const clickedItem = e.target.closest('.toc-item, .tree-item.file');
      if (clickedItem && window.innerWidth <= 768) {
        close();
      }
    });
  }

  return { open, close, toggle };
}

// Global reference for mobile panel control
let leftMobilePanel = null;
let rightTOCPanel = null;

/**
 * Initialize TOC toggle button
 * Step 12: Phase 2-3
 */
async function initTOCToggle() {
  const tocToggleBtn = document.getElementById('toc-toggle-btn');
  const tocSidebar = document.getElementById('toc-sidebar');
  const tocOverlay = document.getElementById('toc-overlay');
  const mainContent = document.querySelector('.main-content');
  const contentHeader = document.querySelector('.content-header');

  if (!tocToggleBtn || !tocSidebar) {
    console.warn('TOC elements not found');
    return;
  }

  // Scroll listener for floating button
  if (mainContent && contentHeader) {
    mainContent.addEventListener('scroll', () => {
      const scrollTop = mainContent.scrollTop;
      const headerHeight = contentHeader.offsetHeight;

      if (scrollTop > headerHeight) {
        tocToggleBtn.classList.add('floating');
      } else {
        tocToggleBtn.classList.remove('floating');
      }
    });
  }

  // Restore state from IndexedDB (Phase 3)
  const savedState = await getTOCState();
  if (savedState) {
    if (savedState.isOpen) {
      tocSidebar.classList.add('open');

      // Hide toggle button when restoring open state
      tocToggleBtn.classList.add('hidden');

      // Adjust main-content margin for desktop
      if (window.innerWidth > 768 && mainContent) {
        mainContent.style.marginRight = `${savedState.width || 250}px`;
      }
    }
    if (savedState.width) {
      tocSidebar.style.width = `${savedState.width}px`;
    }
  }

  // Toggle button click
  tocToggleBtn.addEventListener('click', async () => {
    const isOpen = tocSidebar.classList.toggle('open');

    // Hide/show toggle button when TOC opens/closes
    if (isOpen) {
      // TOC opened: hide non-floating button
      if (!tocToggleBtn.classList.contains('floating')) {
        tocToggleBtn.classList.add('hidden');
      }
    } else {
      // TOC closed: show button
      tocToggleBtn.classList.remove('hidden');
    }

    // Desktop: adjust main-content margin
    if (window.innerWidth > 768 && mainContent) {
      if (isOpen) {
        mainContent.style.marginRight = `${tocSidebar.offsetWidth}px`;
      } else {
        mainContent.style.marginRight = '0';
      }
    }

    // Mobile: show overlay
    if (window.innerWidth <= 768 && tocOverlay) {
      tocOverlay.classList.toggle('active', isOpen);
    }

    // Save state (Phase 3)
    await saveTOCState(isOpen, tocSidebar.offsetWidth);
  });

  // Close button click
  const tocCloseBtn = document.getElementById('toc-close-btn');
  if (tocCloseBtn) {
    tocCloseBtn.addEventListener('click', async () => {
      closeTOCSidebar();
      // Show toggle button
      tocToggleBtn.classList.remove('hidden');
      // Desktop: reset margin
      if (window.innerWidth > 768 && mainContent) {
        mainContent.style.marginRight = '0';
      }
      // Save state
      await saveTOCState(false, tocSidebar.offsetWidth);
    });
  }

  // Overlay click (mobile)
  if (tocOverlay) {
    tocOverlay.addEventListener('click', async () => {
      closeTOCSidebar();
      // Show toggle button
      tocToggleBtn.classList.remove('hidden');
      // Save state
      await saveTOCState(false, tocSidebar.offsetWidth);
    });
  }
}

// Close mobile menu on popstate
window.addEventListener('popstate', () => {
  if (window.innerWidth <= 768 && leftMobilePanel) {
    leftMobilePanel.close();
  }
});

// ============================================================
// Phase 7: Drag-and-Drop Local Preview
// ============================================================

/**
 * Local Preview State Management
 * Allows viewing local .md files without uploading to server
 */
const LocalPreview = {
  // State
  isActive: false,
  fileName: null,
  state: 'IDLE', // IDLE | DRAG_OVER | PROCESSING | PREVIEWING | ERROR

  // Configuration
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  ALLOWED_EXTENSIONS: ['.md', '.markdown'],
  ALLOWED_MIME_TYPES: ['text/markdown', 'text/x-markdown', 'text/plain', ''],

  /**
   * Initialize drag-and-drop event listeners
   */
  init() {
    const body = document.body;

    // Drag enter
    body.addEventListener('dragenter', (e) => {
      e.preventDefault();
      if (this.hasMarkdownFile(e)) {
        this.setState('DRAG_OVER');
        this.showDropOverlay();
      }
    });

    // Drag over (required to enable drop event)
    body.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (this.hasMarkdownFile(e)) {
        e.dataTransfer.dropEffect = 'copy';
      }
    });

    // Drag leave
    body.addEventListener('dragleave', (e) => {
      // relatedTarget is null when leaving the window
      if (!e.relatedTarget || e.relatedTarget === document.documentElement) {
        this.setState('IDLE');
        this.hideDropOverlay();
      }
    });

    // Drop
    body.addEventListener('drop', async (e) => {
      e.preventDefault();
      this.hideDropOverlay();

      const file = this.getMarkdownFile(e);
      if (file) {
        await this.renderLocalFile(file);
      } else {
        this.setState('IDLE');
      }
    });

    // Keyboard shortcut: Ctrl+O to open file dialog
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
        e.preventDefault();
        this.openFileDialog();
      }
      // ESC to close preview
      if (e.key === 'Escape' && this.isActive) {
        this.close();
      }
    });

    // Create hidden file input for keyboard access
    this.createHiddenFileInput();

    console.log('[LocalPreview] Initialized');
  },

  /**
   * State change with screen reader announcement
   */
  setState(newState) {
    const oldState = this.state;
    this.state = newState;
    console.log(`[LocalPreview] State: ${oldState} → ${newState}`);

    // Screen reader announcement
    this.announceToScreenReader(this.getStateMessage(newState));
  },

  /**
   * Get message for each state
   */
  getStateMessage(state) {
    const messages = {
      'IDLE': '',
      'DRAG_OVER': 'Drop markdown file here',
      'PROCESSING': 'Reading file...',
      'PREVIEWING': 'Local file preview opened',
      'ERROR': 'Error processing file'
    };
    return messages[state] || '';
  },

  /**
   * Screen reader announcement via ARIA live region
   */
  announceToScreenReader(message) {
    if (!message) return;

    let liveRegion = document.getElementById('local-preview-live-region');
    if (!liveRegion) {
      liveRegion = document.createElement('div');
      liveRegion.id = 'local-preview-live-region';
      liveRegion.setAttribute('role', 'status');
      liveRegion.setAttribute('aria-live', 'polite');
      liveRegion.setAttribute('aria-atomic', 'true');
      liveRegion.className = 'sr-only';
      document.body.appendChild(liveRegion);
    }

    liveRegion.textContent = message;
  },

  /**
   * Create hidden file input for keyboard access
   */
  createHiddenFileInput() {
    const input = document.createElement('input');
    input.type = 'file';
    input.id = 'local-preview-file-input';
    input.accept = '.md,.markdown';
    input.style.display = 'none';
    input.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (file) {
        await this.renderLocalFile(file);
      }
      input.value = ''; // Allow re-selecting same file
    });
    document.body.appendChild(input);
  },

  /**
   * Open file dialog (Ctrl+O)
   */
  openFileDialog() {
    const input = document.getElementById('local-preview-file-input');
    if (input) {
      input.click();
    }
  },

  /**
   * Check if drag event has markdown file
   */
  hasMarkdownFile(e) {
    if (!e.dataTransfer?.items) return false;

    for (const item of e.dataTransfer.items) {
      if (item.kind === 'file') {
        const type = item.type;
        if (type === 'text/markdown' || type === 'text/x-markdown') {
          return true;
        }
        // Some browsers don't provide type, allow and verify on drop
        return true;
      }
    }
    return false;
  },

  /**
   * Extract and validate markdown file from drop event
   */
  getMarkdownFile(e) {
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return null;

    const file = files[0];

    // 1. Extension validation
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!this.ALLOWED_EXTENSIONS.includes(ext)) {
      ErrorHandler.show('Only Markdown files (.md, .markdown) can be previewed.', 'warning');
      return null;
    }

    // 2. MIME type validation (some browsers return empty string)
    if (file.type && !this.ALLOWED_MIME_TYPES.includes(file.type)) {
      console.warn(`[LocalPreview] Unexpected MIME type: ${file.type}`);
    }

    // 3. File size validation
    if (file.size > this.MAX_FILE_SIZE) {
      const sizeMB = (file.size / 1024 / 1024).toFixed(1);
      ErrorHandler.show(`File too large (${sizeMB}MB). Maximum 10MB allowed.`, 'error');
      return null;
    }

    // 4. Empty file validation
    if (file.size === 0) {
      ErrorHandler.show('File is empty.', 'warning');
      return null;
    }

    return file;
  },

  /**
   * Show drop overlay
   */
  showDropOverlay() {
    let overlay = document.getElementById('drop-overlay');

    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'drop-overlay';
      overlay.className = 'drop-overlay';
      overlay.innerHTML = `
        <div class="drop-message">
          <span class="drop-icon">📄</span>
          <span class="drop-text">Drop .md file here</span>
        </div>
      `;
      document.body.appendChild(overlay);
    }

    overlay.classList.remove('hidden');
  },

  /**
   * Hide drop overlay
   */
  hideDropOverlay() {
    const overlay = document.getElementById('drop-overlay');
    if (overlay) {
      overlay.classList.add('hidden');
    }
  },

  /**
   * Render local markdown file
   */
  async renderLocalFile(file) {
    this.setState('PROCESSING');

    try {
      // 1. Read file
      const content = await this.readFileAsText(file);

      // 2. Validate UTF-8 encoding
      if (!this.isValidUtf8(content)) {
        throw new Error('File is not UTF-8 encoded.');
      }

      // 3. Parse frontmatter (client-side)
      const { content: markdown, metadata } = this.parseFrontmatter(content);

      // 4. Render markdown (already updates DOM and sanitizes with DOMPurify)
      await renderMarkdown(markdown);

      // 5. Get contentArea (already populated by renderMarkdown)
      const contentArea = document.getElementById('markdown-content');

      // 6. Process local images directly on existing DOM
      this.processLocalImagesOnDOM(contentArea);

      // 7. Update TOC (Table of Contents)
      const tocData = generateTOC();
      renderTOC(tocData);
      if (tocData.length > 0) {
        initTOCScrollSync();
      }

      // 8. Show local preview banner
      this.showPreviewBanner(file.name, metadata);

      // 9. Update state
      this.isActive = true;
      this.fileName = file.name;
      this.setState('PREVIEWING');

      // 10. Render Mermaid diagrams
      if (typeof mermaid !== 'undefined') {
        try {
          await mermaid.run({ nodes: contentArea.querySelectorAll('.mermaid') });
        } catch (mermaidError) {
          console.warn('[LocalPreview] Mermaid error:', mermaidError);
        }
      }

      // 11. Hide navigation (local files have no prev/next)
      this.hideNavigation();

      // 12. Clear tree selection
      const activeItems = document.querySelectorAll('.file-tree .active');
      activeItems.forEach(item => item.classList.remove('active'));

      // 13. Accessibility: move focus
      contentArea.setAttribute('tabindex', '-1');
      contentArea.focus();

      // 14. Update URL
      history.pushState({ localPreview: true, fileName: file.name }, '', '#local-preview');

      console.log('[LocalPreview] Rendered:', file.name, {
        size: file.size,
        hasMetadata: Object.keys(metadata).length > 0
      });

    } catch (error) {
      this.setState('ERROR');
      console.error('[LocalPreview] Error:', error);
      ErrorHandler.show('Error reading file: ' + error.message, 'error');
    }
  },

  /**
   * Validate UTF-8 encoding (simple heuristic)
   */
  isValidUtf8(str) {
    const replacementCount = (str.match(/\uFFFD/g) || []).length;
    return replacementCount < str.length * 0.01; // Less than 1% is OK
  },

  /**
   * Process local image paths (HTML string version)
   */
  processLocalImages(html) {
    const container = document.createElement('div');
    container.innerHTML = html;

    container.querySelectorAll('img').forEach(img => {
      const src = img.getAttribute('src');
      if (!src) return;

      // External URLs and data URIs are preserved
      if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:')) {
        return;
      }

      // Relative paths show warning
      img.classList.add('local-preview-broken-image');
      img.setAttribute('title', `Local image: ${src}\n(Cannot display in preview)`);
      img.setAttribute('alt', `[Image: ${src}]`);
      img.removeAttribute('src'); // Prevent 404 request
      img.setAttribute('data-local-src', src);
    });

    return container.innerHTML;
  },

  /**
   * Process local image paths directly on DOM element
   */
  processLocalImagesOnDOM(container) {
    container.querySelectorAll('img').forEach(img => {
      const src = img.getAttribute('src');
      if (!src) return;

      // External URLs and data URIs are preserved
      if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:')) {
        return;
      }

      // Relative paths show warning
      img.classList.add('local-preview-broken-image');
      img.setAttribute('title', `Local image: ${src}\n(Cannot display in preview)`);
      img.setAttribute('alt', `[Image: ${src}]`);
      img.removeAttribute('src'); // Prevent 404 request
      img.setAttribute('data-local-src', src);
    });
  },

  /**
   * Read file as text
   */
  readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  },

  /**
   * Parse frontmatter (client-side)
   * Same logic as server's frontmatter-service.js
   */
  parseFrontmatter(content) {
    if (!content || typeof content !== 'string') {
      return { content: content || '', metadata: {} };
    }

    // Frontmatter delimited by 4+ hyphens
    const regex = /^(?:\ufeff)?-{4,}\r?\n([\s\S]*?)\r?\n-{4,}(?:\r?\n|$)/;
    const match = content.match(regex);

    if (!match) {
      return { content, metadata: {} };
    }

    const frontmatterBlock = match[1];
    const metadata = {};

    // Parse key: value pairs
    const lines = frontmatterBlock.split(/\r?\n/);
    for (const line of lines) {
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        const key = line.slice(0, colonIndex).trim().toLowerCase();
        const value = line.slice(colonIndex + 1).trim();
        if (value) {
          metadata[key] = value;
        }
      }
    }

    const remainingContent = content.slice(match[0].length);
    return { content: remainingContent, metadata };
  },

  /**
   * Show local preview banner
   */
  showPreviewBanner(fileName, metadata) {
    // Remove existing banner
    this.hidePreviewBanner();

    const banner = document.createElement('div');
    banner.id = 'local-preview-banner';
    banner.className = 'local-preview-banner';

    const displayName = metadata.name || fileName;

    banner.innerHTML = `
      <div class="file-info">
        <span class="file-icon">📄</span>
        <span class="file-name">${this.escapeHtml(displayName)}</span>
        <span class="preview-label">Local Preview</span>
      </div>
      <button class="close-btn" onclick="LocalPreview.close()">Close</button>
    `;

    // Insert at top of content area
    const contentWrapper = document.getElementById('content-wrapper')
      || document.getElementById('markdown-content').parentElement;
    contentWrapper.insertBefore(banner, contentWrapper.firstChild);
  },

  /**
   * Hide preview banner
   */
  hidePreviewBanner() {
    const banner = document.getElementById('local-preview-banner');
    if (banner) {
      banner.remove();
    }
  },

  /**
   * Hide navigation
   */
  hideNavigation() {
    const nav = document.querySelector('.doc-navigation');
    if (nav) {
      nav.style.display = 'none';
    }
  },

  /**
   * Show navigation
   */
  showNavigation() {
    const nav = document.querySelector('.doc-navigation');
    if (nav) {
      nav.style.display = '';
    }
  },

  /**
   * Close local preview
   */
  close() {
    this.hidePreviewBanner();
    this.showNavigation();
    this.isActive = false;
    this.fileName = null;
    this.setState('IDLE');

    // Reset content area
    const contentArea = document.getElementById('markdown-content');
    contentArea.innerHTML = '<p class="placeholder">Select a document from the tree</p>';

    // Restore URL
    history.pushState({}, '', window.location.pathname);

    console.log('[LocalPreview] Closed');
  },

  /**
   * Escape HTML
   */
  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
};

// Start application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  init();

  // Left sidebar resizer (refactored)
  initPanelResizer({
    resizerId: 'resizer',
    panelSelector: '.sidebar',
    direction: 'left',
    minWidth: 100,
    maxWidth: window.innerWidth - 100,
    storageKey: 'sidebarWidth'
  });

  // Left mobile panel (refactored)
  leftMobilePanel = initMobilePanel({
    panelSelector: '.sidebar',
    toggleBtnId: 'mobile-menu-btn',
    closeBtnId: null,
    overlayId: 'mobile-overlay',
    autoCloseOnItemClick: true
  });

  // Right TOC resizer (Step 12: Phase 3)
  // Note: TOC toggle is initialized inside init() after db is ready
  initPanelResizer({
    resizerId: 'right-resizer',
    panelSelector: '.toc-sidebar',
    direction: 'right',
    minWidth: 150,
    maxWidth: 500,
    storageKey: 'tocWidth',
    onResize: (newWidth, isFinal = false) => {
      // Update main-content margin when TOC is resized (desktop only)
      const mainContent = document.querySelector('.main-content');
      const tocSidebar = document.getElementById('toc-sidebar');

      if (mainContent && tocSidebar && window.innerWidth > 768) {
        // Only update if TOC is open
        if (tocSidebar.classList.contains('open')) {
          mainContent.style.marginRight = `${newWidth}px`;
        }
      }

      // Save to IndexedDB when resize is complete
      if (isFinal && tocSidebar) {
        const isOpen = tocSidebar.classList.contains('open');
        saveTOCState(isOpen, newWidth);
      }
    }
  });

  // Phase 7: Initialize Local Preview (drag-and-drop)
  LocalPreview.init();
});
