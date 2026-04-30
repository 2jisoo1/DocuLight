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

// 가시 트리(확장된 폴더 포함)를 평탄화한 리스트. Shift 클릭 범위 선택의 인덱스 기준.
function _flattenVisibleTree() {
  if (!state.fileTree || !state.fileTree.root) return [];
  const out = [];
  const walk = (nodes) => {
    if (!Array.isArray(nodes)) return;
    for (const n of nodes) {
      out.push(n);
      if (n.type === 'directory' && state.expandedPaths.has(n.path)) {
        walk([...(n.dirs || []), ...(n.files || [])]);
      }
    }
  };
  walk([...(state.fileTree.root.dirs || []), ...(state.fileTree.root.files || [])]);
  return out;
}

function _selectRange(fromPath, toPath) {
  const flat = _flattenVisibleTree();
  const i1 = flat.findIndex((n) => n.path === fromPath);
  const i2 = flat.findIndex((n) => n.path === toPath);
  if (i1 === -1 || i2 === -1) {
    state.selectedPaths = [toPath];
    state.lastSelectedPath = toPath;
    return;
  }
  const [from, to] = i1 < i2 ? [i1, i2] : [i2, i1];
  state.selectedPaths = flat.slice(from, to + 1).map((n) => n.path);
}

function _toggleSelection(path) {
  const idx = state.selectedPaths.indexOf(path);
  if (idx === -1) {
    state.selectedPaths.push(path);
  } else {
    state.selectedPaths.splice(idx, 1);
  }
  state.lastSelectedPath = path;
}

function handleItemClick(e, node) {
  e.stopPropagation();

  const Viewer = (typeof window !== 'undefined') ? window.ViewerModule : null;
  const URLMod = (typeof window !== 'undefined') ? window.URLModule : null;

  // Shift 범위 선택. lastSelectedPath 가 없으면 (첫 클릭 등) 단일 선택으로 폴백.
  if (e.shiftKey) {
    if (state.lastSelectedPath) {
      // _selectRange 는 의도적으로 lastSelectedPath 를 갱신하지 않는다 —
      // 연속 Shift 클릭(A → Shift+B → Shift+C) 시 anchor(A) 가 보존되어
      // 표준 파일 탐색기(Finder/Explorer) 동작을 따른다.
      _selectRange(state.lastSelectedPath, node.path);
    } else {
      state.selectedPaths = [node.path];
      state.lastSelectedPath = node.path;
    }
    updateSelection();
    return;
  }

  // Ctrl/Cmd 토글 — 단일 항목 추가/제거.
  if (e.ctrlKey || e.metaKey) {
    _toggleSelection(node.path);
    updateSelection();
    return;
  }

  // 수식 키 없음 — 단일 선택.
  if (node.type === 'directory') {
    toggleExpand(node.path);
    state.selectedPaths = [node.path];
    state.lastSelectedPath = node.path;
    updateSelection();
  } else {
    state.selectedPaths = [node.path];
    state.lastSelectedPath = node.path;
    updateSelection();
    if (Viewer && typeof Viewer.loadFile === 'function') Viewer.loadFile(node.path);
    if (URLMod && typeof URLMod.navigateTo === 'function') URLMod.navigateTo(node.path);
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
  // admin tree 컨테이너로 스코프 한정 — 페이지 다른 위치의 .tree-item 우연 매칭 방지.
  const root = container || document;
  root.querySelectorAll('.tree-item').forEach((item) => {
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
  _exposeWindowModule();
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
  state.cutPaths = new Set();
  container = null;
  activated = false;
  if (typeof window !== 'undefined' && window.TreeModule) {
    delete window.TreeModule;
  }
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

// 다중 선택 시 모든 선택 경로 반환. 선택이 없으면 빈 배열.
export function getSelectedPaths() {
  return Array.isArray(state.selectedPaths) ? state.selectedPaths.slice() : [];
}

// clipboard.js 가 cut 표시를 토글하기 위해 호출. 빈 배열 또는 falsy 면 cut 표시 모두 제거.
export function setCutPaths(paths) {
  state.cutPaths = new Set(Array.isArray(paths) ? paths : []);
}

export { loadTree, renderTree };

// context-menu.js / file-modal.js 등 다른 ESM 모듈은 window.TreeModule 을 통해
// 트리 상태에 접근한다 (순환 import 회피). activate 시점에 명시적으로 노출하여
// import 만으로 글로벌이 오염되는 부수효과를 피한다.
function _exposeWindowModule() {
  if (typeof window === 'undefined') return;
  window.TreeModule = {
    activate,
    deactivate,
    refresh,
    loadTree,
    renderTree,
    getSelectedPath,
    getSelectedPaths,
    setCutPaths,
  };
}
