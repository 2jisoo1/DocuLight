/**
 * DocLight Admin Frontend
 * Phase 4: Frontend Base Structure
 * Phase 5: File Management (Selection, Context Menu, Modals)
 */

// ============================================================
// State
// ============================================================
const AdminState = {
  isAuthenticated: false,
  session: null,
  fileTree: null,
  expandedPaths: new Set(),
  selectedPaths: [],
  lastSelectedPath: null,
  currentViewPath: null,
  isLoading: false,
  // Phase 5 additions
  clipboard: null,  // { operation: 'cut'|'copy', paths: [] }
  cutPaths: new Set(),  // For visual feedback on cut items
  // Phase 6 additions
  editor: {
    isOpen: false,
    path: null,
    originalContent: '',
    modifiedAt: null,
    isDirty: false,
    mode: 'edit'  // 'edit' | 'preview'
  }
};

// ============================================================
// TOC Module (Admin-specific TOC handling)
// ============================================================
const AdminTOC = {
  isVisible: false,

  init() {
    const toggleBtn = document.getElementById('admin-toc-toggle');
    const closeBtn = document.getElementById('admin-toc-close');
    const overlay = document.getElementById('admin-toc-overlay');
    const resizer = document.getElementById('admin-toc-resizer');

    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => this.toggle());
    }
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.hide());
    }
    if (overlay) {
      overlay.addEventListener('click', () => this.hide());
    }

    // Resizer handling
    if (resizer) {
      this.initResizer(resizer);
    }
  },

  show() {
    const sidebar = document.getElementById('admin-toc-sidebar');
    const overlay = document.getElementById('admin-toc-overlay');
    const adminContent = document.getElementById('admin-content');
    if (sidebar) {
      sidebar.classList.add('visible');
      this.isVisible = true;
    }
    if (adminContent) {
      adminContent.classList.add('toc-visible');
    }
    if (overlay && window.innerWidth <= 768) {
      overlay.classList.add('visible');
    }
  },

  hide() {
    const sidebar = document.getElementById('admin-toc-sidebar');
    const overlay = document.getElementById('admin-toc-overlay');
    const adminContent = document.getElementById('admin-content');
    if (sidebar) {
      sidebar.classList.remove('visible');
      this.isVisible = false;
    }
    if (adminContent) {
      adminContent.classList.remove('toc-visible');
    }
    if (overlay) {
      overlay.classList.remove('visible');
    }
  },

  toggle() {
    this.isVisible ? this.hide() : this.show();
  },

  initResizer(resizer) {
    let isResizing = false;
    let startX, startWidth;
    const sidebar = document.getElementById('admin-toc-sidebar');

    resizer.addEventListener('mousedown', (e) => {
      isResizing = true;
      startX = e.clientX;
      startWidth = sidebar.offsetWidth;
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', (e) => {
      if (!isResizing) return;
      const diff = startX - e.clientX;
      const newWidth = Math.min(Math.max(startWidth + diff, 200), 500);
      sidebar.style.width = `${newWidth}px`;
    });

    document.addEventListener('mouseup', () => {
      if (isResizing) {
        isResizing = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    });
  }
};

// ============================================================
// API Module
// ============================================================
const AdminAPI = {
  async auth(apiKey) {
    const response = await fetch('/api/admin/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey }),
      credentials: 'include'
    });
    return response.json();
  },

  async logout() {
    const response = await fetch('/api/admin/logout', {
      method: 'POST',
      credentials: 'include'
    });
    return response.json();
  },

  async getSession() {
    const response = await fetch('/api/admin/session', {
      credentials: 'include'
    });
    if (!response.ok) return null;
    return response.json();
  },

  async getTree(path = '/') {
    const response = await fetch(`/api/admin/tree?path=${encodeURIComponent(path)}`, {
      credentials: 'include'
    });
    return response.json();
  },

  async getContent(path) {
    const response = await fetch(`/api/admin/content?path=${encodeURIComponent(path)}`, {
      credentials: 'include'
    });
    return response.json();
  },

  // Phase 5: File management APIs
  async rename(oldPath, newName) {
    const response = await fetch('/api/admin/rename', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ oldPath, newName })
    });
    return response.json();
  },

  async deleteEntries(paths) {
    const response = await fetch('/api/admin/entry', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ paths })
    });
    return response.json();
  },

  async create(parentPath, name, type) {
    // Construct full path by combining parent path and name
    const fullPath = parentPath === '/' ? '/' + name : parentPath + '/' + name;
    const response = await fetch('/api/admin/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ path: fullPath, type })
    });
    return response.json();
  },

  async move(sourcePaths, targetDirectory) {
    const response = await fetch('/api/admin/move', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ sourcePaths, targetDirectory })
    });
    return response.json();
  },

  async copy(sourcePaths, targetDirectory) {
    const response = await fetch('/api/admin/copy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ sourcePaths, targetDirectory })
    });
    return response.json();
  },

  // Phase 6: Editor APIs
  async saveContent(path, content, originalModifiedAt = null) {
    const body = { path, content };
    if (originalModifiedAt) {
      body.originalModifiedAt = originalModifiedAt;
    }
    const response = await fetch('/api/admin/content', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body)
    });
    return response.json();
  }
};

// ============================================================
// Auth Module
// ============================================================
const AuthModule = {
  showAuthModal() {
    document.getElementById('auth-modal').style.display = 'flex';
    document.getElementById('admin-app').style.display = 'none';
    document.getElementById('api-key-input').value = '';
    this.hideError();
    setTimeout(() => {
      document.getElementById('api-key-input').focus();
    }, 100);
  },

  hideAuthModal() {
    document.getElementById('auth-modal').style.display = 'none';
    document.getElementById('admin-app').style.display = 'grid';
  },

  showError(message) {
    const errorEl = document.getElementById('auth-error');
    errorEl.textContent = message;
    errorEl.style.display = 'block';
  },

  hideError() {
    document.getElementById('auth-error').style.display = 'none';
  },

  async handleLogin() {
    const apiKey = document.getElementById('api-key-input').value.trim();
    if (!apiKey) {
      this.showError('Please enter an API key');
      return;
    }

    const loginBtn = document.getElementById('auth-login');
    loginBtn.disabled = true;
    loginBtn.textContent = 'Logging in...';

    try {
      const result = await AdminAPI.auth(apiKey);
      if (result.success) {
        AdminState.isAuthenticated = true;
        AdminState.session = result.session;
        this.hideAuthModal();
        this.updateSessionUI();
        await TreeModule.loadTree();
        URLModule.handleInitialPath();
        // 업로드 모듈 초기화 (인증 후)
        UploadModule.init();
      } else {
        this.showError(result.error?.message || 'Invalid API key');
      }
    } catch (error) {
      this.showError('Connection error. Please try again.');
      console.error('Login error:', error);
    } finally {
      loginBtn.disabled = false;
      loginBtn.textContent = 'Login';
    }
  },

  async handleLogout() {
    try {
      await AdminAPI.logout();
    } catch (error) {
      console.error('Logout error:', error);
    }
    AdminState.isAuthenticated = false;
    AdminState.session = null;
    AdminState.fileTree = null;
    AdminState.expandedPaths.clear();
    AdminState.selectedPaths = [];
    this.showAuthModal();
  },

  async checkSession() {
    try {
      const result = await AdminAPI.getSession();
      if (result?.success) {
        AdminState.isAuthenticated = true;
        AdminState.session = result.session;
        this.hideAuthModal();
        this.updateSessionUI();
        return true;
      }
    } catch (error) {
      console.error('Session check error:', error);
    }
    return false;
  },

  updateSessionUI() {
    const nameEl = document.getElementById('session-name');
    if (nameEl) {
      nameEl.textContent = AdminState.session?.name || '';
    }
  }
};

