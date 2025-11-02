// DocuLight Client Application

// Initialize Mermaid
mermaid.initialize({
  startOnLoad: true,
  theme: 'default'
});

// IndexedDB management
const DB_NAME = 'DocuLight';
const DB_VERSION = 1;
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
    const response = await fetchWithRetry(`/api/tree?path=${encodeURIComponent(path)}`);
    return await response.json();
  } catch (error) {
    console.error('Failed to fetch tree:', error);
    throw error;
  }
}

async function fetchRaw(path) {
  try {
    const response = await fetchWithRetry(`/api/raw?path=${encodeURIComponent(path)}`);
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
      `/api/search?query=${encodeURIComponent(query)}&limit=${limit}`
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
          name: file.name
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

/**
 * Wiki 링크 [[path]] → [name](url) 변환
 * Step 9.4: Wiki Links Support
 *
 * @param {string} markdown - 원본 마크다운 콘텐츠
 * @returns {string} - Wiki 링크가 표준 마크다운 링크로 변환된 콘텐츠
 *
 * 예시:
 * - 입력: [[/guide/setup]]
 * - 출력: [setup](/doc/guide/setup)
 */
function preprocessWikiLinks(markdown) {
  // Wiki 링크 패턴: [[경로]]
  const wikiLinkPattern = /\[\[([^\]]+)\]\]/g;

  return markdown.replace(wikiLinkPattern, (match, fullPath) => {
    // 1. 경로 정규화: trim + .md 제거
    let cleanPath = fullPath.trim().replace(/\.md$/, '');

    // 2. 파일명 추출 (표시용)
    const parts = cleanPath.split('/').filter(p => p);
    const displayName = parts[parts.length - 1] || cleanPath;

    // 3. Clean URL 생성 (/doc prefix)
    const url = `/doc${cleanPath.startsWith('/') ? cleanPath : '/' + cleanPath}`;

    // 4. 표준 마크다운 링크 형식으로 변환
    return `[${displayName}](${url})`;
  });
}

// Render markdown
async function renderMarkdown(content) {
  // Step 9.4: Preprocess Wiki links [[]] before markdown parsing
  const preprocessed = preprocessWikiLinks(content);

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

  // Render mermaid diagrams with individual error handling
  const mermaidBlocks = contentDiv.querySelectorAll('code.language-mermaid');
  for (let index = 0; index < mermaidBlocks.length; index++) {
    const block = mermaidBlocks[index];
    const code = block.textContent;
    const id = `mermaid-${index}-${Date.now()}`;
    const container = document.createElement('div');
    container.id = id;
    container.className = 'mermaid';
    container.textContent = code;
    container.setAttribute('data-original-code', code);

    // Replace the code block with mermaid container
    block.parentElement.replaceWith(container);

    // Try to render this specific diagram
    try {
      await mermaid.run({
        nodes: [container]
      });
    } catch (error) {
      console.error(`Mermaid rendering failed for diagram ${index}:`, error);

      // Fallback: show original code block with error message
      const fallbackContainer = document.createElement('div');
      fallbackContainer.className = 'mermaid-error';
      fallbackContainer.innerHTML = `
        <div style="border: 1px solid #ffcccc; background: #fff5f5; padding: 10px; margin: 10px 0; border-radius: 4px;">
          <strong style="color: #cc0000;">⚠️ Mermaid Diagram Rendering Error</strong>
          <details style="margin-top: 8px;">
            <summary style="cursor: pointer; color: #666;">View diagram code</summary>
            <pre style="background: #f5f5f5; padding: 10px; margin-top: 8px; border-radius: 4px; overflow-x: auto;"><code class="language-mermaid">${code.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>
          </details>
        </div>
      `;
      container.replaceWith(fallbackContainer);
    }
  }

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
    const displayName = nav.prev.name.replace(/\.md$/, '');
    const prevLink = document.createElement('a');
    prevLink.href = `/doc/${cleanPath}`;
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
    const displayName = nav.next.name.replace(/\.md$/, '');
    const nextLink = document.createElement('a');
    nextLink.href = `/doc/${cleanPath}`;
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
  const links = contentDiv.querySelectorAll('a[href^="/doc/"]');

  links.forEach(link => {
    link.addEventListener('click', async (e) => {
      e.preventDefault();
      const href = link.getAttribute('href');

      if (!href || !href.startsWith('/doc/')) return;

      // Extract path from /doc/... URL
      const rawPath = href.substring(5); // Remove '/doc/'
      const decodedPath = rawPath.split('/').map(seg => decodeURIComponent(seg)).join('/');

      try {
        // Try to load as file first
        await loadFile(decodedPath + '.md');
      } catch (error) {
        // If file not found, try as folder
        try {
          await loadFolder(decodedPath);
        } catch (folderError) {
          console.error('Failed to load path:', decodedPath, folderError);
          ErrorHandler.showError('Not found', `Path "${decodedPath}" does not exist`);
        }
      }
    });
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
    const fullUrl = `${window.location.origin}/doc/${encodedPath}#${encodedHash}`;

    console.log('Copying URL:', fullUrl);

    // Copy to clipboard
    await navigator.clipboard.writeText(fullUrl);

    // Update URL
    const newUrl = `/doc/${encodedPath}#${encodedHash}`;
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

    const fileIcon = document.createElement('span');
    fileIcon.className = 'tree-icon';
    fileIcon.textContent = '📄';

    // Remove .md extension from display name
    const displayName = file.name.slice(0, -3);

    const nameSpan = document.createElement('span');
    nameSpan.textContent = displayName;

    item.appendChild(fileIcon);
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
    const response = await fetch(`/api/tree?path=${encodeURIComponent(folderPath)}`);

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

    // Update URL (clean URL without .md)
    const cleanPath = folderPath.replace(/^\//, '');
    const encodedPath = cleanPath.split('/').map(seg => encodeURIComponent(seg)).join('/');
    window.history.pushState({
      path: folderPath,
      type: 'folder'
    }, '', cleanPath ? `/doc/${encodedPath}` : '/');

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
      markdown += `- **[${displayDirName}](/doc/${encodedPath})**\n`;
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

      markdown += `- [📄 ${displayName}](/doc/${encodedPath}) _${sizeKB} KB_\n`;
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

    // Find the folder wrapper in DOM
    const wrapper = document.querySelector(`.tree-item-wrapper[data-path="${currentPath}"]`);
    if (!wrapper) {
      console.warn(`Folder not found in tree: ${currentPath}`);
      continue;
    }

    // Check if already expanded
    const childrenContainer = wrapper.querySelector('.tree-children');
    if (childrenContainer && childrenContainer.style.display === 'none') {
      // Need to expand
      const dirItem = wrapper.querySelector('.tree-item.directory');
      const expandIcon = dirItem.querySelector('.expand-icon');

      if (dirItem && expandIcon) {
        // Simulate click to expand
        dirItem.click();

        // Wait for DOM to update
        await new Promise(resolve => setTimeout(resolve, 100));
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

    // Find the folder wrapper in DOM
    const wrapper = document.querySelector(`.tree-item-wrapper[data-path="${currentPath}"]`);
    if (!wrapper) {
      console.warn(`Folder not found in tree: ${currentPath}`);
      continue;
    }

    // Check if already expanded
    const childrenContainer = wrapper.querySelector('.tree-children');
    if (childrenContainer && childrenContainer.style.display === 'none') {
      // Need to expand - click the expand icon
      const expandIcon = wrapper.querySelector('.expand-icon');
      if (expandIcon) {
        expandIcon.click();
        // Wait for DOM to update
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }
}

// Load file and render
async function loadFile(path, hash = '', updateUrl = true) {
  try {
    // Update breadcrumb
    document.getElementById('breadcrumb').textContent = path;

    // Fetch and render
    const content = await fetchRaw(path);
    await renderMarkdown(content);

    // Remove folder-list-view class (if previously set)
    const contentDiv = document.getElementById('markdown-content');
    contentDiv.classList.remove('folder-list-view');

    // Add document title (filename without .md)
    addDocumentTitle(path, contentDiv);

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
      const newUrl = `/doc/${encodedPath}${hash ? '#' + hash : ''}`;

      // Save both paths in history state
      window.history.pushState({
        path: path,           // Real file path (e.g., '/guide/intro.md')
        cleanPath: cleanPath, // Clean path for display (e.g., '/guide/intro')
        hash: hash
      }, '', newUrl);
    }

    // Scroll to anchor if provided
    if (hash) {
      await new Promise(resolve => setTimeout(resolve, 200));
      const targetElement = document.getElementById(hash);
      if (targetElement) {
        targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    const response = await fetch('/api/config/index');
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
function showWelcomeScreen() {
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

  // Clear active state from tree
  document.querySelectorAll('.tree-item').forEach(item => {
    item.classList.remove('active');
  });

  // Clear URL
  window.history.pushState({}, '', '/');
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

    // Sidebar header click - navigate to welcome or index
    const sidebarTitle = document.querySelector('.sidebar-title');
    if (sidebarTitle) {
      sidebarTitle.addEventListener('click', async () => {
        // Check if index file is configured
        const indexFile = await checkIndexFile();
        if (indexFile) {
          // Navigate to index file
          try {
            await expandPathToFile(indexFile);
            await loadFile(indexFile, '', true);
          } catch (error) {
            console.warn('Failed to load index file:', error.message);
            showWelcomeScreen();
          }
        } else {
          // Show welcome screen
          showWelcomeScreen();
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
    const hash = window.location.hash.substring(1); // Remove '#'
    let pathFromUrl = null;

    if (pathname.startsWith('/doc/')) {
      // Extract path from /doc/... URL and decode each segment
      const rawPath = pathname.substring(5); // Remove '/doc/'
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
        const testResponse = await fetch(`/api/raw?path=${encodeURIComponent(pathFromUrl)}`);
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
   * Real-time search with debounce (300ms)
   */
  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.trim();

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

          // File path
          const pathDiv = document.createElement('div');
          pathDiv.className = 'search-result-path';
          pathDiv.textContent = result.path;
          itemDiv.appendChild(pathDiv);

          // First match content (with HTML highlighting)
          if (result.matches.length > 0) {
            const contentDiv = document.createElement('div');
            contentDiv.className = 'search-result-content';
            contentDiv.innerHTML = DOMPurify.sanitize(result.matches[0].content, {
              ALLOWED_TAGS: ['mark'],
              ALLOWED_ATTR: []
            });
            itemDiv.appendChild(contentDiv);
          }

          // Match count meta info
          if (result.matches.length > 1) {
            const metaDiv = document.createElement('div');
            metaDiv.className = 'search-result-meta';
            metaDiv.textContent = `+${result.matches.length - 1} more match${result.matches.length > 2 ? 'es' : ''}`;
            itemDiv.appendChild(metaDiv);
          }

          searchResults.appendChild(itemDiv);
        });

        // Add click event listeners to results
        searchResults.querySelectorAll('.search-result-item').forEach(item => {
          item.addEventListener('click', async (e) => {
            e.preventDefault();
            const path = item.dataset.path;

            try {
              // Close search panel
              searchPanel.style.display = 'none';
              treeMenu.style.display = 'block';
              searchInput.value = '';
              searchResults.innerHTML = '';

              // Load file
              await loadFile(path);
            } catch (error) {
              console.error('Failed to load search result:', error);
            }
          });
        });
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
}

/**
 * Escape HTML special characters for safe display
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Initialize resizer
function initResizer() {
  const resizer = document.getElementById('resizer');
  const sidebar = document.querySelector('.sidebar');
  let isResizing = false;
  let startX = 0;
  let startWidth = 0;

  resizer.addEventListener('mousedown', (e) => {
    isResizing = true;
    startX = e.clientX;
    startWidth = sidebar.offsetWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    resizer.classList.add('resizing');
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;

    const delta = e.clientX - startX;
    const newWidth = startWidth + delta;
    const minWidth = 100;
    const maxWidth = window.innerWidth - 100;

    if (newWidth >= minWidth && newWidth <= maxWidth) {
      sidebar.style.width = `${newWidth}px`;
      localStorage.setItem('sidebarWidth', newWidth);
    }
  });

  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      resizer.classList.remove('resizing');
    }
  });

  // Restore saved width
  const savedWidth = localStorage.getItem('sidebarWidth');
  if (savedWidth) {
    sidebar.style.width = `${savedWidth}px`;
  }
}

// Initialize mobile menu
function initMobileMenu() {
  const menuBtn = document.getElementById('mobile-menu-btn');
  const overlay = document.getElementById('mobile-overlay');
  const sidebar = document.querySelector('.sidebar');

  if (!menuBtn || !overlay || !sidebar) return;

  // Toggle menu
  menuBtn.addEventListener('click', () => {
    sidebar.classList.add('open');
    overlay.classList.add('active');
  });

  // Close menu when clicking overlay
  overlay.addEventListener('click', () => {
    sidebar.classList.remove('open');
    overlay.classList.remove('active');
  });

  // Close menu on file selection (mobile only)
  const originalLoadFile = window.loadFile;
  window.loadFile = async function(...args) {
    await originalLoadFile.apply(this, args);
    if (window.innerWidth <= 768) {
      sidebar.classList.remove('open');
      overlay.classList.remove('active');
    }
  };
}

// Close mobile menu on popstate
window.addEventListener('popstate', () => {
  if (window.innerWidth <= 768) {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('mobile-overlay');
    if (sidebar && overlay) {
      sidebar.classList.remove('open');
      overlay.classList.remove('active');
    }
  }
});

// Start application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  init();
  initResizer();
  initMobileMenu();
});
