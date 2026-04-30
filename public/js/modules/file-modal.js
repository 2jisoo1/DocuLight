// public/js/modules/file-modal.js
// 파일/폴더 생성·이름변경·삭제 모달. legacy admin.js ModalModule(line 1042-1232) 의 ESM 이식.
// 컨텍스트 메뉴(Delete / New File / New Folder / Rename)에서 호출되는 핵심 admin write API 진입점.
// modal-ui.js 와 동일한 doclight-modal-* 스타일을 재사용하면서 입력 필드를 추가한다.
// CLAUDE.md §0 — browser native dialog 금지.

import { ensureModalStyle } from './modal-ui.js';

const PROMPT_STYLE_ID = '__doclight-file-modal-style';
const PROMPT_STYLES = `
.doclight-modal-input {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 10px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 14px;
  font-family: system-ui, -apple-system, sans-serif;
}
.doclight-modal-input:focus {
  outline: none;
  border-color: #2563eb;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.2);
}
.doclight-modal-error {
  color: #dc2626;
  font-size: 13px;
  margin-top: 8px;
  min-height: 18px;
}
.doclight-modal-list {
  max-height: 200px;
  overflow-y: auto;
  margin: 8px 0 0;
  padding: 8px 12px;
  background: #f9fafb;
  border-radius: 4px;
  font-size: 13px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.doclight-modal-list li {
  list-style: none;
  padding: 2px 0;
  word-break: break-all;
}
`;

const INVALID_NAME_RE = /[<>:"/\\|?*]/;

// 단일 prompt 인스턴스 가드. 모달 중첩 방지 — 새 호출이 들어오면 기존 prompt 를 cancel 하고 새로 연다.
let _activePrompt = null;

function _bp(p) {
  const fn = (typeof window !== 'undefined' && window.DocLightUtils && window.DocLightUtils.prefixPath);
  return typeof fn === 'function' ? fn(p) : p;
}

function _ensurePromptStyle() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(PROMPT_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = PROMPT_STYLE_ID;
  style.textContent = PROMPT_STYLES;
  document.head.appendChild(style);
}

function _refreshTree() {
  const Tree = (typeof window !== 'undefined') ? window.TreeModule : null;
  if (Tree && typeof Tree.refresh === 'function') {
    return Tree.refresh();
  }
  if (Tree && typeof Tree.loadTree === 'function') {
    return Tree.loadTree();
  }
  return Promise.resolve();
}

// Promise<string | null> — 사용자가 취소하면 null
function _showPrompt({ title, defaultValue, primary, selectRange }) {
  // 이미 열려 있는 prompt 가 있으면 강제 cancel 후 새로 연다 (중첩 방지).
  if (_activePrompt && typeof _activePrompt.cancel === 'function') {
    try { _activePrompt.cancel(); } catch (_) { /* noop */ }
  }
  return new Promise((resolve) => {
    ensureModalStyle();
    _ensurePromptStyle();

    const overlay = document.createElement('div');
    overlay.className = 'doclight-modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    const dialog = document.createElement('div');
    dialog.className = 'doclight-modal-dialog';

    const titleEl = document.createElement('div');
    titleEl.className = 'doclight-modal-title';
    titleEl.textContent = title;

    const bodyEl = document.createElement('div');
    bodyEl.className = 'doclight-modal-body';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'doclight-modal-input';
    input.value = defaultValue || '';

    const errorEl = document.createElement('div');
    errorEl.className = 'doclight-modal-error';

    bodyEl.appendChild(input);
    bodyEl.appendChild(errorEl);

    const actions = document.createElement('div');
    actions.className = 'doclight-modal-actions';

    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      document.removeEventListener('keydown', onKey, true);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      if (_activePrompt && _activePrompt.overlay === overlay) {
        _activePrompt = null;
      }
      resolve(value);
    };
    _activePrompt = { overlay, cancel: () => finish(null), focus: () => { try { input.focus(); } catch (_) {} } };

    const submit = () => {
      const name = input.value.trim();
      if (!name) {
        errorEl.textContent = '이름을 입력해 주세요';
        input.focus();
        return;
      }
      if (INVALID_NAME_RE.test(name)) {
        errorEl.textContent = '이름에 < > : " / \\ | ? * 는 사용할 수 없습니다';
        input.focus();
        return;
      }
      finish(name);
    };

    const onKey = (e) => {
      // 다른 모달/단축키 핸들러와의 격돌 방지 — 모달이 떠 있는 동안 Escape/Enter 는 모달이 우선 소비.
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        finish(null);
      } else if (e.key === 'Enter' && !e.isComposing && document.activeElement === input) {
        // IME 조합 중 Enter 는 조합 확정 용도이므로 무시 (한글 입력 환경).
        e.preventDefault();
        e.stopPropagation();
        submit();
      }
    };

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'doclight-modal-btn';
    cancelBtn.textContent = '취소';
    cancelBtn.addEventListener('click', () => finish(null));

    const primaryBtn = document.createElement('button');
    primaryBtn.type = 'button';
    primaryBtn.className = 'doclight-modal-btn doclight-modal-btn-primary';
    primaryBtn.textContent = primary || '확인';
    primaryBtn.addEventListener('click', submit);

    actions.appendChild(cancelBtn);
    actions.appendChild(primaryBtn);

    dialog.appendChild(titleEl);
    dialog.appendChild(bodyEl);
    dialog.appendChild(actions);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    document.addEventListener('keydown', onKey, true);

    setTimeout(() => {
      input.focus();
      if (selectRange && Array.isArray(selectRange) && selectRange.length === 2) {
        try { input.setSelectionRange(selectRange[0], selectRange[1]); } catch (_) { input.select(); }
      } else {
        input.select();
      }
    }, 0);
  });
}