// ============================================================
// Tree Module
// ============================================================
const TreeModule = {
  async loadTree() {
    AdminState.isLoading = true;
    try {
      const result = await AdminAPI.getTree('/');
      if (result.success) {
        AdminState.fileTree = result.tree;
        this.renderTree();
      } else {
        console.error('Failed to load tree:', result.error);
      }
    } catch (error) {
      console.error('Tree load error:', error);
    } finally {
      AdminState.isLoading = false;
    }
  },

  renderTree() {
    const container = document.getElementById('file-tree');
    if (!container) return;

    container.innerHTML = '';

    // Phase 7: 부모 이동 드롭존 추가
    DragDropModule.setupParentDropZone(container);

    // 빈 공간 우클릭 시 컨텍스트 메뉴 (루트 디렉토리 대상)
    container.oncontextmenu = (e) => {
      // 트리 아이템에서 발생한 이벤트는 무시 (이미 처리됨)
      if (e.target.closest('.tree-item')) return;
      e.preventDefault();
      // 선택 해제
      AdminState.selectedPaths = [];
      AdminState.lastSelectedPath = null;
      this.updateSelection();
      // 루트 디렉토리에 대한 컨텍스트 메뉴 표시
      ContextMenuModule.showContextMenu(e.clientX, e.clientY, '/', 'root');
    };

    if (!AdminState.fileTree?.root) {
      container.innerHTML += '<div class="tree-empty">No files found</div>';
      return;
    }

    const root = AdminState.fileTree.root;
    this.renderNodes(container, [...root.dirs, ...root.files], 0);
  },

  renderNodes(container, nodes, depth) {
    if (!nodes || nodes.length === 0) return;

    for (const node of nodes) {
      const item = document.createElement('div');
      item.className = 'tree-item';
      item.style.paddingLeft = `${depth * 16 + 8}px`;
      item.dataset.path = node.path;
      item.dataset.type = node.type;

      // 선택 상태
      if (AdminState.selectedPaths.includes(node.path)) {
        item.classList.add('selected');
      }

      // Cut 상태 (Phase 5)
      if (AdminState.cutPaths.has(node.path)) {
        item.classList.add('cut');
      }

      // 아이콘
      const icon = document.createElement('span');
      icon.className = 'tree-icon';
      if (node.type === 'directory') {
        const isExpanded = AdminState.expandedPaths.has(node.path);
        icon.textContent = isExpanded ? '\uD83D\uDCC2' : '\uD83D\uDCC1'; // 📂 : 📁
        icon.classList.add('folder-icon');
      } else {
        icon.textContent = this.getFileIcon(node.extension);
      }
      item.appendChild(icon);

      // 이름
      const name = document.createElement('span');
      name.className = 'tree-name';
      name.textContent = node.displayName || node.name;
      if (node.description) {
        name.title = node.description;
      }
      item.appendChild(name);

      // 클릭 이벤트
      item.addEventListener('click', (e) => this.handleItemClick(e, node));

      // 컨텍스트 메뉴 이벤트 (Phase 5)
      item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        // 선택되지 않은 항목에서 우클릭 시 해당 항목만 선택
        if (!AdminState.selectedPaths.includes(node.path)) {
          AdminState.selectedPaths = [node.path];
          AdminState.lastSelectedPath = node.path;
          this.updateSelection();
        }
        ContextMenuModule.showContextMenu(e.clientX, e.clientY, node.path, node.type);
      });

      // Phase 7: 드래그앤드롭 설정
      DragDropModule.setupDraggable(item, node.path, node.type);

      container.appendChild(item);

      // 자식 노드 (확장된 경우)
      if (node.type === 'directory' && AdminState.expandedPaths.has(node.path)) {
        const children = [...(node.dirs || []), ...(node.files || [])];
        this.renderNodes(container, children, depth + 1);
      }
    }
  },

  handleItemClick(e, node) {
    e.stopPropagation();

    if (node.type === 'directory') {
      // 폴더 클릭 시: Ctrl/Shift 없으면 확장/축소, 있으면 선택만
      if (e.ctrlKey || e.metaKey || e.shiftKey) {
        SelectionModule.handleClick(node.path, node.type, e);
      } else {
        this.toggleExpand(node.path);
        AdminState.selectedPaths = [node.path];
        AdminState.lastSelectedPath = node.path;
        this.updateSelection();
      }
    } else {
      // 파일 클릭 시: SelectionModule 사용
      SelectionModule.handleClick(node.path, node.type, e);
    }
  },

  toggleExpand(path) {
    if (AdminState.expandedPaths.has(path)) {
      AdminState.expandedPaths.delete(path);
    } else {
      AdminState.expandedPaths.add(path);
    }
    this.renderTree();
  },

  selectFile(path) {
    AdminState.selectedPaths = [path];
    AdminState.lastSelectedPath = path;
    this.updateSelection();
    ViewerModule.loadFile(path);
    URLModule.navigateTo(path);
  },

  updateSelection() {
    document.querySelectorAll('.tree-item').forEach(item => {
      const isSelected = AdminState.selectedPaths.includes(item.dataset.path);
      item.classList.toggle('selected', isSelected);
    });
  },

  getFileIcon(extension) {
    const iconMap = {
      '.md': '\uD83D\uDCC4',      // 📄
      '.txt': '\uD83D\uDCDD',     // 📝
      '.json': '\uD83D\uDCCB',    // 📋
      '.json5': '\uD83D\uDCCB',   // 📋
      '.yaml': '\uD83D\uDCCB',    // 📋
      '.yml': '\uD83D\uDCCB',     // 📋
      '.png': '\uD83D\uDDBC\uFE0F', // 🖼️
      '.jpg': '\uD83D\uDDBC\uFE0F', // 🖼️
      '.jpeg': '\uD83D\uDDBC\uFE0F', // 🖼️
      '.gif': '\uD83D\uDDBC\uFE0F', // 🖼️
      '.svg': '\uD83D\uDDBC\uFE0F', // 🖼️
      '.pdf': '\uD83D\uDCD5',     // 📕
      '.html': '\uD83C\uDF10',    // 🌐
      '.css': '\uD83C\uDFA8',     // 🎨
      '.js': '\u26A1',            // ⚡
      '.ts': '\uD83D\uDCD8'       // 📘
    };
    return iconMap[extension?.toLowerCase()] || '\uD83D\uDCCE'; // 📎
  },

  // 경로를 확장하여 파일이 보이도록 함
  expandToPath(targetPath) {
    const parts = targetPath.split('/').filter(p => p);
    let currentPath = '';

    for (let i = 0; i < parts.length - 1; i++) {
      currentPath += '/' + parts[i];
      AdminState.expandedPaths.add(currentPath);
    }
  }
};

// ============================================================
// Viewer Module
// ============================================================
const ViewerModule = {
  async loadFile(path) {
    const placeholder = document.getElementById('content-placeholder');
    const viewer = document.getElementById('file-viewer');
    const editorContainer = document.getElementById('editor-container');

    if (!viewer) return;

    // Close editor if open (with unsaved changes check)
    if (AdminState.editor.isOpen) {
      const closed = await EditorModule.closeEditor();
      if (!closed) return; // User cancelled, don't switch files
    }

    // Hide editor container if visible
    if (editorContainer) editorContainer.style.display = 'none';

    viewer.innerHTML = '<div class="loading">Loading...</div>';
    placeholder.style.display = 'none';
    viewer.style.display = 'block';

    try {
      const result = await AdminAPI.getContent(path);

      if (!result.success) {
        viewer.innerHTML = `<div class="error">Error: ${result.error?.message || 'Unknown error'}</div>`;
        return;
      }

      // TOC 토글 버튼 및 편집 버튼 참조
      const tocToggle = document.getElementById('admin-toc-toggle');
      const editBtn = document.getElementById('admin-edit-btn');

      // 파일 유형별 렌더링
      if (path.endsWith('.md')) {
        // 마크다운 렌더링
        await this.renderMarkdown(viewer, result.content);
        // TOC 토글 버튼 및 편집 버튼 표시
        if (tocToggle) tocToggle.style.display = 'flex';
        if (editBtn) editBtn.style.display = 'block';
      } else if (this.isImageFile(path)) {
        // TOC 및 편집 버튼 숨기기 (비마크다운 파일)
        if (tocToggle) tocToggle.style.display = 'none';
        if (editBtn) editBtn.style.display = 'none';
        AdminTOC.hide();
        // 이미지 파일 표시
        const filename = path.split('/').pop();
        viewer.innerHTML = `
          <div class="image-viewer">
            <img src="/api/admin/file?path=${encodeURIComponent(path)}"
                 alt="${filename}"
                 onerror="this.parentElement.innerHTML='<div class=\\'error\\'>Failed to load image</div>'">
            <div class="image-filename">${filename}</div>
          </div>
        `;
      } else if (this.isTextFile(path)) {
        // TOC 및 편집 버튼 숨기기 (비마크다운 파일)
        if (tocToggle) tocToggle.style.display = 'none';
        if (editBtn) editBtn.style.display = 'none';
        AdminTOC.hide();
        // 텍스트 파일 표시
        viewer.innerHTML = `<pre class="code-block">${this.escapeHtml(result.content)}</pre>`;
      } else {
        // TOC 및 편집 버튼 숨기기 (비마크다운 파일)
        if (tocToggle) tocToggle.style.display = 'none';
        if (editBtn) editBtn.style.display = 'none';
        AdminTOC.hide();
        // 지원하지 않는 파일
        const filename = path.split('/').pop();
        viewer.innerHTML = `
          <div class="unsupported-file">
            <span class="unsupported-icon">📄</span>
            <p class="unsupported-message">This file cannot be opened here.</p>
            <p class="unsupported-filename">${filename}</p>
          </div>
        `;
      }

      AdminState.currentViewPath = path;
    } catch (error) {
      console.error('File load error:', error);
      viewer.innerHTML = `<div class="error">Failed to load file: ${error.message}</div>`;
    }
  },

  // Shared markdown rendering (using DocLightUtils module)
  async renderMarkdown(container, content) {
    try {
      if (typeof DocLightUtils === 'undefined' || typeof marked === 'undefined') {
        container.innerHTML = `<pre>${DocLightUtils?.escapeHtml?.(content) || content}</pre>`;
        return;
      }

      // Use shared renderMarkdown with TOC support
      const tocTree = document.getElementById('admin-toc-tree');
      await DocLightUtils.renderMarkdown(content, container, {
        enableWikiLinks: true,
        enableTOC: true,
        enableCopyButtons: true,
        enableHeadingAnchors: true,
        tocTreeElement: tocTree,
        onTOCItemClick: (item) => {
          // Admin-specific: close TOC on mobile
          if (window.innerWidth <= 768) {
            AdminTOC.hide();
          }
        }
      });

      // Show TOC sidebar if there are headings
      if (tocTree && tocTree.children.length > 0 && !tocTree.querySelector('.toc-empty')) {
        AdminTOC.show();
      }

    } catch (error) {
      console.error('Markdown render error:', error);
      container.innerHTML = `<pre>${DocLightUtils?.escapeHtml?.(content) || content}</pre>`;
    }
  },

  // Delegate to shared escapeHtml
  escapeHtml(text) {
    return DocLightUtils?.escapeHtml?.(text) || text;
  },

  isImageFile(path) {
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp', '.ico'];
    const ext = path.toLowerCase().slice(path.lastIndexOf('.'));
    return imageExtensions.includes(ext);
  },

  isTextFile(path) {
    const textExtensions = ['.txt', '.json', '.xml', '.css', '.js', '.html', '.yml', '.yaml', '.log', '.ini', '.cfg'];
    const ext = path.toLowerCase().slice(path.lastIndexOf('.'));
    return textExtensions.includes(ext);
  }
};

