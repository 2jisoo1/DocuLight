// public/js/modules/editor.js
// 인라인 마크다운 편집기 모듈 (REQ-F-003, REQ-F-007, REQ-F-008, REQ-NF-005)
// admin.js EditorModule(1308-1625) 을 ESM 으로 이식.
// admin.ejs 고정 ID 의존을 동적 mount 로 변환 (#markdown-content 만 가정).
// window.alert/confirm/prompt 사용 금지 (CLAUDE.md §0).

import { confirmUnsaved } from './modal-ui.js';

const STYLE_ID = '__doclight-editor-style';
const MOUNT_ID = 'inline-editor';
const MARKDOWN_EXTS = ['.md', '.markdown'];

const STYLES = `
#${MOUNT_ID} {
  display: flex; flex-direction: column;
  width: 100%; height: 100%;
  background: #fff;
}
#${MOUNT_ID} .inline-editor-toolbar {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px; border-bottom: 1px solid #e5e5e5;
  background: #f9f9f9; font-family: system-ui, -apple-system, sans-serif;
  font-size: 13px;
}
#${MOUNT_ID} .inline-editor-path {
  flex: 1; color: #555; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
#${MOUNT_ID} .inline-editor-dirty {
  color: #c00; font-weight: bold; min-width: 12px;
}
#${MOUNT_ID} .inline-editor-btn {
  padding: 4px 12px; border: 1px solid #ccc; background: #fff;
  border-radius: 4px; cursor: pointer; font-size: 13px;
}
#${MOUNT_ID} .inline-editor-btn-primary {
  background: #2563eb; border-color: #2563eb; color: #fff;
}
#${MOUNT_ID} .inline-editor-btn:disabled {
  opacity: 0.5; cursor: not-allowed;
}
#${MOUNT_ID} .inline-editor-textarea {
  flex: 1; width: 100%; box-sizing: border-box;
  padding: 12px; border: none; outline: none; resize: none;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 14px; line-height: 1.5;
}
`;

const state = {
  isOpen: false,
  path: null,
  originalContent: '',
  modifiedAt: null,
  dirty: false,
};

let mountEl = null;
let textareaEl = null;
let dirtyEl = null;
let saveBtn = null;
let hiddenSiblings = []; // [{el, prevDisplay}]
let activated = false;

function _bp() {
  const fn = (typeof window !== 'undefined' && window._bp);
  return typeof fn === 'function' ? fn : (p) => p;
}

function _ensureStyle() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = STYLES;
  document.head.appendChild(el);
}

function _isMarkdown(path) {
  if (!path) return false;
  const lower = path.toLowerCase();
  return MARKDOWN_EXTS.some((ext) => lower.endsWith(ext));
}

function _showToast(message, kind) {
  if (typeof window !== 'undefined' && typeof window.showNotification === 'function') {
    try { window.showNotification(message, kind); return; } catch (_) {}
  }
  // 최소 fallback — 콘솔 출력 (CLAUDE.md §0: alert 금지)
  if (kind === 'error') console.error('[editor]', message);
  else console.log('[editor]', message);
}

function _updateDirtyIndicator() {
  if (dirtyEl) dirtyEl.textContent = state.dirty ? '\u25CF' : '';
  if (saveBtn) saveBtn.disabled = !state.dirty;
}

function _onInput() {
  if (!state.isOpen || !textareaEl) return;
  const next = textareaEl.value !== state.originalContent;
  if (next !== state.dirty) {
    state.dirty = next;
    _updateDirtyIndicator();
  }
}

function _hideSiblings(host) {
  hiddenSiblings = [];
  Array.from(host.children).forEach((child) => {
    if (child === mountEl) return;
    hiddenSiblings.push({ el: child, prevDisplay: child.style.display });
    child.style.display = 'none';
  });
}

function _restoreSiblings() {
  hiddenSiblings.forEach(({ el, prevDisplay }) => {
    el.style.display = prevDisplay || '';
  });
  hiddenSiblings = [];
}