function _notify(message, type) {
  const Cb = (typeof window !== 'undefined') ? window.ClipboardModule : null;
  if (Cb && typeof Cb.showNotification === 'function') {
    Cb.showNotification(message, type || 'info');
    return;
  }
  // clipboard 모듈 미로드 시 콘솔 폴백 — 사용자에게 보이지는 않지만 silent fail 보다 낫다.
  // eslint-disable-next-line no-console
  console[(type === 'error') ? 'error' : 'log']('[file-modal]', message);
}

// parentPath 정규화: 빈 값/undefined → '/', 끝 슬래시 제거. 경로 조합 방어.
function _joinPath(parentPath, name) {
  let base = (parentPath == null || parentPath === '') ? '/' : String(parentPath);
  base = base.replace(/\/+$/, '');
  if (base === '') base = '/';
  return base === '/' ? '/' + name : base + '/' + name;
}

// fetch 후 응답 파싱: !res.ok 면 status 를 포함한 통일된 에러 메시지로 throw.
async function _parseJson(res, opName) {
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.text()).slice(0, 200); } catch (_) { /* noop */ }
    const status = res.status;
    if (status === 401) throw new Error(`${opName} 실패: 인증이 만료되었습니다 (401). 다시 로그인해 주세요.`);
    if (status === 403) throw new Error(`${opName} 실패: 권한이 없습니다 (403).`);
    throw new Error(`${opName} 실패: HTTP ${status}${detail ? ' — ' + detail : ''}`);
  }
  try {
    return await res.json();
  } catch (_) {
    throw new Error(`${opName} 실패: 응답 파싱 오류 (HTTP ${res.status})`);
  }
}

async function _apiCreate(parentPath, name, type) {
  const fullPath = _joinPath(parentPath, name);
  const res = await fetch(_bp('/api/admin/create'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ path: fullPath, type }),
  });
  return _parseJson(res, '생성');
}

async function _apiRename(oldPath, newName) {
  const res = await fetch(_bp('/api/admin/rename'), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ oldPath, newName }),
  });
  return _parseJson(res, '이름 변경');
}

async function _apiDelete(paths) {
  const res = await fetch(_bp('/api/admin/entry'), {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ paths }),
  });
  return _parseJson(res, '삭제');
}

export { _joinPath };

/**
 * 파일 또는 폴더 생성 모달.
 * @param {string} parentPath — 부모 디렉토리 경로 ('/', '/foo' 등). trailing slash 있어도 정규화됨.
 * @param {'file' | 'directory'} type — 생성할 항목 종류. 'file' 외 값은 모두 directory 로 처리됨.
 */