// ============================================================
// URL Module
// ============================================================
const URLModule = {
  parseCurrentPath() {
    const path = window.location.pathname;
    if (path.startsWith('/admin')) {
      const filePath = path.substring('/admin'.length) || '/';
      // URL 디코딩하여 한글 등 인코딩된 문자 처리
      return filePath === '' ? '/' : decodeURIComponent(filePath);
    }
    return '/';
  },

  navigateTo(path) {
    const url = '/admin' + path;
    if (window.location.pathname !== url) {
      history.pushState({ path }, '', url);
    }
  },

  handlePopState(event) {
    const path = event.state?.path || this.parseCurrentPath();
    if (path && path !== '/') {
      TreeModule.expandToPath(path);
      TreeModule.selectFile(path);
    }
  },

  handleInitialPath() {
    const path = this.parseCurrentPath();
    if (path && path !== '/') {
      TreeModule.expandToPath(path);
      // 약간의 지연 후 파일 선택 (트리 렌더링 완료 대기)
      setTimeout(() => {
        TreeModule.selectFile(path);
      }, 100);
    }
  }
};

// ============================================================
// Resizer Module
// ============================================================
const ResizerModule = {
  isResizing: false,
  startX: 0,
  startWidth: 0,

  init() {
    const resizer = document.getElementById('sidebar-resizer');
    const sidebar = document.getElementById('admin-sidebar');

    if (!resizer || !sidebar) return;

    resizer.addEventListener('mousedown', (e) => {
      this.isResizing = true;
      this.startX = e.clientX;
      this.startWidth = sidebar.offsetWidth;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.isResizing) return;

      const diff = e.clientX - this.startX;
      const newWidth = Math.max(200, Math.min(500, this.startWidth + diff));
      document.documentElement.style.setProperty('--sidebar-width', `${newWidth}px`);
    });

    document.addEventListener('mouseup', () => {
      this.isResizing = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    });
  }
};

// ============================================================
// Selection Module (Phase 5)
// ============================================================
const SelectionModule = {
  flatList: [],

  // Flatten the tree into a list for range selection
  flattenTree(nodes, list = []) {
    if (!nodes) return list;
    for (const node of nodes) {
      list.push(node);
      if (node.type === 'directory' && AdminState.expandedPaths.has(node.path)) {
        const children = [...(node.dirs || []), ...(node.files || [])];
        this.flattenTree(children, list);
      }
    }
    return list;
  },

  getIndex(path) {
    return this.flatList.findIndex(n => n.path === path);
  },

  handleClick(path, type, event) {
    // Flatten tree for index calculation
    if (AdminState.fileTree?.root) {
      this.flatList = this.flattenTree([
        ...(AdminState.fileTree.root.dirs || []),
        ...(AdminState.fileTree.root.files || [])
      ]);
    }

    if (event.shiftKey && AdminState.lastSelectedPath) {
      this.handleShiftClick(path);
    } else if (event.ctrlKey || event.metaKey) {
      this.handleCtrlClick(path);
    } else {
      AdminState.selectedPaths = [path];
      AdminState.lastSelectedPath = path;
    }

    TreeModule.updateSelection();

    // If it's a file and single selection without modifier keys, load it
    if (type === 'file' && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
      ViewerModule.loadFile(path);
      URLModule.navigateTo(path);
    }
  },

  handleShiftClick(path) {
    const startIndex = this.getIndex(AdminState.lastSelectedPath);
    const endIndex = this.getIndex(path);

    if (startIndex === -1 || endIndex === -1) {
      AdminState.selectedPaths = [path];
      AdminState.lastSelectedPath = path;
      return;
    }

    const [from, to] = startIndex < endIndex
      ? [startIndex, endIndex]
      : [endIndex, startIndex];

    AdminState.selectedPaths = this.flatList
      .slice(from, to + 1)
      .map(n => n.path);
  },

  handleCtrlClick(path) {
    const index = AdminState.selectedPaths.indexOf(path);
    if (index === -1) {
      AdminState.selectedPaths.push(path);
    } else {
      AdminState.selectedPaths.splice(index, 1);
    }
    AdminState.lastSelectedPath = path;
  },

  selectAll() {
    if (AdminState.fileTree?.root) {
      this.flatList = this.flattenTree([
        ...(AdminState.fileTree.root.dirs || []),
        ...(AdminState.fileTree.root.files || [])
      ]);
    }
    AdminState.selectedPaths = this.flatList.map(n => n.path);
    TreeModule.updateSelection();
  },

  clearSelection() {
    AdminState.selectedPaths = [];
    AdminState.lastSelectedPath = null;
    TreeModule.updateSelection();
  }
};

// ============================================================
// Context Menu Module (Phase 5)
// ============================================================
const ContextMenuModule = {
  menuElement: null,

  showContextMenu(x, y, targetPath, targetType) {
    this.hideContextMenu();

    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;

    const items = this.buildMenuItems(targetPath, targetType);
    for (const item of items) {
      if (item.separator) {
        const sep = document.createElement('div');
        sep.className = 'context-menu-separator';
        menu.appendChild(sep);
      } else {
        const menuItem = document.createElement('div');
        menuItem.className = 'context-menu-item';
        if (item.disabled) menuItem.classList.add('disabled');
        menuItem.innerHTML = `<span class="menu-icon">${item.icon}</span>${item.label}`;
        menuItem.addEventListener('click', (e) => {
          e.stopPropagation();
          if (!item.disabled) {
            this.handleMenuAction(item.action, targetPath, targetType);
          }
          this.hideContextMenu();
        });
        menu.appendChild(menuItem);
      }
    }

    document.body.appendChild(menu);
    this.menuElement = menu;

    // Adjust position if menu goes outside viewport
    requestAnimationFrame(() => {
      const rect = menu.getBoundingClientRect();
      if (rect.right > window.innerWidth) {
        menu.style.left = `${window.innerWidth - rect.width - 8}px`;
      }
      if (rect.bottom > window.innerHeight) {
        menu.style.top = `${window.innerHeight - rect.height - 8}px`;
      }
    });
  },

  hideContextMenu() {
    if (this.menuElement) {
      this.menuElement.remove();
      this.menuElement = null;
    }
  },

  buildMenuItems(targetPath, targetType) {
    const permissions = AdminState.session?.permissions || [];
    const hasWrite = permissions.includes('write');
    const hasDelete = permissions.includes('delete');
    const hasClipboard = AdminState.clipboard !== null;

    // 빈 공간 (루트) 우클릭 시
    if (targetType === 'root') {
      return [
        { icon: '\uD83D\uDCC4', label: 'New File', action: 'newFile', disabled: !hasWrite },
        { icon: '\uD83D\uDCC1', label: 'New Folder', action: 'newFolder', disabled: !hasWrite },
        { separator: true },
        { icon: '\uD83D\uDCCB', label: 'Paste', action: 'paste', disabled: !hasWrite || !hasClipboard }
      ];
    }

    if (targetType === 'directory') {
      return [
        { icon: '\uD83D\uDCC4', label: 'New File', action: 'newFile', disabled: !hasWrite },
        { icon: '\uD83D\uDCC1', label: 'New Folder', action: 'newFolder', disabled: !hasWrite },
        { separator: true },
        { icon: '\uD83D\uDCDD', label: 'Rename', action: 'rename', disabled: !hasWrite },
        { separator: true },
        { icon: '\u2702\uFE0F', label: 'Cut', action: 'cut', disabled: !hasWrite },
        { icon: '\uD83D\uDCCB', label: 'Copy', action: 'copy' },
        { icon: '\uD83D\uDCCB', label: 'Paste', action: 'paste', disabled: !hasWrite || !hasClipboard },
        { separator: true },
        { icon: '\uD83D\uDDD1\uFE0F', label: 'Delete', action: 'delete', disabled: !hasDelete }
      ];
    } else {
      const isEditable = this.isEditable(targetPath);
      return [
        { icon: '\u270F\uFE0F', label: 'Edit', action: 'edit', disabled: !isEditable || !hasWrite },
        { icon: '\uD83D\uDCDD', label: 'Rename', action: 'rename', disabled: !hasWrite },
        { separator: true },
        { icon: '\u2702\uFE0F', label: 'Cut', action: 'cut', disabled: !hasWrite },
        { icon: '\uD83D\uDCCB', label: 'Copy', action: 'copy' },
        { separator: true },
        { icon: '\uD83D\uDDD1\uFE0F', label: 'Delete', action: 'delete', disabled: !hasDelete }
      ];
    }
  },

  isEditable(path) {
    const editableExtensions = ['.md', '.txt', '.json', '.json5', '.yaml', '.yml', '.html', '.css', '.js'];
    return editableExtensions.some(ext => path.toLowerCase().endsWith(ext));
  },

  handleMenuAction(action, targetPath, targetType) {
    const selectedPaths = AdminState.selectedPaths.length > 0
      ? AdminState.selectedPaths
      : [targetPath];

    switch (action) {
      case 'edit':
        // Phase 6: Open editor
        EditorModule.openEditor(targetPath);
        break;
      case 'rename':
        ModalModule.showRenameModal(targetPath);
        break;
      case 'delete':
        ModalModule.showDeleteConfirm(selectedPaths);
        break;
      case 'cut':
        ClipboardModule.cut(selectedPaths);
        break;
      case 'copy':
        ClipboardModule.copy(selectedPaths);
        break;
      case 'paste':
        ClipboardModule.paste(targetPath);
        break;
      case 'newFile':
        ModalModule.showCreateModal(targetPath, 'file');
        break;
      case 'newFolder':
        ModalModule.showCreateModal(targetPath, 'directory');
        break;
    }
  }
};

