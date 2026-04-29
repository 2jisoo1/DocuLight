// public/js/modules/context-menu.js
// 편집/어드민 모드 트리 우클릭 컨텍스트 메뉴 (REQ-F-006, REQ-NF-005)
// admin.js:901-1037 ContextMenuModule 을 ESM 으로 이식.
// 삭제 confirm 은 modal-ui.js 의 showConfirm 사용 (browser confirm 금지, CLAUDE.md §0).

import { showConfirm } from './modal-ui.js';

const EDITABLE_EXTENSIONS = ['.md', '.txt', '.json', '.json5', '.yaml', '.yml', '.html', '.css', '.js'];

const state = {
  menuElement: null,
  permissions: [],
};

let activated = false;

function _bp() {
  const fn = (typeof window !== 'undefined' && window._bp);
  return typeof fn === 'function' ? fn : (p) => p;
}

async function _fetchPermissions() {
  try {
    const res = await fetch(_bp()('/api/auth/session'), { credentials: 'include' });
    if (res.status !== 200) {
      state.permissions = [];
      return;
    }
    const body = await res.json().catch(() => ({}));
    state.permissions = (body && body.session && Array.isArray(body.session.permissions))
      ? body.session.permissions
      : [];
  } catch (e) {
    console.warn('context-menu.js: session fetch failed', e);
    state.permissions = [];
  }
}