export async function showCreateModal(parentPath, type) {
  const isFile = type === 'file';
  const defaultValue = isFile ? 'new-file.md' : 'new-folder';
  const dotIdx = defaultValue.lastIndexOf('.');
  const selectRange = (isFile && dotIdx > 0) ? [0, dotIdx] : null;

  const name = await _showPrompt({
    title: isFile ? '새 파일' : '새 폴더',
    defaultValue,
    primary: '생성',
    selectRange,
  });
  if (!name) return;

  try {
    const result = await _apiCreate(parentPath, name, isFile ? 'file' : 'directory');
    if (result && result.success) {
      await _refreshTree();
      _notify(`${isFile ? '파일' : '폴더'} 생성됨: ${name}`, 'info');
    } else {
      const msg = (result && result.error && result.error.message) || '생성 실패';
      _notify(msg, 'error');
    }
  } catch (e) {
    _notify((e && e.message) ? e.message : ('요청 실패: ' + e), 'error');
  }
}

export async function showRenameModal(path) {
  if (!path || path === '/' || path === '') {
    _notify('루트는 이름을 변경할 수 없습니다', 'error');
    return;
  }
  const currentName = String(path).split('/').filter((s) => s !== '').pop() || '';
  if (!currentName) {
    _notify('이름을 추출할 수 없는 경로입니다: ' + path, 'error');
    return;
  }
  const dotIdx = currentName.lastIndexOf('.');
  const selectRange = (dotIdx > 0) ? [0, dotIdx] : null;

  const newName = await _showPrompt({
    title: '이름 변경',
    defaultValue: currentName,
    primary: '변경',
    selectRange,
  });
  if (!newName || newName === currentName) return;

  try {
    const result = await _apiRename(path, newName);
    if (result && result.success) {
      await _refreshTree();
      _notify(`이름 변경됨: ${currentName} → ${newName}`, 'info');
    } else {
      const msg = (result && result.error && result.error.message) || '이름 변경 실패';
      _notify(msg, 'error');
    }
  } catch (e) {
    _notify((e && e.message) ? e.message : ('요청 실패: ' + e), 'error');
  }
}

// 삭제 실패 항목을 사용자가 이해할 수 있는 형태로 포맷.
// 백엔드 (admin-file-controller deleteEntry) 는 부분 실패 시 errors: [{ path, error }] 를 반환한다.
function _formatErrors(errs) {
  if (!Array.isArray(errs) || errs.length === 0) return '';
  return errs.map((x) => {
    if (!x) return '';
    if (typeof x === 'string') return x;
    const path = x.path || '(unknown)';
    let reason = x.error || x.message || '';
    if (reason && typeof reason !== 'string') {
      try { reason = JSON.stringify(reason); } catch (_) { reason = String(reason); }
    }
    return reason ? `${path}: ${reason}` : path;
  }).filter(Boolean).join('\n');
}

// context-menu.js 가 이미 showConfirm 으로 사용자 확인을 받았다는 가정 하에 즉시 삭제 실행.
export async function performDelete(paths) {
  if (!Array.isArray(paths) || paths.length === 0) return;
  try {
    const result = await _apiDelete(paths);
    if (result && result.success) {
      await _refreshTree();
      _notify(`${paths.length}개 항목 삭제됨`, 'info');
    } else {
      const errs = (result && Array.isArray(result.errors)) ? result.errors : null;
      // 부분 실패라도 트리는 갱신해야 deleted 항목이 사라진다.
      await _refreshTree();
      const msg = errs && errs.length > 0
        ? `일부 삭제 실패:\n${_formatErrors(errs)}`
        : ((result && result.error && result.error.message) || '삭제 실패');
      _notify(msg, 'error');
    }
  } catch (e) {
    _notify((e && e.message) ? e.message : ('삭제 실패: ' + e), 'error');
  }
}

let _activated = false;

export function activate() {
  if (_activated) return;
  _activated = true;
  if (typeof window === 'undefined') return;
  // context-menu.js 가 window.ModalModule.showCreateModal 등을 참조한다.
  window.ModalModule = Object.assign(window.ModalModule || {}, {
    showCreateModal,
    showRenameModal,
    performDelete,
  });
}

export function deactivate() {
  _activated = false;
  // 모드 전환 중 사용자가 prompt 를 띄워둔 상태였다면 좀비 overlay 제거.
  if (_activePrompt && typeof _activePrompt.cancel === 'function') {
    try { _activePrompt.cancel(); } catch (_) { /* noop */ }
  }
  if (typeof window !== 'undefined' && window.ModalModule) {
    delete window.ModalModule.showCreateModal;
    delete window.ModalModule.showRenameModal;
    delete window.ModalModule.performDelete;
  }
}