// ============================================================
// Modal Module (Phase 5)
// ============================================================
const ModalModule = {
  currentModal: null,
  resolvePromise: null,

  showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.style.display = 'flex';
      this.currentModal = modalId;
      // Focus first input if exists
      const input = modal.querySelector('input[type="text"]');
      if (input) {
        setTimeout(() => input.focus(), 50);
      }
    }
  },

  hideModal(modalId) {
    const modal = document.getElementById(modalId || this.currentModal);
    if (modal) {
      modal.style.display = 'none';
    }
    this.currentModal = null;
  },

  hideAllModals() {
    document.querySelectorAll('.modal').forEach(modal => {
      if (modal.id !== 'auth-modal') {
        modal.style.display = 'none';
      }
    });
    this.currentModal = null;
  },

  // Rename Modal
  showRenameModal(path) {
    const modal = document.getElementById('rename-modal');
    if (!modal) return;

    const name = path.split('/').pop();
    document.getElementById('rename-current-name').textContent = name;
    document.getElementById('rename-new-name').value = name;
    document.getElementById('rename-path').value = path;
    document.getElementById('rename-error').style.display = 'none';

    this.showModal('rename-modal');

    // Select filename without extension
    const input = document.getElementById('rename-new-name');
    const dotIndex = name.lastIndexOf('.');
    if (dotIndex > 0) {
      input.setSelectionRange(0, dotIndex);
    } else {
      input.select();
    }
  },

  async handleRename() {
    const path = document.getElementById('rename-path').value;
    const newName = document.getElementById('rename-new-name').value.trim();
    const errorEl = document.getElementById('rename-error');

    if (!newName) {
      errorEl.textContent = 'Name cannot be empty';
      errorEl.style.display = 'block';
      return;
    }

    // Validate filename
    if (/[<>:"/\\|?*]/.test(newName)) {
      errorEl.textContent = 'Invalid characters in filename';
      errorEl.style.display = 'block';
      return;
    }

    try {
      const result = await AdminAPI.rename(path, newName);
      if (result.success) {
        this.hideModal('rename-modal');
        await TreeModule.loadTree();
      } else {
        errorEl.textContent = result.error?.message || 'Rename failed';
        errorEl.style.display = 'block';
      }
    } catch (error) {
      errorEl.textContent = 'Connection error';
      errorEl.style.display = 'block';
    }
  },

  // Delete Confirm Modal
  showDeleteConfirm(paths) {
    const modal = document.getElementById('delete-modal');
    if (!modal) return;

    const listEl = document.getElementById('delete-list');
    listEl.innerHTML = '';
    paths.forEach(p => {
      const li = document.createElement('li');
      li.textContent = p;
      listEl.appendChild(li);
    });

    document.getElementById('delete-paths').value = JSON.stringify(paths);
    document.getElementById('delete-error').style.display = 'none';

    this.showModal('delete-modal');
  },

  async handleDelete() {
    const paths = JSON.parse(document.getElementById('delete-paths').value);
    const errorEl = document.getElementById('delete-error');

    try {
      const result = await AdminAPI.deleteEntries(paths);
      if (result.success) {
        this.hideModal('delete-modal');
        AdminState.selectedPaths = [];
        await TreeModule.loadTree();
      } else {
        errorEl.textContent = result.error?.message || 'Delete failed';
        errorEl.style.display = 'block';
      }
    } catch (error) {
      errorEl.textContent = 'Connection error';
      errorEl.style.display = 'block';
    }
  },

  // Create Modal
  showCreateModal(parentPath, type) {
    const modal = document.getElementById('create-modal');
    if (!modal) return;

    document.getElementById('create-parent-path').value = parentPath;
    document.getElementById('create-type').value = type;
    document.getElementById('create-name').value = type === 'file' ? 'new-file.md' : 'new-folder';
    document.getElementById('create-title').textContent = type === 'file' ? 'New File' : 'New Folder';
    document.getElementById('create-error').style.display = 'none';

    this.showModal('create-modal');

    const input = document.getElementById('create-name');
    if (type === 'file') {
      input.setSelectionRange(0, input.value.lastIndexOf('.'));
    } else {
      input.select();
    }
  },

  async handleCreate() {
    const parentPath = document.getElementById('create-parent-path').value;
    const type = document.getElementById('create-type').value;
    const name = document.getElementById('create-name').value.trim();
    const errorEl = document.getElementById('create-error');

    if (!name) {
      errorEl.textContent = 'Name cannot be empty';
      errorEl.style.display = 'block';
      return;
    }

    // Validate filename
    if (/[<>:"/\\|?*]/.test(name)) {
      errorEl.textContent = 'Invalid characters in name';
      errorEl.style.display = 'block';
      return;
    }

    try {
      const result = await AdminAPI.create(parentPath, name, type);
      if (result.success) {
        this.hideModal('create-modal');
        // Expand parent folder
        AdminState.expandedPaths.add(parentPath);
        await TreeModule.loadTree();
      } else {
        errorEl.textContent = result.error?.message || 'Create failed';
        errorEl.style.display = 'block';
      }
    } catch (error) {
      errorEl.textContent = 'Connection error';
      errorEl.style.display = 'block';
    }
  }
};

// ============================================================
// Clipboard Module (Phase 5)
// ============================================================
const ClipboardModule = {
  cut(paths) {
    AdminState.clipboard = { operation: 'cut', paths: [...paths] };
    AdminState.cutPaths = new Set(paths);
    TreeModule.renderTree();
    this.showNotification(`${paths.length} item(s) cut`);
  },

  copy(paths) {
    AdminState.clipboard = { operation: 'copy', paths: [...paths] };
    AdminState.cutPaths.clear();
    TreeModule.renderTree();
    this.showNotification(`${paths.length} item(s) copied`);
  },

  async paste(targetDir) {
    if (!AdminState.clipboard) return;

    const { operation, paths } = AdminState.clipboard;

    if (operation === 'cut') {
      try {
        const result = await AdminAPI.move(paths, targetDir);
        if (result.success) {
          AdminState.clipboard = null;
          AdminState.cutPaths.clear();
          AdminState.selectedPaths = [];
          await TreeModule.loadTree();
          this.showNotification(`${paths.length} item(s) moved`);
        } else {
          this.showNotification(result.error?.message || 'Move failed', 'error');
        }
      } catch (error) {
        this.showNotification('Connection error', 'error');
      }
    } else if (operation === 'copy') {
      try {
        const result = await AdminAPI.copy(paths, targetDir);
        if (result.success) {
          // Don't clear clipboard for copy - allow multiple pastes
          AdminState.selectedPaths = [];
          await TreeModule.loadTree();
          this.showNotification(`${result.copied.length} item(s) copied`);
        } else {
          this.showNotification(result.error?.message || 'Copy failed', 'error');
        }
      } catch (error) {
        this.showNotification('Connection error', 'error');
      }
    }
  },

  clear() {
    AdminState.clipboard = null;
    AdminState.cutPaths.clear();
    TreeModule.renderTree();
  },

  showNotification(message, type = 'info') {
    // Simple notification - could be enhanced with a proper toast system
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
      notification.classList.add('fade-out');
      setTimeout(() => notification.remove(), 300);
    }, 2000);
  }
};

