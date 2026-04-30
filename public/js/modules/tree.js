// public/js/modules/tree.js
// 편집/어드민 모드 전용 트리 모듈 (admin API 사용).
// admin.js TreeModule (라인 378-572) 을 ESM 으로 이식.
// view 모드 트리(window.__viewTree) 와 mutex 운용.

const state = {
  fileTree: null,
  selectedPaths: [],
  lastSelectedPath: null,
  expandedPaths: new Set(),
  cutPaths: new Set(),
  isLoading: false
};

let container = null;
let activated = false;
let loadSeq = 0;

function _bp(p) {
  const fn = (typeof window !== 'undefined' && window.DocLightUtils && window.DocLightUtils.prefixPath);
  return typeof fn === 'function' ? fn(p) : p;
}

async function fetchTree(path = '/') {
  const response = await fetch(_bp(`/api/admin/tree?path=${encodeURIComponent(path)}`), {
    credentials: 'include'
  });
  return response.json();
}

function getFileIcon(extension) {
  const iconMap = {
    '.md': '\uD83D\uDCC4',
    '.txt': '\uD83D\uDCDD',
    '.json': '\uD83D\uDCCB',
    '.json5': '\uD83D\uDCCB',
    '.yaml': '\uD83D\uDCCB',
    '.yml': '\uD83D\uDCCB',
    '.png': '\uD83D\uDDBC\uFE0F',
    '.jpg': '\uD83D\uDDBC\uFE0F',
    '.jpeg': '\uD83D\uDDBC\uFE0F',
    '.gif': '\uD83D\uDDBC\uFE0F',
    '.svg': '\uD83D\uDDBC\uFE0F',
    '.pdf': '\uD83D\uDCD5',
    '.html': '\uD83C\uDF10',
    '.css': '\uD83C\uDFA8',
    '.js': '\u26A1',
    '.ts': '\uD83D\uDCD8'
  };
  return iconMap[extension?.toLowerCase()] || '\uD83D\uDCCE';
}

async function loadTree() {
  const myRun = ++loadSeq;
  state.isLoading = true;
  try {
    const result = await fetchTree('/');
    // Stale fetch — a newer activate() has superseded this run
    if (myRun !== loadSeq) return;
    if (result && result.success) {
      state.fileTree = result.tree;
      renderTree();
    } else {
      console.error('Failed to load tree:', result && result.error);
    }
  } catch (error) {
    if (myRun !== loadSeq) return;
    console.error('Tree load error:', error);
  } finally {
    if (myRun === loadSeq) state.isLoading = false;
  }
}

function renderTree() {
  if (!container) return;
  container.innerHTML = '';

  const DragDrop = (typeof window !== 'undefined') ? window.DragDropModule : null;
  if (DragDrop && typeof DragDrop.setupParentDropZone === 'function') {
    DragDrop.setupParentDropZone(container);
  }

  container.oncontextmenu = (e) => {
    if (e.target.closest('.tree-item')) return;
    e.preventDefault();
    state.selectedPaths = [];
    state.lastSelectedPath = null;
    updateSelection();
    const ContextMenu = window.ContextMenuModule;
    if (ContextMenu && typeof ContextMenu.showContextMenu === 'function') {
      ContextMenu.showContextMenu(e.clientX, e.clientY, '/', 'root');
    }
  };

  if (!state.fileTree?.root) {
    container.innerHTML += '<div class="tree-empty">No files found</div>';
    return;
  }

  const root = state.fileTree.root;
  renderNodes(container, [...root.dirs, ...root.files], 0);
}