function _isEditable(path) {
  if (!path) return false;
  const lower = path.toLowerCase();
  return EDITABLE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function _getClipboard() {
  const cb = (typeof window !== 'undefined') ? window.ClipboardModule : null;
  if (cb && cb.state && cb.state.clipboard != null) return cb.state.clipboard;
  if (cb && cb.clipboard != null) return cb.clipboard;
  return null;
}

function _buildMenuItems(targetPath, targetType) {
  const hasWrite = state.permissions.includes('write');
  const hasDelete = state.permissions.includes('write') || state.permissions.includes('superuser');
  const hasClipboard = _getClipboard() !== null;

  if (targetType === 'root') {
    return [
      { icon: '\uD83D\uDCC4', label: 'New File', action: 'newFile', disabled: !hasWrite },
      { icon: '\uD83D\uDCC1', label: 'New Folder', action: 'newFolder', disabled: !hasWrite },
      { separator: true },
      { icon: '\uD83D\uDCCB', label: 'Paste', action: 'paste', disabled: !hasWrite || !hasClipboard },
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
      { icon: '\uD83D\uDDD1\uFE0F', label: 'Delete', action: 'delete', disabled: !hasDelete },
    ];
  }

  const isEditable = _isEditable(targetPath);
  return [
    { icon: '\u270F\uFE0F', label: 'Edit', action: 'edit', disabled: !isEditable || !hasWrite },
    { icon: '\uD83D\uDCDD', label: 'Rename', action: 'rename', disabled: !hasWrite },
    { separator: true },
    { icon: '\u2702\uFE0F', label: 'Cut', action: 'cut', disabled: !hasWrite },
    { icon: '\uD83D\uDCCB', label: 'Copy', action: 'copy' },
    { separator: true },
    { icon: '\uD83D\uDDD1\uFE0F', label: 'Delete', action: 'delete', disabled: !hasDelete },
  ];
}

function _getSelectedPaths(targetPath) {
  const Tree = (typeof window !== 'undefined') ? window.TreeModule : null;
  if (Tree && typeof Tree.getSelectedPaths === 'function') {
    const paths = Tree.getSelectedPaths();
    if (Array.isArray(paths) && paths.length > 0) return paths;
  }
  return [targetPath];
}

async function _handleMenuAction(action, targetPath, targetType) {
  const selectedPaths = _getSelectedPaths(targetPath);

  switch (action) {
    case 'edit': {
      try {
        const editor = await import('./editor.js');
        if (editor && typeof editor.open === 'function') {
          await editor.open(targetPath);
        }
      } catch (e) {
        console.warn('context-menu.js: editor.open failed', e);
      }
      break;
    }
    case 'delete': {
      const body = selectedPaths.length === 1
        ? `다음 항목을 삭제하시겠습니까?\n${selectedPaths[0]}`
        : `다음 ${selectedPaths.length}개 항목을 삭제하시겠습니까?\n${selectedPaths.join('\n')}`;
      const result = await showConfirm({
        title: '삭제 확인',
        body,
        primary: '삭제',
        cancel: '취소',
      });
      if (result === 'primary') {
        const Modal = (typeof window !== 'undefined') ? window.ModalModule : null;
        if (Modal && typeof Modal.performDelete === 'function') {
          await Modal.performDelete(selectedPaths);
        }
      }
      break;
    }
    case 'rename': {
      const Modal = (typeof window !== 'undefined') ? window.ModalModule : null;
      if (Modal && typeof Modal.showRenameModal === 'function') {
        Modal.showRenameModal(targetPath);
      }
      break;
    }
    case 'newFile': {
      const Modal = (typeof window !== 'undefined') ? window.ModalModule : null;
      if (Modal && typeof Modal.showCreateModal === 'function') {
        Modal.showCreateModal(targetPath, 'file');
      }
      break;
    }
    case 'newFolder': {
      const Modal = (typeof window !== 'undefined') ? window.ModalModule : null;
      if (Modal && typeof Modal.showCreateModal === 'function') {
        Modal.showCreateModal(targetPath, 'directory');
      }
      break;
    }
    case 'cut': {
      const Cb = (typeof window !== 'undefined') ? window.ClipboardModule : null;
      if (Cb && typeof Cb.cut === 'function') Cb.cut(selectedPaths);
      break;
    }
    case 'copy': {
      const Cb = (typeof window !== 'undefined') ? window.ClipboardModule : null;
      if (Cb && typeof Cb.copy === 'function') Cb.copy(selectedPaths);
      break;
    }
    case 'paste': {
      const Cb = (typeof window !== 'undefined') ? window.ClipboardModule : null;
      if (Cb && typeof Cb.paste === 'function') Cb.paste(targetPath);
      break;
    }
  }
}

function showContextMenu(x, y, targetPath, targetType) {
  hideContextMenu();

  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;

  const items = _buildMenuItems(targetPath, targetType);
  for (const item of items) {
    if (item.separator) {
      const sep = document.createElement('div');
      sep.className = 'context-menu-separator';
      menu.appendChild(sep);
      continue;
    }
    const menuItem = document.createElement('div');
    menuItem.className = 'context-menu-item';
    if (item.disabled) menuItem.classList.add('disabled');
    const iconSpan = document.createElement('span');
    iconSpan.className = 'menu-icon';
    iconSpan.textContent = item.icon;
    menuItem.appendChild(iconSpan);
    menuItem.appendChild(document.createTextNode(item.label));
    menuItem.addEventListener('click', (e) => {
      e.stopPropagation();
      const wasDisabled = item.disabled;
      hideContextMenu();
      if (!wasDisabled) {
        _handleMenuAction(item.action, targetPath, targetType);
      }
    });
    menu.appendChild(menuItem);
  }

  document.body.appendChild(menu);
  state.menuElement = menu;

  requestAnimationFrame(() => {
    if (!state.menuElement) return;
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      menu.style.left = `${window.innerWidth - rect.width - 8}px`;
    }
    if (rect.bottom > window.innerHeight) {
      menu.style.top = `${window.innerHeight - rect.height - 8}px`;
    }
  });
}

function hideContextMenu() {
  if (state.menuElement) {
    state.menuElement.remove();
    state.menuElement = null;
  }
}

function _onDocumentClick(e) {
  if (!state.menuElement) return;
  if (state.menuElement.contains(e.target)) return;
  hideContextMenu();
}

function _onKeyDown(e) {
  if (e.key === 'Escape') hideContextMenu();
}

export function activate() {
  if (activated) return;
  activated = true;
  if (typeof window !== 'undefined') {
    window.ContextMenuModule = { showContextMenu, hideContextMenu };
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('click', _onDocumentClick, true);
    document.addEventListener('keydown', _onKeyDown, true);
  }
  _fetchPermissions();
}

export function deactivate() {
  if (!activated) return;
  activated = false;
  hideContextMenu();
  if (typeof document !== 'undefined') {
    document.removeEventListener('click', _onDocumentClick, true);
    document.removeEventListener('keydown', _onKeyDown, true);
  }
  if (typeof window !== 'undefined' && window.ContextMenuModule) {
    delete window.ContextMenuModule;
  }
  state.permissions = [];
}