// ============================================================
// Phase 6: Editor Module
// ============================================================
const EditorModule = {
  // Open editor for a file
  async openEditor(path) {
    // Check if there are unsaved changes in current editor
    if (AdminState.editor.isDirty) {
      const action = await this.showUnsavedPrompt();
      if (action === 'cancel') return false;
      if (action === 'save') {
        const saved = await this.save();
        if (!saved) return false;
      }
    }

    // Load file content
    const result = await AdminAPI.getContent(path);
    if (!result.success) {
      ClipboardModule.showNotification(result.error?.message || 'Failed to load file', 'error');
      return false;
    }

    // Update state
    AdminState.editor = {
      isOpen: true,
      path: path,
      originalContent: result.content,
      modifiedAt: result.modifiedAt,
      isDirty: false,
      mode: 'edit'
    };

    // Show editor UI
    this.showEditorUI(path, result.content);
    return true;
  },

  // Show editor UI
  showEditorUI(path, content) {
    const container = document.getElementById('editor-container');
    const textarea = document.getElementById('editor-textarea');
    const preview = document.getElementById('editor-preview');
    const pathEl = document.querySelector('.editor-path');
    const fileViewer = document.getElementById('file-viewer');
    const placeholder = document.getElementById('content-placeholder');
    const editBtn = document.getElementById('admin-edit-btn');
    const tocToggle = document.getElementById('admin-toc-toggle');

    if (!container || !textarea) return;

    // Hide other content areas and buttons
    if (fileViewer) fileViewer.style.display = 'none';
    if (placeholder) placeholder.style.display = 'none';
    if (editBtn) editBtn.style.display = 'none';
    if (tocToggle) tocToggle.style.display = 'none';
    AdminTOC.hide();

    // Show editor
    container.style.display = 'flex';
    if (pathEl) pathEl.textContent = path;
    textarea.value = content;
    if (preview) preview.innerHTML = '';

    // Set initial mode
    this.setMode('edit');
    this.updateDirtyIndicator();

    // Focus textarea
    textarea.focus();
  },

  // Close editor
  async closeEditor(force = false) {
    if (!force && AdminState.editor.isDirty) {
      const action = await this.showUnsavedPrompt();
      if (action === 'cancel') return false;
      if (action === 'save') {
        const saved = await this.save();
        if (!saved) return false;
      }
    }

    // Reset state
    AdminState.editor = {
      isOpen: false,
      path: null,
      originalContent: '',
      modifiedAt: null,
      isDirty: false,
      mode: 'edit'
    };

    // Hide editor
    const container = document.getElementById('editor-container');
    if (container) container.style.display = 'none';

    return true;
  },

  // Set edit/preview mode
  setMode(mode) {
    AdminState.editor.mode = mode;

    const textarea = document.getElementById('editor-textarea');
    const preview = document.getElementById('editor-preview');
    const editBtn = document.querySelector('.mode-edit');
    const previewBtn = document.querySelector('.mode-preview');

    if (mode === 'edit') {
      if (textarea) textarea.style.display = 'block';
      if (preview) preview.style.display = 'none';
      if (editBtn) editBtn.classList.add('active');
      if (previewBtn) previewBtn.classList.remove('active');
    } else {
      if (textarea) textarea.style.display = 'none';
      if (preview) {
        preview.style.display = 'block';
        // Render markdown
        const content = textarea ? textarea.value : '';
        preview.innerHTML = DOMPurify.sanitize(marked.parse(content));
        // Highlight code blocks
        preview.querySelectorAll('pre code').forEach(block => {
          if (typeof hljs !== 'undefined') {
            hljs.highlightElement(block);
          }
        });
        // Render mermaid diagrams
        if (typeof mermaid !== 'undefined') {
          preview.querySelectorAll('.language-mermaid').forEach(block => {
            const code = block.textContent;
            const div = document.createElement('div');
            div.className = 'mermaid';
            div.textContent = code;
            block.parentElement.replaceWith(div);
          });
          mermaid.run();
        }
      }
      if (editBtn) editBtn.classList.remove('active');
      if (previewBtn) previewBtn.classList.add('active');
    }
  },

  // Toggle between edit and preview mode
  toggleMode() {
    this.setMode(AdminState.editor.mode === 'edit' ? 'preview' : 'edit');
  },

  // Handle input changes
  handleInput() {
    const textarea = document.getElementById('editor-textarea');
    if (!textarea || !AdminState.editor.isOpen) return;

    const newIsDirty = textarea.value !== AdminState.editor.originalContent;
    if (newIsDirty !== AdminState.editor.isDirty) {
      AdminState.editor.isDirty = newIsDirty;
      this.updateDirtyIndicator();
    }
  },

  // Update dirty indicator UI
  updateDirtyIndicator() {
    const indicator = document.querySelector('.dirty-indicator');
    const saveBtn = document.querySelector('.editor-save');

    if (AdminState.editor.isDirty) {
      if (indicator) {
        indicator.textContent = '●';
        indicator.title = 'Unsaved changes';
      }
      if (saveBtn) saveBtn.disabled = false;
    } else {
      if (indicator) {
        indicator.textContent = '';
        indicator.title = '';
      }
      if (saveBtn) saveBtn.disabled = true;
    }
  },

  // Save file
  async save() {
    if (!AdminState.editor.isOpen || !AdminState.editor.path) return false;

    const textarea = document.getElementById('editor-textarea');
    if (!textarea) return false;

    const content = textarea.value;

    try {
      const result = await AdminAPI.saveContent(
        AdminState.editor.path,
        content,
        AdminState.editor.modifiedAt
      );

      if (result.success) {
        AdminState.editor.originalContent = content;
        AdminState.editor.modifiedAt = result.modifiedAt;
        AdminState.editor.isDirty = false;
        this.updateDirtyIndicator();
        ClipboardModule.showNotification('Saved successfully', 'success');
        return true;
      } else if (result.error?.code === 'CONFLICT') {
        await this.handleConflict(result.error.serverModifiedAt);
        return false;
      } else {
        ClipboardModule.showNotification(result.error?.message || 'Save failed', 'error');
        return false;
      }
    } catch (error) {
      ClipboardModule.showNotification('Connection error', 'error');
      return false;
    }
  },

  // Discard changes
  discardChanges() {
    const textarea = document.getElementById('editor-textarea');
    if (textarea && AdminState.editor.isOpen) {
      textarea.value = AdminState.editor.originalContent;
      AdminState.editor.isDirty = false;
      this.updateDirtyIndicator();
    }
  },

  // Handle save conflict
  async handleConflict(serverModifiedAt) {
    return new Promise((resolve) => {
      const modal = document.getElementById('conflict-modal');
      if (!modal) {
        resolve('cancel');
        return;
      }

      const serverTimeEl = modal.querySelector('.server-time');
      if (serverTimeEl) {
        serverTimeEl.textContent = new Date(serverModifiedAt).toLocaleString();
      }
      modal.style.display = 'flex';

      const reloadBtn = modal.querySelector('.btn-reload');
      const overwriteBtn = modal.querySelector('.btn-overwrite');

      const cleanup = () => {
        modal.style.display = 'none';
        if (reloadBtn) reloadBtn.onclick = null;
        if (overwriteBtn) overwriteBtn.onclick = null;
      };

      if (reloadBtn) {
        reloadBtn.onclick = async () => {
          cleanup();
          await this.openEditor(AdminState.editor.path);
          resolve('reload');
        };
      }

      if (overwriteBtn) {
        overwriteBtn.onclick = async () => {
          cleanup();
          AdminState.editor.modifiedAt = null;
          await this.save();
          resolve('overwrite');
        };
      }
    });
  },

  // Show unsaved changes prompt
  showUnsavedPrompt() {
    return new Promise((resolve) => {
      const modal = document.getElementById('unsaved-modal');
      if (!modal) {
        resolve('discard');
        return;
      }

      const filePathEl = modal.querySelector('.file-path');
      if (filePathEl) {
        filePathEl.textContent = AdminState.editor.path || '';
      }
      modal.style.display = 'flex';

      const cancelBtn = modal.querySelector('.btn-cancel');
      const discardBtn = modal.querySelector('.btn-discard');
      const saveBtn = modal.querySelector('.btn-save');

      const cleanup = () => {
        modal.style.display = 'none';
        if (cancelBtn) cancelBtn.onclick = null;
        if (discardBtn) discardBtn.onclick = null;
        if (saveBtn) saveBtn.onclick = null;
      };

      if (cancelBtn) {
        cancelBtn.onclick = () => {
          cleanup();
          resolve('cancel');
        };
      }

      if (discardBtn) {
        discardBtn.onclick = () => {
          cleanup();
          AdminState.editor.isDirty = false;
          resolve('discard');
        };
      }

      if (saveBtn) {
        saveBtn.onclick = async () => {
          cleanup();
          await this.save();
          resolve('save');
        };
      }
    });
  }
};

