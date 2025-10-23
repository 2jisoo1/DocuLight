// DocLight Client Application

// Initialize Mermaid
mermaid.initialize({
  startOnLoad: true,
  theme: 'default'
});

// IndexedDB management
const DB_NAME = 'doclight';
const DB_VERSION = 1;
let db;

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
  const tx = db.transaction('treeState', 'readwrite');
  const store = tx.objectStore('treeState');
  await store.put({ path, expanded, ts: Date.now() });
}

// Get tree state
async function getTreeState(path) {
  const tx = db.transaction('treeState', 'readonly');
  const store = tx.objectStore('treeState');
  const result = await store.get(path);
  return result ? result.expanded : false;
}

// Save last opened file
async function saveLastOpened(path) {
  const tx = db.transaction('lastOpened', 'readwrite');
  const store = tx.objectStore('lastOpened');
  await store.put({ key: 'file', path, ts: Date.now() });
}

// Get last opened file
async function getLastOpened() {
  const tx = db.transaction('lastOpened', 'readonly');
  const store = tx.objectStore('lastOpened');
  const result = await store.get('file');
  return result ? result.path : null;
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
        <h2>오류 발생</h2>
        <p class="error-main">${message}</p>
        ${details ? `<p class="error-details">${details}</p>` : ''}
        <button class="error-retry-btn" onclick="location.reload()">다시 시도</button>
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
      return '네트워크 연결을 확인해주세요.';
    }
    if (this.isTimeoutError(error)) {
      return '요청 시간이 초과되었습니다. 다시 시도해주세요.';
    }
    if (error.message.includes('404')) {
      return context ? `${context}을(를) 찾을 수 없습니다.` : '요청한 리소스를 찾을 수 없습니다.';
    }
    if (error.message.includes('403')) {
      return '접근 권한이 없습니다.';
    }
    if (error.message.includes('401')) {
      return '인증이 필요합니다.';
    }
    if (error.message.includes('500')) {
      return '서버 오류가 발생했습니다.';
    }
    return '요청을 처리하는 중 오류가 발생했습니다.';
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

// Render markdown
async function renderMarkdown(content) {
  // Configure marked options
  marked.setOptions({
    breaks: true,
    gfm: true,
    headerIds: true,
    mangle: false
  });

  // Parse markdown
  const rawHtml = marked.parse(content);

  // Sanitize HTML with DOMPurify
  const cleanHtml = DOMPurify.sanitize(rawHtml);

  // Set content
  const contentDiv = document.getElementById('markdown-content');
  contentDiv.innerHTML = cleanHtml;

  // Render mermaid diagrams
  const mermaidBlocks = contentDiv.querySelectorAll('code.language-mermaid');
  mermaidBlocks.forEach((block, index) => {
    const code = block.textContent;
    const id = `mermaid-${index}`;
    const container = document.createElement('div');
    container.id = id;
    container.className = 'mermaid';
    container.textContent = code;
    block.parentElement.replaceWith(container);
  });

  // Re-render mermaid
  await mermaid.run({
    querySelector: '.mermaid'
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

    // Create expand icon
    const expandIcon = document.createElement('span');
    expandIcon.className = 'expand-icon';
    expandIcon.textContent = '▶';

    // Create folder icon
    const folderIcon = document.createElement('span');
    folderIcon.className = 'tree-icon';
    folderIcon.textContent = '📁';

    // Create name span
    const nameSpan = document.createElement('span');
    nameSpan.textContent = dir.name;

    item.appendChild(expandIcon);
    item.appendChild(folderIcon);
    item.appendChild(nameSpan);

    // Create children container
    const childrenContainer = document.createElement('div');
    childrenContainer.className = 'tree-children';
    childrenContainer.style.display = 'none';

    // Add click handler for expansion
    item.addEventListener('click', async (e) => {
      e.stopPropagation();
      await toggleDirectory(dirPath, wrapper, childrenContainer, expandIcon, level + 1);
    });

    wrapper.appendChild(item);
    wrapper.appendChild(childrenContainer);
    fragment.appendChild(wrapper);

    // Save for state restoration after DOM insertion
    dirsToRestore.push({ dirPath, wrapper, childrenContainer, expandIcon, level });
  }

  // Add files
  data.files.forEach(file => {
    const filePath = currentPath ? `${currentPath}/${file.name}` : file.name;
    const item = document.createElement('div');
    item.className = 'tree-item file';
    item.dataset.path = filePath;
    item.style.paddingLeft = `${(level + 1) * 1.2}rem`;

    const fileIcon = document.createElement('span');
    fileIcon.className = 'tree-icon';
    fileIcon.textContent = '📄';

    const nameSpan = document.createElement('span');
    nameSpan.textContent = file.name;

    item.appendChild(fileIcon);
    item.appendChild(nameSpan);

    // Only handle .md files
    if (file.name.endsWith('.md')) {
      item.addEventListener('click', async (e) => {
        e.stopPropagation();
        await loadFile(filePath);
      });
    }

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
    expandIcon.textContent = '▶';
    expandIcon.classList.remove('expanded');
    wrapper.classList.remove('expanded');
    await saveTreeState(dirPath, false);
  } else {
    // Expand
    expandIcon.textContent = '▼';
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

// Load file and render
async function loadFile(path) {
  try {
    // Update breadcrumb
    document.getElementById('breadcrumb').textContent = path;

    // Fetch and render
    const content = await fetchRaw(path);
    await renderMarkdown(content);

    // Update active state
    document.querySelectorAll('.tree-item').forEach(item => {
      item.classList.remove('active');
    });
    const activeItem = document.querySelector(`.tree-item[data-path="${path}"]`);
    if (activeItem) {
      activeItem.classList.add('active');
    }

    // Save last opened
    await saveLastOpened(path);
  } catch (error) {
    console.error('Failed to load file:', error);
    const userMessage = ErrorHandler.getUserMessage(error, '파일');
    ErrorHandler.showError(userMessage, error.message);
  }
}

// Initialize application
async function init() {
  try {
    // Initialize IndexedDB
    await initDB();

    // Load tree
    const treeData = await fetchTree('/');
    const container = document.getElementById('tree-container');
    await buildTree(treeData, container);

    // Refresh button
    document.getElementById('refresh-btn').addEventListener('click', async () => {
      try {
        container.innerHTML = '<div class="loading">로딩 중...</div>';
        const treeData = await fetchTree('/');
        container.innerHTML = '';
        await buildTree(treeData, container);
      } catch (error) {
        console.error('Failed to refresh tree:', error);
        const userMessage = ErrorHandler.getUserMessage(error, '디렉터리 트리');
        container.innerHTML = `
          <div class="tree-error">
            <p>${userMessage}</p>
            <p class="error-details">${error.message}</p>
          </div>
        `;
      }
    });

    // Load last opened file if exists
    const lastOpened = await getLastOpened();
    if (lastOpened) {
      await loadFile(lastOpened);
    }
  } catch (error) {
    console.error('Initialization error:', error);
    const userMessage = ErrorHandler.getUserMessage(error);
    ErrorHandler.showError(
      '애플리케이션을 초기화하는 중 오류가 발생했습니다.',
      `${userMessage}\n${error.message}`
    );
  }
}

// Start application when DOM is ready
document.addEventListener('DOMContentLoaded', init);
