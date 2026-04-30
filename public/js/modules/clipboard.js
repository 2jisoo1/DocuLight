// public/js/modules/clipboard.js
// 트리 클립보드 + 토스트 알림. legacy admin.js ClipboardModule(line 1233-1306) 의 ESM 이식.
// cut/copy/paste 는 admin write API (/api/admin/move, /api/admin/copy) 를 사용한다.
// showNotification 은 textContent 만 사용하여 사용자 입력(파일명 등) XSS 방지.

const NOTIFY_STYLE_ID = '__doclight-clipboard-style';
const NOTIFY_STYLES = `
.doclight-toast {
  position: fixed;
  right: 20px;
  bottom: 24px;
  min-width: 220px;
  max-width: 360px;
  padding: 10px 14px;
  border-radius: 4px;
  font-size: 13px;
  line-height: 1.4;
  color: #fff;
  background: #2563eb;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
  white-space: pre-wrap;
  word-break: break-word;
  z-index: 10001;
  opacity: 1;
  transition: opacity 0.25s ease;
  font-family: system-ui, -apple-system, sans-serif;
}
.doclight-toast.error { background: #dc2626; }
.doclight-toast.info { background: #2563eb; }
.doclight-toast.success { background: #16a34a; }
.doclight-toast.fade-out { opacity: 0; }
`;

// 모듈 스코프 상태. clipboard 는 단일 인스턴스.
const state = {
  operation: null,    // 'cut' | 'copy' | null
  paths: [],          // 마지막으로 cut/copy 한 경로들
};

let _activated = false;
// paste in-flight 가드: 빠른 연속 호출 / 더블클릭 시 중복 fetch 발사 방지.
let _pasteInflight = false;

function _bp(p) {
  const fn = (typeof window !== 'undefined' && window.DocLightUtils && window.DocLightUtils.prefixPath);
  return typeof fn === 'function' ? fn(p) : p;
}

function _ensureNotifyStyle() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(NOTIFY_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = NOTIFY_STYLE_ID;
  style.textContent = NOTIFY_STYLES;
  document.head.appendChild(style);
}

function _getTree() {
  return (typeof window !== 'undefined') ? window.TreeModule : null;
}

function _refreshTree() {
  const Tree = _getTree();
  if (Tree && typeof Tree.refresh === 'function') return Tree.refresh();
  if (Tree && typeof Tree.loadTree === 'function') return Tree.loadTree();
  return Promise.resolve();
}

function _renderTree() {
  // cut/copy 시 즉시 시각 표시 갱신 (백엔드 호출 없이 trees 의 cut 클래스만 토글).
  const Tree = _getTree();
  if (Tree && typeof Tree.renderTree === 'function') {
    try { Tree.renderTree(); } catch (_) { /* tree 가 아직 로드 안된 상태일 수 있음 */ }
  }
}

function _setCutMarkers(paths) {
  const Tree = _getTree();
  if (Tree && typeof Tree.setCutPaths === 'function') {
    Tree.setCutPaths(paths);
  }
}

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

async function _apiMove(sourcePaths, targetDirectory) {
  const res = await fetch(_bp('/api/admin/move'), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ sourcePaths, targetDirectory }),
  });
  return _parseJson(res, '이동');
}

async function _apiCopy(sourcePaths, targetDirectory) {
  const res = await fetch(_bp('/api/admin/copy'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ sourcePaths, targetDirectory }),
  });
  return _parseJson(res, '복사');
}

/**
 * 토스트 알림 생성. textContent 만 사용하므로 사용자 입력 XSS 안전.
 * @param {string} message
 * @param {'info' | 'error' | 'success'} [type]
 */