function _mount() {
  _ensureStyle();
  const host = document.querySelector('#markdown-content');
  if (!host) return false;

  mountEl = document.createElement('div');
  mountEl.id = MOUNT_ID;

  const toolbar = document.createElement('div');
  toolbar.className = 'inline-editor-toolbar';

  const pathEl = document.createElement('span');
  pathEl.className = 'inline-editor-path';
  pathEl.textContent = state.path || '';

  dirtyEl = document.createElement('span');
  dirtyEl.className = 'inline-editor-dirty';

  saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'inline-editor-btn inline-editor-btn-primary';
  saveBtn.textContent = '저장';
  saveBtn.addEventListener('click', () => { save(); });

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'inline-editor-btn';
  cancelBtn.textContent = '닫기';
  cancelBtn.addEventListener('click', () => { _requestClose(); });

  toolbar.appendChild(pathEl);
  toolbar.appendChild(dirtyEl);
  toolbar.appendChild(saveBtn);
  toolbar.appendChild(cancelBtn);

  textareaEl = document.createElement('textarea');
  textareaEl.className = 'inline-editor-textarea';
  textareaEl.spellcheck = false;
  textareaEl.addEventListener('input', _onInput);

  mountEl.appendChild(toolbar);
  mountEl.appendChild(textareaEl);

  _hideSiblings(host);
  host.appendChild(mountEl);
  return true;
}

function _unmount() {
  if (textareaEl) textareaEl.removeEventListener('input', _onInput);
  if (mountEl && mountEl.parentNode) {
    mountEl.parentNode.removeChild(mountEl);
  }
  _restoreSiblings();
  mountEl = null;
  textareaEl = null;
  dirtyEl = null;
  saveBtn = null;
}

async function _requestClose() {
  if (state.dirty) {
    const action = await confirmUnsaved();
    if (action === 'cancel') return;
    if (action === 'save') {
      const ok = await save();
      if (!ok) return;
    }
  }
  _close();
}

function _close() {
  state.isOpen = false;
  state.path = null;
  state.originalContent = '';
  state.modifiedAt = null;
  state.dirty = false;
  _unmount();
}

export async function open(path) {
  if (!_isMarkdown(path)) {
    _showToast('마크다운 파일만 편집할 수 있습니다.', 'error');
    return;
  }

  if (state.isOpen && state.dirty) {
    const action = await confirmUnsaved();
    if (action === 'cancel') return;
    if (action === 'save') {
      const ok = await save();
      if (!ok) return;
    }
  }
  if (state.isOpen) _close();

  let result;
  try {
    const response = await fetch(_bp()(`/api/admin/content?path=${encodeURIComponent(path)}`), {
      credentials: 'include',
    });
    result = await response.json();
  } catch (e) {
    _showToast('연결 오류로 파일을 불러올 수 없습니다.', 'error');
    return;
  }

  if (!result || result.success === false) {
    _showToast((result && result.error && result.error.message) || '파일 로드 실패', 'error');
    return;
  }

  state.isOpen = true;
  state.path = path;
  state.originalContent = result.content || '';
  state.modifiedAt = result.modifiedAt || null;
  state.dirty = false;

  if (!_mount()) {
    _close();
    _showToast('편집 영역을 찾을 수 없습니다.', 'error');
    return;
  }

  textareaEl.value = state.originalContent;
  _updateDirtyIndicator();
  textareaEl.focus();
}

export function isUnsaved() {
  return state.isOpen && state.dirty;
}

export async function save() {
  if (!state.isOpen || !state.path || !textareaEl) return false;

  const content = textareaEl.value;
  const body = { path: state.path, content };
  if (state.modifiedAt) body.originalModifiedAt = state.modifiedAt;

  let result;
  try {
    const response = await fetch(_bp()('/api/admin/content'), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    });
    result = await response.json();
    if (!response.ok && (!result || result.success !== true)) {
      _showToast((result && result.error && result.error.message) || '저장 실패', 'error');
      return false;
    }
  } catch (e) {
    _showToast('연결 오류로 저장할 수 없습니다.', 'error');
    return false;
  }

  if (result && result.success === false) {
    _showToast((result.error && result.error.message) || '저장 실패', 'error');
    return false;
  }

  state.originalContent = content;
  if (result && result.modifiedAt) state.modifiedAt = result.modifiedAt;
  state.dirty = false;
  _updateDirtyIndicator();
  _showToast('저장되었습니다.', 'success');
  return true;
}

export function discard() {
  if (!state.isOpen) return;
  if (textareaEl) textareaEl.value = state.originalContent;
  state.dirty = false;
  _updateDirtyIndicator();
  _close();
}

export function activate() {
  if (typeof window === 'undefined') return;
  if (activated) return;
  activated = true;
  window.__doclightState = window.__doclightState || {};
  window.__doclightState.editor = { isUnsaved, save, discard };
}

export function deactivate() {
  if (!activated) return;
  activated = false;
  if (state.isOpen) _close();
  if (typeof window !== 'undefined' && window.__doclightState) {
    window.__doclightState.editor = {
      isUnsaved: () => false,
      save: async () => false,
      discard: () => {},
    };
  }
}
