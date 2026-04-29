// public/js/modules/mode.js
// 모드 토글 + 권한 캐싱 + URL 동기화 (REQ-F-002/003/004/009/010, NF-002/005)
// State Contract: §3-A.3 — window.__doclightState.editor.{isUnsaved,save,discard}

import { confirmUnsaved, showConfirm } from './modal-ui.js';

let currentMode = 'view';
let permissions = [];
const subscribers = new Set();

const VALID_MODES = ['view', 'edit', 'admin'];

function _basePath() {
  // <base> 태그 또는 window.basePath 우선, 없으면 ''
  if (typeof window !== 'undefined' && typeof window.basePath === 'string') return window.basePath;
  return '';
}

function _canEnter(mode) {
  if (mode === 'admin') return permissions.includes('superuser');
  if (mode === 'edit') return permissions.includes('superuser') || permissions.includes('write');
  return true;
}

function _readUrlMode() {
  try {
    const v = new URLSearchParams(location.search).get('mode');
    return VALID_MODES.includes(v) ? v : null;
  } catch {
    return null;
  }
}

function _writeUrlMode(mode) {
  try {
    const url = new URL(location.href);
    if (mode === 'view' || !mode) {
      url.searchParams.delete('mode');
    } else {
      url.searchParams.set('mode', mode);
    }
    history.replaceState(null, '', url);
  } catch (e) {
    console.warn('mode.js: URL update failed', e);
  }
}

function _applyBodyClasses(mode) {
  const b = document.body;
  if (!b) return;
  b.classList.toggle('mode-edit', mode === 'edit' || mode === 'admin');
  b.classList.toggle('mode-admin', mode === 'admin');
}

function _updateToggleVisibility() {
  const editBtn = document.getElementById('mode-edit-toggle');
  const adminBtn = document.getElementById('mode-admin-toggle');
  const mgmtBtn = document.getElementById('mgmt-open-btn');

  const isSuperuser = permissions.includes('superuser');
  const isWriter = permissions.includes('write') || isSuperuser;

  if (editBtn) {
    // superuser는 admin 토글만 노출 (편집 모드는 admin에 포함)
    editBtn.style.display = (isWriter && !isSuperuser) ? '' : 'none';
  }
  if (adminBtn) {
    adminBtn.style.display = isSuperuser ? '' : 'none';
  }
  if (mgmtBtn) {
    // mgmt-open-btn은 admin 모드에서만 표시
    mgmtBtn.style.display = (isSuperuser && currentMode === 'admin') ? '' : 'none';
  }
}

function _updatePressedState() {
  const editBtn = document.getElementById('mode-edit-toggle');
  const adminBtn = document.getElementById('mode-admin-toggle');
  if (editBtn) editBtn.setAttribute('aria-pressed', String(currentMode === 'edit'));
  if (adminBtn) adminBtn.setAttribute('aria-pressed', String(currentMode === 'admin'));
}

function _bindToggleHandlers() {
  const editBtn = document.getElementById('mode-edit-toggle');
  const adminBtn = document.getElementById('mode-admin-toggle');
  if (editBtn && !editBtn._modeBound) {
    editBtn._modeBound = true;
    editBtn.addEventListener('click', () => {
      setMode(currentMode === 'edit' ? 'view' : 'edit');
    });
  }
  if (adminBtn && !adminBtn._modeBound) {
    adminBtn._modeBound = true;
    adminBtn.addEventListener('click', () => {
      setMode(currentMode === 'admin' ? 'view' : 'admin');
    });
  }
}

async function _fetchSession() {
  try {
    const res = await fetch(_basePath() + '/api/auth/session', { credentials: 'include' });
    if (res.status !== 200) {
      permissions = [];
      return;
    }
    const body = await res.json().catch(() => ({}));
    permissions = (body && body.session && Array.isArray(body.session.permissions))
      ? body.session.permissions
      : [];
  } catch (e) {
    console.warn('mode.js: session fetch failed', e);
    permissions = [];
  }
}

function _notify() {
  for (const h of subscribers) {
    try {
      const r = h(currentMode);
      if (r && typeof r.then === 'function') r.catch((e) => console.error('onModeChange handler error', e));
    } catch (e) {
      console.error('onModeChange handler error', e);
    }
  }
}

export async function initMode() {
  await _fetchSession();

  const requested = _readUrlMode();
  let initial = 'view';
  if (requested && _canEnter(requested)) {
    initial = requested;
  }
  currentMode = initial;

  _applyBodyClasses(currentMode);
  _writeUrlMode(currentMode);
  _bindToggleHandlers();
  _updateToggleVisibility();
  _updatePressedState();
  _notify();
}

export function getCurrentMode() {
  return currentMode;
}

export async function setMode(next, opts) {
  opts = opts || {};
  if (!VALID_MODES.includes(next)) return false;
  if (next === currentMode && !opts.force) return true;

  // 권한 검증
  if (!_canEnter(next)) {
    if (opts.reason === 'auth-revoked') {
      try {
        await showConfirm({
          title: '권한이 변경되었습니다',
          body: '현재 모드를 사용할 수 없어 보기 모드로 전환합니다.',
          primary: '확인',
        });
      } catch (e) { /* noop */ }
      next = 'view';
    } else {
      return false;
    }
  }

  // 미저장 hook (§3-A.3.3)
  const state = (typeof window !== 'undefined' && window.__doclightState) || null;
  const editor = state && state.editor;
  let dirty = false;
  try { dirty = !!(editor && editor.isUnsaved && editor.isUnsaved()); } catch { dirty = false; }

  if (dirty) {
    let result = 'cancel';
    try { result = await confirmUnsaved(); } catch { result = 'cancel'; }

    if (result === 'save') {
      let ok = false;
      try { ok = await editor.save(); } catch (e) { ok = false; }
      if (!ok && !opts.force) return false;
    } else if (result === 'discard') {
      try { editor.discard(); } catch { /* noop */ }
    } else {
      // 'cancel'
      if (opts.force) {
        try { editor.discard(); } catch { /* noop */ }
      } else {
        return false;
      }
    }
  }

  currentMode = next;
  _applyBodyClasses(currentMode);
  _writeUrlMode(currentMode);
  _updateToggleVisibility();
  _updatePressedState();
  _notify();
  return true;
}

export function onModeChange(handler) {
  if (typeof handler !== 'function') return () => {};
  subscribers.add(handler);
  return () => subscribers.delete(handler);
}

export function isMobileNoDnd() {
  try {
    return window.matchMedia('(max-width: 768px) and (pointer: coarse)').matches;
  } catch {
    return false;
  }
}