// ============================================================
// Phase 7: Drag and Drop Module
// ============================================================
const DragDropModule = {
  dragSource: null,       // 드래그 중인 항목
  dragPaths: [],          // 다중 선택 시 모든 경로
  dropTarget: null,       // 현재 드롭 대상

  // TASK-701: handleDragStart
  handleDragStart(event, path) {
    // 선택된 항목이 있으면 모두 드래그
    if (AdminState.selectedPaths.includes(path)) {
      this.dragPaths = [...AdminState.selectedPaths];
    } else {
      this.dragPaths = [path];
    }

    this.dragSource = path;

    // 드래그 이미지 생성 (동기적으로 처리해야 함)
    const dragImage = this.createDragImage(this.dragPaths);
    document.body.appendChild(dragImage);
    event.dataTransfer.setDragImage(dragImage, 10, 10);
    setTimeout(() => dragImage.remove(), 0);

    // 데이터 설정 (동기적으로 처리해야 함)
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', JSON.stringify(this.dragPaths));

    // 시각적 업데이트는 다음 프레임에서 처리 (브라우저 렌더링 타이밍 이슈 해결)
    const dragPaths = [...this.dragPaths];
    requestAnimationFrame(() => {
      // 드래그 중 스타일
      dragPaths.forEach(p => {
        const el = document.querySelector(`[data-path="${CSS.escape(p)}"]`);
        if (el) {
          el.classList.add('dragging');
        }
      });

      // 부모 이동 드롭존 표시
      const parentDropZone = document.querySelector('.parent-drop-zone');
      if (parentDropZone) {
        parentDropZone.style.display = 'block';
      }
    });
  },

  // TASK-702: handleDragOver
  handleDragOver(event, targetPath, targetType) {
    event.preventDefault();

    // 유효성 검사
    const isValid = this.isValidDropTarget(targetPath, targetType);

    if (isValid) {
      event.dataTransfer.dropEffect = 'move';
      const el = document.querySelector(`[data-path="${CSS.escape(targetPath)}"]`);
      if (el && this.dropTarget !== targetPath) {
        // 이전 하이라이트 제거
        document.querySelectorAll('.drop-target').forEach(e => e.classList.remove('drop-target'));
        el.classList.add('drop-target');
        this.dropTarget = targetPath;
      }
    } else {
      event.dataTransfer.dropEffect = 'none';
    }
  },

  // TASK-703: handleDragLeave
  handleDragLeave(event) {
    const el = event.currentTarget;
    if (el) {
      el.classList.remove('drop-target');
    }
    if (el && el.dataset.path === this.dropTarget) {
      this.dropTarget = null;
    }
  },

  // TASK-704: handleDrop
  async handleDrop(event, targetPath, targetType) {
    event.preventDefault();
    event.stopPropagation();

    // 하이라이트 제거
    document.querySelectorAll('.drop-target').forEach(e => e.classList.remove('drop-target'));

    if (!this.isValidDropTarget(targetPath, targetType)) {
      this.resetDragState();
      return;
    }

    // 이동 실행
    const targetDir = targetType === 'directory' ? targetPath : this.getParentPath(targetPath);

    try {
      const result = await AdminAPI.move(this.dragPaths, targetDir);
      if (result.success) {
        // 현재 보기 파일이 이동된 경우 URL 업데이트
        if (result.moved) {
          const movedFile = result.moved.find(m => m.from === AdminState.currentViewPath);
          if (movedFile) {
            URLModule.navigateTo(movedFile.to);
          }
        }

        await TreeModule.loadTree();
        ClipboardModule.showNotification(`Moved ${this.dragPaths.length} item(s)`, 'success');
      } else if (result.errors) {
        const errorMsg = result.errors.map(e => e.error).join(', ');
        ClipboardModule.showNotification(`Move failed: ${errorMsg}`, 'error');
      }
    } catch (error) {
      ClipboardModule.showNotification('Move failed: ' + error.message, 'error');
    }

    this.resetDragState();
  },

  // TASK-705: handleDragEnd
  handleDragEnd(event) {
    this.resetDragState();
  },

  // TASK-706: isValidDropTarget
  isValidDropTarget(targetPath, targetType) {
    // 자기 자신으로 이동 불가
    if (this.dragPaths.includes(targetPath)) return false;

    // 파일에는 드롭 불가 (디렉토리만)
    if (targetType === 'file') return false;

    // 자기 하위로 이동 불가
    for (const sourcePath of this.dragPaths) {
      if (targetPath.startsWith(sourcePath + '/')) return false;
    }

    return true;
  },

  // TASK-708: getParentPath
  getParentPath(path) {
    const parts = path.split('/').filter(Boolean);
    parts.pop();
    return '/' + parts.join('/') || '/';
  },

  // TASK-709: createDragImage
  createDragImage(paths) {
    const div = document.createElement('div');
    div.className = 'drag-image';
    div.style.cssText = 'position: absolute; top: -9999px; background: white; padding: 8px 12px; border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.2); font-size: 14px;';

    if (paths.length === 1) {
      div.textContent = paths[0].split('/').pop();
    } else {
      div.textContent = `${paths.length} items`;
    }

    return div;
  },

  resetDragState() {
    // 드래그 스타일 제거
    document.querySelectorAll('.dragging').forEach(e => e.classList.remove('dragging'));
    document.querySelectorAll('.drop-target').forEach(e => e.classList.remove('drop-target'));

    // 부모 이동 드롭존 숨김
    const parentDropZone = document.querySelector('.parent-drop-zone');
    if (parentDropZone) {
      parentDropZone.style.display = 'none';
    }

    this.dragSource = null;
    this.dragPaths = [];
    this.dropTarget = null;
  },

  // TASK-711: setupDraggable
  setupDraggable(element, path, type) {
    element.setAttribute('draggable', 'true');

    element.addEventListener('dragstart', (e) => this.handleDragStart(e, path));
    element.addEventListener('dragover', (e) => this.handleDragOver(e, path, type));
    element.addEventListener('dragleave', (e) => this.handleDragLeave(e));
    element.addEventListener('drop', (e) => this.handleDrop(e, path, type));
    element.addEventListener('dragend', (e) => this.handleDragEnd(e));
  },

  // TASK-707: setupParentDropZone
  setupParentDropZone(container) {
    const parentDropZone = document.createElement('div');
    parentDropZone.className = 'parent-drop-zone';
    parentDropZone.innerHTML = '⬆️ Move to root folder';
    parentDropZone.style.display = 'none';

    parentDropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      parentDropZone.classList.add('drop-target');
    });
    parentDropZone.addEventListener('dragleave', () => {
      parentDropZone.classList.remove('drop-target');
    });
    parentDropZone.addEventListener('drop', async (e) => {
      e.preventDefault();
      parentDropZone.classList.remove('drop-target');

      // 루트로 이동
      try {
        const result = await AdminAPI.move(this.dragPaths, '/');
        if (result.success) {
          await TreeModule.loadTree();
          ClipboardModule.showNotification(`Moved ${this.dragPaths.length} item(s) to root`, 'success');
        }
      } catch (error) {
        ClipboardModule.showNotification('Move failed: ' + error.message, 'error');
      }

      this.resetDragState();
    });

    container.appendChild(parentDropZone);
  }
};

