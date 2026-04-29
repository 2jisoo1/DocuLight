// public/js/modules/modal-ui.js
// 공통 confirm 모달 (REQ-F-008, REQ-NF-003, REQ-NF-005)
// §3-A.3.2 — admin-modal lazy 로드 시에도 writer 모드에서 confirmUnsaved 가능하도록 분리.
// window.alert/confirm/prompt 사용 금지 (CLAUDE.md §0).

const STYLE_ID = '__doclight-modal-ui-style';

const STYLES = `
.doclight-modal-overlay {
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex; align-items: center; justify-content: center;
  z-index: 10000;
}
.doclight-modal-dialog {
  background: #fff; color: #222;
  border-radius: 8px;
  min-width: 320px; max-width: 480px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25);
  font-family: system-ui, -apple-system, sans-serif;
}
.doclight-modal-title {
  font-size: 16px; font-weight: 600;
  padding: 16px 20px 8px;
}
.doclight-modal-body {
  padding: 0 20px 16px;
  font-size: 14px; line-height: 1.5;
  white-space: pre-wrap;
}
.doclight-modal-actions {
  display: flex; justify-content: flex-end; gap: 8px;
  padding: 12px 20px 16px;
}
.doclight-modal-btn {
  padding: 6px 14px; border-radius: 4px; border: 1px solid #ccc;
  background: #f5f5f5; cursor: pointer; font-size: 14px;
}
.doclight-modal-btn-primary {
  background: #2563eb; border-color: #2563eb; color: #fff;
}
.doclight-modal-btn-secondary {
  background: #fff;
}
`;

function _ensureStyle() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STYLES;
  document.head.appendChild(style);
}

export function showConfirm(opts) {
  return new Promise((resolve) => {
    _ensureStyle();
    const { title, body, primary, secondary, cancel, dataModal } = opts || {};

    const overlay = document.createElement('div');
    overlay.className = 'doclight-modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    if (dataModal) overlay.setAttribute('data-modal', dataModal);

    const dialog = document.createElement('div');
    dialog.className = 'doclight-modal-dialog';

    const titleEl = document.createElement('div');
    titleEl.className = 'doclight-modal-title';
    titleEl.textContent = title || '';

    const bodyEl = document.createElement('div');
    bodyEl.className = 'doclight-modal-body';
    bodyEl.textContent = body || '';

    const actions = document.createElement('div');
    actions.className = 'doclight-modal-actions';

    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      document.removeEventListener('keydown', onKey, true);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      resolve(result);
    };

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        finish('cancel');
      }
    };

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'doclight-modal-btn';
    cancelBtn.textContent = cancel || '취소';
    cancelBtn.addEventListener('click', () => finish('cancel'));

    let secondaryBtn = null;
    if (secondary) {
      secondaryBtn = document.createElement('button');
      secondaryBtn.type = 'button';
      secondaryBtn.className = 'doclight-modal-btn doclight-modal-btn-secondary';
      secondaryBtn.textContent = secondary;
      secondaryBtn.addEventListener('click', () => finish('secondary'));
    }

    const primaryBtn = document.createElement('button');
    primaryBtn.type = 'button';
    primaryBtn.className = 'doclight-modal-btn doclight-modal-btn-primary';
    primaryBtn.textContent = primary || '확인';
    primaryBtn.addEventListener('click', () => finish('primary'));

    actions.appendChild(cancelBtn);
    if (secondaryBtn) actions.appendChild(secondaryBtn);
    actions.appendChild(primaryBtn);

    dialog.appendChild(titleEl);
    dialog.appendChild(bodyEl);
    dialog.appendChild(actions);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    document.addEventListener('keydown', onKey, true);

    setTimeout(() => primaryBtn.focus(), 0);
  });
}

export async function confirmUnsaved() {
  const result = await showConfirm({
    title: '저장하지 않은 변경사항이 있습니다',
    body: '이 페이지를 떠나면 작성한 내용이 사라집니다.',
    primary: '저장하고 나가기',
    secondary: '버리고 나가기',
    cancel: '취소',
    dataModal: 'confirm-unsaved',
  });
  if (result === 'primary') return 'save';
  if (result === 'secondary') return 'discard';
  return 'cancel';
}

export function activate() {
  if (typeof window === 'undefined') return;
  window.__doclightState = window.__doclightState || {};
  window.__doclightState.modal = window.__doclightState.modal || {};
  window.__doclightState.modal.showConfirm = showConfirm;
}