function renderNodes(parentEl, nodes, depth) {
  if (!nodes || nodes.length === 0) return;

  const DragDrop = window.DragDropModule;
  const ContextMenu = window.ContextMenuModule;

  for (const node of nodes) {
    const item = document.createElement('div');
    item.className = 'tree-item';
    item.style.paddingLeft = `${depth * 16 + 8}px`;
    item.dataset.path = node.path;
    item.dataset.type = node.type;

    if (state.selectedPaths.includes(node.path)) {
      item.classList.add('selected');
    }
    if (state.cutPaths.has(node.path)) {
      item.classList.add('cut');
    }

    const icon = document.createElement('span');
    icon.className = 'tree-icon';
    if (node.type === 'directory') {
      const isExpanded = state.expandedPaths.has(node.path);
      icon.textContent = isExpanded ? '\uD83D\uDCC2' : '\uD83D\uDCC1';
      icon.classList.add('folder-icon');
    } else {
      icon.textContent = getFileIcon(node.extension);
    }
    item.appendChild(icon);

    const name = document.createElement('span');
    name.className = 'tree-name';
    name.textContent = node.displayName || node.name;
    if (node.description) {
      name.title = node.description;
    }
    item.appendChild(name);

    item.addEventListener('click', (e) => handleItemClick(e, node));

    item.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!state.selectedPaths.includes(node.path)) {
        state.selectedPaths = [node.path];
        state.lastSelectedPath = node.path;
        updateSelection();
      }
      if (ContextMenu && typeof ContextMenu.showContextMenu === 'function') {
        ContextMenu.showContextMenu(e.clientX, e.clientY, node.path, node.type);
      }
    });

    if (DragDrop && typeof DragDrop.setupDraggable === 'function') {
      DragDrop.setupDraggable(item, node.path, node.type);
    }

    parentEl.appendChild(item);

    if (node.type === 'directory' && state.expandedPaths.has(node.path)) {
      const children = [...(node.dirs || []), ...(node.files || [])];
      renderNodes(parentEl, children, depth + 1);
    }
  }
}

function handleItemClick(e, node) {
  e.stopPropagation();

  const Selection = window.SelectionModule;
  const Viewer = window.ViewerModule;
  const URLMod = window.URLModule;

  if (node.type === 'directory') {
    if (e.ctrlKey || e.metaKey || e.shiftKey) {
      if (Selection && typeof Selection.handleClick === 'function') {
        Selection.handleClick(node.path, node.type, e);
      }
    } else {
      toggleExpand(node.path);
      state.selectedPaths = [node.path];
      state.lastSelectedPath = node.path;
      updateSelection();
    }
  } else {
    if (Selection && typeof Selection.handleClick === 'function') {
      Selection.handleClick(node.path, node.type, e);
    } else {
      state.selectedPaths = [node.path];
      state.lastSelectedPath = node.path;
      updateSelection();
      if (Viewer && typeof Viewer.loadFile === 'function') Viewer.loadFile(node.path);
      if (URLMod && typeof URLMod.navigateTo === 'function') URLMod.navigateTo(node.path);
    }
  }
}

function toggleExpand(path) {
  if (state.expandedPaths.has(path)) {
    state.expandedPaths.delete(path);
  } else {
    state.expandedPaths.add(path);
  }
  renderTree();
}

function updateSelection() {
  document.querySelectorAll('.tree-item').forEach(item => {
    const isSelected = state.selectedPaths.includes(item.dataset.path);
    item.classList.toggle('selected', isSelected);
  });
}

export function activate() {
  if (typeof window !== 'undefined' && window.__viewTree && typeof window.__viewTree.deactivate === 'function') {
    try { window.__viewTree.deactivate(); } catch (e) { console.warn('viewTree.deactivate failed', e); }
  }
  container = document.getElementById('tree-menu');
  if (!container) {
    console.warn('tree.js activate: #tree-menu not found');
    return;
  }
  // Always re-render — view-mode tree DOM may still occupy #tree-menu even
  // after viewTree.deactivate(), and entering admin/edit mode must replace it
  // with the editable tree (folder emoji icons, drag handles, etc.).
  container.innerHTML = '';
  activated = true;
  loadTree();
}

export function deactivate() {
  if (!activated) return;
  if (container) {
    container.oncontextmenu = null;
    container.innerHTML = '';
  }
  state.selectedPaths = [];
  state.lastSelectedPath = null;
  state.fileTree = null;
  container = null;
  activated = false;
  if (typeof window !== 'undefined' && window.__viewTree && typeof window.__viewTree.activate === 'function') {
    try { window.__viewTree.activate(); } catch (e) { console.warn('viewTree.activate failed', e); }
  }
}

export async function refresh() {
  if (!activated) return;
  await loadTree();
}

export function getSelectedPath() {
  return state.lastSelectedPath || (state.selectedPaths.length > 0 ? state.selectedPaths[0] : null);
}