// ============================================================
// Event Bindings
// ============================================================
function bindEvents() {
  // 인증 - 로그인 버튼
  const loginBtn = document.getElementById('auth-login');
  if (loginBtn) {
    loginBtn.addEventListener('click', () => AuthModule.handleLogin());
  }

  // 인증 - 취소 버튼
  const cancelBtn = document.getElementById('auth-cancel');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      window.location.href = '/';
    });
  }

  // 인증 - Enter 키
  const apiKeyInput = document.getElementById('api-key-input');
  if (apiKeyInput) {
    apiKeyInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        AuthModule.handleLogin();
      }
    });
  }

  // 로그아웃
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => AuthModule.handleLogout());
  }

  // 트리 새로고침
  const refreshBtn = document.getElementById('refresh-tree');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => TreeModule.loadTree());
  }

  // 브라우저 뒤로가기/앞으로가기
  window.addEventListener('popstate', (e) => URLModule.handlePopState(e));

  // Phase 5: Global click to close context menu
  document.addEventListener('click', () => {
    ContextMenuModule.hideContextMenu();
  });

  // Phase 5: Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Don't handle shortcuts when typing in inputs
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
      // ESC in modal inputs
      if (e.key === 'Escape' && ModalModule.currentModal) {
        ModalModule.hideAllModals();
      }
      // Enter in modal inputs
      if (e.key === 'Enter') {
        if (ModalModule.currentModal === 'rename-modal') {
          e.preventDefault();
          ModalModule.handleRename();
        } else if (ModalModule.currentModal === 'create-modal') {
          e.preventDefault();
          ModalModule.handleCreate();
        }
      }
      return;
    }

    // ESC: Close modal, editor, or clear selection
    if (e.key === 'Escape') {
      if (ModalModule.currentModal) {
        ModalModule.hideAllModals();
      } else if (AdminState.editor.isOpen) {
        EditorModule.closeEditor();
      } else {
        ContextMenuModule.hideContextMenu();
        SelectionModule.clearSelection();
      }
      return;
    }

    // Only handle if authenticated
    if (!AdminState.isAuthenticated) return;

    // Delete: Show delete confirmation
    if (e.key === 'Delete' && AdminState.selectedPaths.length > 0) {
      e.preventDefault();
      ModalModule.showDeleteConfirm(AdminState.selectedPaths);
      return;
    }

    // F2: Rename
    if (e.key === 'F2' && AdminState.selectedPaths.length === 1) {
      e.preventDefault();
      ModalModule.showRenameModal(AdminState.selectedPaths[0]);
      return;
    }

    // Ctrl+A: Select all
    if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
      e.preventDefault();
      SelectionModule.selectAll();
      return;
    }

    // Ctrl+X: Cut
    if ((e.ctrlKey || e.metaKey) && e.key === 'x' && AdminState.selectedPaths.length > 0) {
      e.preventDefault();
      ClipboardModule.cut(AdminState.selectedPaths);
      return;
    }

    // Ctrl+C: Copy
    if ((e.ctrlKey || e.metaKey) && e.key === 'c' && AdminState.selectedPaths.length > 0) {
      e.preventDefault();
      ClipboardModule.copy(AdminState.selectedPaths);
      return;
    }

    // Ctrl+V: Paste
    if ((e.ctrlKey || e.metaKey) && e.key === 'v' && AdminState.clipboard) {
      e.preventDefault();
      // Paste into selected folder or root
      const targetPath = AdminState.selectedPaths.length === 1
        ? AdminState.selectedPaths[0]
        : '/';
      ClipboardModule.paste(targetPath);
      return;
    }

    // Phase 6: Editor shortcuts
    // Ctrl+S: Save
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      if (AdminState.editor.isOpen && AdminState.editor.isDirty) {
        EditorModule.save();
      }
      return;
    }

    // Ctrl+E: Toggle edit/preview mode
    if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
      e.preventDefault();
      if (AdminState.editor.isOpen) {
        EditorModule.toggleMode();
      }
      return;
    }
  });

  // Phase 6: Editor event bindings
  const editorTextarea = document.getElementById('editor-textarea');
  if (editorTextarea) {
    editorTextarea.addEventListener('input', () => EditorModule.handleInput());
  }

  const editorSaveBtn = document.querySelector('.editor-save');
  if (editorSaveBtn) {
    editorSaveBtn.addEventListener('click', () => EditorModule.save());
  }

  const modeEditBtn = document.querySelector('.mode-edit');
  if (modeEditBtn) {
    modeEditBtn.addEventListener('click', () => EditorModule.setMode('edit'));
  }

  const modePreviewBtn = document.querySelector('.mode-preview');
  if (modePreviewBtn) {
    modePreviewBtn.addEventListener('click', () => EditorModule.setMode('preview'));
  }

  const editorCloseBtn = document.querySelector('.editor-close');
  if (editorCloseBtn) {
    editorCloseBtn.addEventListener('click', () => EditorModule.closeEditor());
  }

  // Phase 6: Beforeunload warning for unsaved changes
  window.addEventListener('beforeunload', (e) => {
    if (AdminState.editor.isDirty) {
      e.preventDefault();
      e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
      return e.returnValue;
    }
  });

  // Phase 5: Modal button bindings
  // Rename modal
  const renameSaveBtn = document.getElementById('rename-save');
  if (renameSaveBtn) {
    renameSaveBtn.addEventListener('click', () => ModalModule.handleRename());
  }
  const renameCancelBtn = document.getElementById('rename-cancel');
  if (renameCancelBtn) {
    renameCancelBtn.addEventListener('click', () => ModalModule.hideModal('rename-modal'));
  }

  // Delete modal
  const deleteConfirmBtn = document.getElementById('delete-confirm');
  if (deleteConfirmBtn) {
    deleteConfirmBtn.addEventListener('click', () => ModalModule.handleDelete());
  }
  const deleteCancelBtn = document.getElementById('delete-cancel');
  if (deleteCancelBtn) {
    deleteCancelBtn.addEventListener('click', () => ModalModule.hideModal('delete-modal'));
  }

  // Create modal
  const createSaveBtn = document.getElementById('create-save');
  if (createSaveBtn) {
    createSaveBtn.addEventListener('click', () => ModalModule.handleCreate());
  }
  const createCancelBtn = document.getElementById('create-cancel');
  if (createCancelBtn) {
    createCancelBtn.addEventListener('click', () => ModalModule.hideModal('create-modal'));
  }
}