export function showNotification(message, type) {
  if (typeof document === 'undefined') return;
  _ensureNotifyStyle();
  const t = (type === 'error' || type === 'success' || type === 'info') ? type : 'info';
  const el = document.createElement('div');
  // 화이트리스트 검증된 t 만 클래스로 추가 — innerHTML/template 우회 방지.
  el.classList.add('doclight-toast', t);
  // textContent 강제 — message 가 HTML/스크립트라도 그대로 텍스트로 표기.
  el.textContent = String(message == null ? '' : message);
  document.body.appendChild(el);

  // 2초 후 fade-out, 0.3초 후 제거.
  setTimeout(() => {
    el.classList.add('fade-out');
    setTimeout(() => {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 300);
  }, 2000);
}

export function cut(paths) {
  if (!Array.isArray(paths) || paths.length === 0) return;
  state.operation = 'cut';
  state.paths = paths.slice();
  _setCutMarkers(paths);
  _renderTree();
  showNotification(`${paths.length}개 항목 잘라내기`, 'info');
}

export function copy(paths) {
  if (!Array.isArray(paths) || paths.length === 0) return;
  state.operation = 'copy';
  state.paths = paths.slice();
  _setCutMarkers([]); // copy 는 cut 표시 제거.
  _renderTree();
  showNotification(`${paths.length}개 항목 복사`, 'info');
}

// 백엔드 응답에서 사람이 읽을 에러 메시지 추출.
// 우선순위: result.errors[0].error/message > result.error.message > 폴백.
function _firstErrorMessage(result, fallback) {
  if (!result) return fallback;
  if (Array.isArray(result.errors) && result.errors.length > 0) {
    const e0 = result.errors[0];
    if (e0) {
      if (typeof e0 === 'string') return e0;
      const r = e0.error || e0.message;
      if (r) return (typeof r === 'string') ? r : JSON.stringify(r);
    }
  }
  if (result.error && result.error.message) return result.error.message;
  return fallback;
}

export async function paste(targetDir) {
  if (!state.operation || state.paths.length === 0) {
    showNotification('붙여넣을 항목이 없습니다', 'error');
    return;
  }
  if (_pasteInflight) {
    // 중복 발사 차단. 사용자에게 silent — 바로 직전 클릭이 처리 중.
    return;
  }
  // op/paths 를 지역 변수로 캡처: paste 진행 중 사용자가 새 cut/copy 를 호출해도
  // 캡처된 값으로 작업하고 state 정리 시 동일 참조 검증 후에만 비운다.
  const op = state.operation;
  const paths = state.paths.slice();
  const target = (targetDir == null || String(targetDir).trim() === '') ? '/' : targetDir;

  _pasteInflight = true;
  try {
    if (op === 'cut') {
      let result;
      try {
        result = await _apiMove(paths, target);
      } catch (e) {
        showNotification((e && e.message) ? e.message : ('이동 실패: ' + e), 'error');
        return;
      }
      const movedCount = Array.isArray(result && result.moved) ? result.moved.length : 0;
      const fullSuccess = !!(result && result.success);

      // 부분 성공 또는 완전 성공이면 트리 갱신해야 이미 옮겨진 항목이 새 위치에 표시된다.
      if (fullSuccess || movedCount > 0) {
        await _refreshTree();
      }

      if (fullSuccess) {
        // 성공 후 동일 작업이 여전히 활성 상태일 때만 state 비움 (race 방어).
        if (state.operation === op && state.paths.length === paths.length
            && state.paths.every((p, i) => p === paths[i])) {
          state.operation = null;
          state.paths = [];
          _setCutMarkers([]);
        }
        showNotification(`${paths.length}개 항목 이동`, 'success');
      } else {
        const msg = _firstErrorMessage(result, '이동 실패');
        if (movedCount > 0) {
          showNotification(`일부만 이동됨 (${movedCount}/${paths.length}): ${msg}`, 'error');
        } else {
          showNotification(msg, 'error');
        }
      }
    } else if (op === 'copy') {
      let result;
      try {
        result = await _apiCopy(paths, target);
      } catch (e) {
        showNotification((e && e.message) ? e.message : ('복사 실패: ' + e), 'error');
        return;
      }
      const copiedArr = Array.isArray(result && result.copied) ? result.copied : null;
      const copiedCount = copiedArr ? copiedArr.length : (result && result.success ? paths.length : 0);
      const fullSuccess = !!(result && result.success && copiedCount === paths.length);

      if (copiedCount > 0) {
        await _refreshTree();
      }

      if (fullSuccess) {
        // copy 는 clipboard 유지 — 동일 내용을 다른 위치에 여러 번 붙여넣을 수 있음 (legacy 동작).
        showNotification(`${copiedCount}개 항목 복사 완료`, 'success');
      } else if (copiedCount > 0) {
        // 부분 성공: 사용자에게 정확히 알린다 — 은폐 금지.
        const msg = _firstErrorMessage(result, '일부 복사 실패');
        showNotification(`일부만 복사됨 (${copiedCount}/${paths.length}): ${msg}`, 'error');
      } else {
        const msg = _firstErrorMessage(result, '복사 실패');
        showNotification(msg, 'error');
      }
    }
  } finally {
    _pasteInflight = false;
  }
}

export function clear() {
  state.operation = null;
  state.paths = [];
  _setCutMarkers([]);
  _renderTree();
}

export function getState() {
  return { operation: state.operation, paths: state.paths.slice() };
}

export function activate() {
  if (_activated) return;
  _activated = true;
  if (typeof window === 'undefined') return;
  window.ClipboardModule = {
    cut,
    copy,
    paste,
    clear,
    getState,
    showNotification,
  };
}

export function deactivate() {
  _activated = false;
  state.operation = null;
  state.paths = [];
  // 모드 전환 시점에 떠 있던 토스트는 페이지 컨텍스트가 바뀌므로 제거.
  if (typeof document !== 'undefined') {
    document.querySelectorAll('.doclight-toast').forEach((n) => {
      try { if (n.parentNode) n.parentNode.removeChild(n); } catch (_) { /* noop */ }
    });
  }
  if (typeof window !== 'undefined' && window.ClipboardModule) {
    delete window.ClipboardModule;
  }
}