// ============================================================
// Upload Module - Drag & Drop File Upload
// ============================================================
const UploadModule = {
  uploads: new Map(), // Map<filename, { xhr, progress, status }>
  containerElement: null,

  init() {
    this.createProgressContainer();
    this.bindDropZones();
  },

  createProgressContainer() {
    // 컨텐츠 영역 우측 상단에 플로팅 토스트 생성
    const contentArea = document.getElementById('admin-content');
    if (!contentArea) return;

    const container = document.createElement('div');
    container.id = 'upload-progress-container';
    container.className = 'upload-toast';
    container.style.display = 'none';
    contentArea.appendChild(container);
    this.containerElement = container;
  },

  bindDropZones() {
    // 우측 컨텐츠 영역 - 루트에 업로드
    const contentArea = document.getElementById('admin-content');
    if (contentArea) {
      this.setupDropZone(contentArea, () => '/');
    }

    // 좌측 사이드바 - 디렉토리에 업로드
    const fileTree = document.getElementById('file-tree');
    if (fileTree) {
      this.setupDropZone(fileTree, (e) => {
        // 드롭 대상 디렉토리 확인
        const treeItem = e.target.closest('.tree-item');
        if (treeItem && treeItem.dataset.type === 'directory') {
          return treeItem.dataset.path;
        }
        return '/'; // 빈 공간이면 루트
      });
    }
  },

  setupDropZone(element, getTargetPath) {
    // 드래그 상태 관리를 위한 타이머
    let dragTimeout = null;

    const clearHighlight = () => {
      element.classList.remove('upload-drop-target');
      element.querySelectorAll('.upload-dir-target').forEach(el => {
        el.classList.remove('upload-dir-target');
      });
    };

    const resetDragTimeout = () => {
      if (dragTimeout) clearTimeout(dragTimeout);
      // 100ms 후 하이라이트 제거 (dragover가 계속 발생하면 리셋됨)
      dragTimeout = setTimeout(clearHighlight, 100);
    };

    // DOMStringList에서 'Files' 타입 확인 (브라우저 호환성)
    const hasFileType = (dataTransfer) => {
      const types = dataTransfer.types;
      // DOMStringList는 contains(), Array는 includes() 사용
      if (types.contains) return types.contains('Files');
      if (types.includes) return types.includes('Files');
      return Array.from(types).includes('Files');
    };

    element.addEventListener('dragenter', (e) => {
      // 외부 파일인 경우만 처리
      if (!hasFileType(e.dataTransfer)) return;

      e.preventDefault();
      e.stopPropagation();
      element.classList.add('upload-drop-target');
      resetDragTimeout();
    });

    element.addEventListener('dragover', (e) => {
      if (!hasFileType(e.dataTransfer)) return;

      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'copy';

      // 타이머 리셋 (계속 드래그 중임을 표시)
      resetDragTimeout();

      // 사이드바에서 디렉토리 하이라이트
      if (element.id === 'file-tree') {
        const treeItem = e.target.closest('.tree-item');
        // 이전 하이라이트 제거
        element.querySelectorAll('.upload-dir-target').forEach(el => {
          el.classList.remove('upload-dir-target');
        });
        if (treeItem && treeItem.dataset.type === 'directory') {
          treeItem.classList.add('upload-dir-target');
        }
      }
    });

    element.addEventListener('dragleave', (e) => {
      if (!hasFileType(e.dataTransfer)) return;

      e.preventDefault();
      e.stopPropagation();
      // 타이머가 하이라이트 제거를 담당
    });

    element.addEventListener('drop', async (e) => {
      if (!hasFileType(e.dataTransfer)) return;

      e.preventDefault();
      e.stopPropagation();

      // 즉시 하이라이트 제거
      if (dragTimeout) clearTimeout(dragTimeout);
      clearHighlight();

      const targetPath = getTargetPath(e);

      // 먼저 일반 파일 목록 확보 (폴백용)
      const fallbackFiles = Array.from(e.dataTransfer.files);

      // 디렉토리 업로드 지원: dataTransfer.items 사용
      if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
        const items = Array.from(e.dataTransfer.items);
        const allFiles = [];

        for (const item of items) {
          if (item.kind === 'file') {
            // webkitGetAsEntry 지원 확인
            const entry = (typeof item.webkitGetAsEntry === 'function') ? item.webkitGetAsEntry() : null;

            if (entry && entry.isDirectory) {
              // 디렉토리: 재귀적으로 파일 수집
              try {
                const dirFiles = await this.readDirectoryRecursive(entry, entry.name);
                allFiles.push(...dirFiles);
              } catch (err) {
                console.error('Failed to read directory:', err);
              }
            } else {
              // 파일: getAsFile() 사용
              const file = item.getAsFile();
              if (file) {
                allFiles.push({ file, relativePath: '' });
              }
            }
          }
        }

        if (allFiles.length > 0) {
          this.uploadFilesWithPaths(allFiles, targetPath);
        } else if (fallbackFiles.length > 0) {
          // items에서 파일을 못 가져온 경우 폴백
          this.uploadFiles(fallbackFiles, targetPath);
        }
      } else if (fallbackFiles.length > 0) {
        // items 미지원 시 폴백
        this.uploadFiles(fallbackFiles, targetPath);
      }
    });

    // 페이지 전체에서 드래그 이탈 시 하이라이트 제거
    document.addEventListener('dragend', clearHighlight);
  },

  // 디렉토리 재귀 읽기
  readDirectoryRecursive(directoryEntry, basePath) {
    return new Promise((resolve) => {
      const files = [];
      const reader = directoryEntry.createReader();

      const readEntries = () => {
        reader.readEntries(async (entries) => {
          if (entries.length === 0) {
            resolve(files);
            return;
          }

          for (const entry of entries) {
            if (entry.isFile) {
              const file = await this.getFileFromEntry(entry);
              if (file) {
                files.push({ file, relativePath: basePath });
              }
            } else if (entry.isDirectory) {
              const subFiles = await this.readDirectoryRecursive(entry, basePath + '/' + entry.name);
              files.push(...subFiles);
            }
          }

          // 계속 읽기 (Chrome은 한번에 100개만 반환)
          readEntries();
        });
      };

      readEntries();
    });
  },

  // FileSystemFileEntry에서 File 객체 추출
  getFileFromEntry(fileEntry) {
    return new Promise((resolve) => {
      fileEntry.file(
        (file) => resolve(file),
        () => resolve(null)
      );
    });
  },

  // 상대 경로를 포함한 파일 업로드
  async uploadFilesWithPaths(filesWithPaths, targetPath) {
    if (!this.containerElement) return;

    // 진행률 UI 표시
    this.containerElement.style.display = 'flex';

    const results = [];

    // 각 파일별 업로드
    for (const { file, relativePath } of filesWithPaths) {
      try {
        // 상대 경로가 있으면 타겟 경로에 추가
        const uploadPath = relativePath
          ? (targetPath === '/' ? '/' + relativePath : targetPath + '/' + relativePath)
          : targetPath;

        const result = await this.uploadSingleFile(file, uploadPath);
        results.push(result);
      } catch (error) {
        results.push({ success: false, filename: file.name, error: error.message });
      }
    }

    // 업로드 완료 후 처리
    this.onAllUploadsComplete(results, targetPath);
  },

  async uploadFiles(files, targetPath) {
    if (!this.containerElement) return;

    // 진행률 UI 표시
    this.containerElement.style.display = 'flex';

    const results = [];

    // 각 파일별 업로드
    for (const file of files) {
      try {
        const result = await this.uploadSingleFile(file, targetPath);
        results.push(result);
      } catch (error) {
        results.push({ success: false, filename: file.name, error: error.message });
      }
    }

    // 업로드 완료 후 처리
    this.onAllUploadsComplete(results, targetPath);
  },

  uploadSingleFile(file, targetPath) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const formData = new FormData();
      formData.append('files', file);

      // 진행률 UI 요소 생성
      const itemEl = document.createElement('div');
      itemEl.className = 'upload-item';
      itemEl.innerHTML = `
        <span class="upload-filename" title="${file.name}">${this.truncateFilename(file.name)}</span>
        <span class="upload-percent">0%</span>
      `;
      this.containerElement.appendChild(itemEl);

      const percentEl = itemEl.querySelector('.upload-percent');

      // 에러 표시 (아이콘만, 메시지는 알림에서 표시) + 페이드 아웃
      const markError = () => {
        percentEl.textContent = '✗';
        percentEl.classList.add('error');
        // 실패 항목도 일정 시간 후 페이드 아웃
        setTimeout(() => {
          itemEl.classList.add('fade-out');
          setTimeout(() => itemEl.remove(), 300);
        }, 2000);
      };

      // 진행률 업데이트
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100);
          percentEl.textContent = `${percent}%`;
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText);
            // 완료 표시
            percentEl.textContent = '✓';
            percentEl.classList.add('complete');

            // 페이드 아웃
            setTimeout(() => {
              itemEl.classList.add('fade-out');
              setTimeout(() => itemEl.remove(), 300);
            }, 1000);

            resolve({
              success: true,
              filename: file.name,
              path: targetPath,
              ...response
            });
          } catch {
            markError();
            resolve({ success: false, filename: file.name, error: 'Invalid response' });
          }
        } else {
          // HTTP 에러 - 서버 응답에서 에러 메시지 추출
          let errorMsg = `Error ${xhr.status}`;
          try {
            const errResponse = JSON.parse(xhr.responseText);
            if (errResponse.error && errResponse.error.message) {
              errorMsg = errResponse.error.message;
            }
          } catch {
            // JSON 파싱 실패 시 기본 메시지 사용
          }
          markError();
          resolve({ success: false, filename: file.name, error: errorMsg });
        }
      };

      xhr.onerror = () => {
        markError();
        resolve({ success: false, filename: file.name, error: 'Network error' });
      };

      xhr.open('POST', `/api/admin/upload?path=${encodeURIComponent(targetPath)}`);
      xhr.withCredentials = true;
      xhr.send(formData);
    });
  },

  truncateFilename(name, maxLength = 20) {
    if (name.length <= maxLength) return name;
    const ext = name.includes('.') ? '.' + name.split('.').pop() : '';
    const base = name.slice(0, name.length - ext.length);
    const truncated = base.slice(0, maxLength - ext.length - 3) + '...';
    return truncated + ext;
  },

  async onAllUploadsComplete(results, targetPath) {
    // 컨테이너 숨김 (모든 아이템이 사라질 때까지 확인)
    const checkAndHide = () => {
      if (this.containerElement && this.containerElement.children.length === 0) {
        this.containerElement.style.display = 'none';
      } else {
        setTimeout(checkAndHide, 500);
      }
    };
    setTimeout(checkAndHide, 1000);

    // 트리 새로고침
    await TreeModule.loadTree();

    // 성공/실패 분류
    const successResults = results.filter(r => r.success);
    const failedResults = results.filter(r => !r.success);
    const successCount = successResults.length;
    const failCount = failedResults.length;

    // 알림 표시
    if (failCount > 0) {
      // 실패한 파일과 원인 표시
      const failMessages = failedResults
        .map(r => `${r.filename}: ${r.error}`)
        .join('\n');
      const message = successCount > 0
        ? `${successCount} uploaded, ${failCount} failed:\n${failMessages}`
        : `Upload failed:\n${failMessages}`;
      ClipboardModule.showNotification(message, successCount > 0 ? 'warning' : 'error');
    } else {
      ClipboardModule.showNotification(`${successCount} file(s) uploaded`, 'success');
    }

    // 단일 MD 파일인 경우 자동 표시
    const mdFiles = results.filter(r => r.success && r.filename.toLowerCase().endsWith('.md'));
    if (mdFiles.length === 1 && results.length === 1) {
      const uploadedPath = targetPath === '/'
        ? '/' + mdFiles[0].filename
        : targetPath + '/' + mdFiles[0].filename;
      ViewerModule.loadFile(uploadedPath);
    }
  }
};

// ============================================================
// Initialization
// ============================================================
async function init() {
  // 이벤트 바인딩
  bindEvents();

  // 리사이저 초기화
  ResizerModule.init();

  // TOC 모듈 초기화
  AdminTOC.init();

  // Edit 버튼 이벤트 바인딩
  const editBtn = document.getElementById('admin-edit-btn');
  if (editBtn) {
    editBtn.addEventListener('click', () => {
      if (AdminState.currentViewPath && AdminState.currentViewPath.endsWith('.md')) {
        EditorModule.openEditor(AdminState.currentViewPath);
      }
    });
  }

  // Mermaid 초기화
  if (typeof mermaid !== 'undefined') {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'default'
    });
  }

  // 세션 확인
  const hasSession = await AuthModule.checkSession();
  if (hasSession) {
    await TreeModule.loadTree();
    URLModule.handleInitialPath();
    // 업로드 모듈 초기화 (인증 후)
    UploadModule.init();
  } else {
    AuthModule.showAuthModal();
  }
}

// DOM 준비 후 초기화
document.addEventListener('DOMContentLoaded', init);
