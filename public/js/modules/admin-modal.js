// public/js/modules/admin-modal.js
// 관리 모달 (사용자/그룹/가입 요청/인증 설정) — superuser 전용 lazy 로드.
// admin.js:1630-2072 ManagementModule 을 ESM 으로 이식.
// REQ-F-004, REQ-F-008, REQ-NF-003, REQ-NF-005.
// window.alert/confirm/prompt 사용 금지 (CLAUDE.md §0). showConfirm 또는 내부 _alert/_promptText 사용.

import { showConfirm } from './modal-ui.js';

const state = {
  currentTab: null,
  groups: [],
  permissions: [],
  bound: false,
};

let activated = false;

function _bp(p) {
  const fn = (typeof window !== 'undefined' && window.DocLightUtils && window.DocLightUtils.prefixPath);
  return typeof fn === 'function' ? fn(p) : p;
}

function _esc(s) {
  const d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
}

function _showModal(id) {
  const m = document.getElementById(id);
  if (m) m.style.display = 'flex';
}

function _hideModal(id) {
  const m = document.getElementById(id);
  if (m) m.style.display = 'none';
}

async function _alert(message) {
  await showConfirm({
    title: '알림',
    body: message || '',
    primary: '확인',
    cancel: '확인',
  });
}

async function _confirm(message) {
  const result = await showConfirm({
    title: '확인',
    body: message || '',
    primary: '확인',
    cancel: '취소',
  });
  return result === 'primary';
}

function _promptText(opts) {
  return new Promise((resolve) => {
    const { title, label, type = 'text', placeholder = '' } = opts || {};
    const overlay = document.createElement('div');
    overlay.className = 'doclight-modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    const dialog = document.createElement('div');
    dialog.className = 'doclight-modal-dialog';

    const titleEl = document.createElement('div');
    titleEl.className = 'doclight-modal-title';
    titleEl.textContent = title || '';

    const bodyEl = document.createElement('div');
    bodyEl.className = 'doclight-modal-body';
    const lbl = document.createElement('label');
    lbl.textContent = label || '';
    lbl.style.display = 'block';
    lbl.style.marginBottom = '6px';
    const input = document.createElement('input');
    input.type = type;
    input.placeholder = placeholder;
    input.style.width = '100%';
    input.style.padding = '6px 8px';
    input.style.border = '1px solid #ccc';
    input.style.borderRadius = '4px';
    bodyEl.appendChild(lbl);
    bodyEl.appendChild(input);

    const actions = document.createElement('div');
    actions.className = 'doclight-modal-actions';

    let settled = false;
    const finish = (val) => {
      if (settled) return;
      settled = true;
      document.removeEventListener('keydown', onKey, true);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      resolve(val);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); finish(null); }
      else if (e.key === 'Enter') { e.preventDefault(); finish(input.value); }
    };

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'doclight-modal-btn';
    cancelBtn.textContent = '취소';
    cancelBtn.addEventListener('click', () => finish(null));

    const okBtn = document.createElement('button');
    okBtn.type = 'button';
    okBtn.className = 'doclight-modal-btn doclight-modal-btn-primary';
    okBtn.textContent = '확인';
    okBtn.addEventListener('click', () => finish(input.value));

    actions.appendChild(cancelBtn);
    actions.appendChild(okBtn);

    dialog.appendChild(titleEl);
    dialog.appendChild(bodyEl);
    dialog.appendChild(actions);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    document.addEventListener('keydown', onKey, true);
    setTimeout(() => input.focus(), 0);
  });
}

const AdminAPI = {
  async getJson(url, opts) {
    const r = await fetch(_bp(url), { credentials: 'include', ...(opts || {}) });
    return r.json();
  },
  getMe() { return this.getJson('/api/auth/me'); },
  changePassword(currentPassword, newPassword, newPasswordConfirm) {
    return this.getJson('/api/auth/me/password', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword, newPassword, newPasswordConfirm }) });
  },
  regenerateKey() { return this.getJson('/api/auth/me/regenerate-key', { method: 'POST' }); },
  getUsers() { return this.getJson('/api/admin/users'); },
  createUser(data) { return this.getJson('/api/admin/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); },
  updateUser(id, data) { return this.getJson(`/api/admin/users/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); },
  deleteUser(id) { return this.getJson(`/api/admin/users/${id}`, { method: 'DELETE' }); },
  resetUserPassword(id, password) { return this.getJson(`/api/admin/users/${id}/reset-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) }); },
  unlockUser(id) { return this.getJson(`/api/admin/users/${id}/unlock`, { method: 'POST' }); },
  getGroups() { return this.getJson('/api/admin/groups'); },
  createGroup(data) { return this.getJson('/api/admin/groups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); },
  updateGroup(id, data) { return this.getJson(`/api/admin/groups/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); },
  deleteGroup(id) { return this.getJson(`/api/admin/groups/${id}`, { method: 'DELETE' }); },
  getAuthSettings() { return this.getJson('/api/admin/auth-settings'); },
  updateAuthSettings(data) { return this.getJson('/api/admin/auth-settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); },
  getRegistrations() { return this.getJson('/api/admin/registrations'); },
  approveRegistration(id, groupId) { return this.getJson(`/api/admin/registrations/${id}/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ groupId }) }); },
  rejectRegistration(id) { return this.getJson(`/api/admin/registrations/${id}/reject`, { method: 'POST' }); },
};

async function _fetchSession() {
  try {
    const res = await fetch(_bp('/api/auth/session'), { credentials: 'include' });
    if (res.status !== 200) { state.permissions = []; return; }
    const body = await res.json().catch(() => ({}));
    state.permissions = (body && body.session && Array.isArray(body.session.permissions))
      ? body.session.permissions
      : [];
  } catch (e) {
    console.warn('admin-modal.js: session fetch failed', e);
    state.permissions = [];
  }
}

async function openManagementModal(initialTab) {
  await _fetchSession();
  state.currentTab = initialTab || 'users';
  _showModal('mgmt-modal');
  renderTabs();
  await loadTab(state.currentTab);
}

function hide() {
  _hideModal('mgmt-modal');
  state.currentTab = null;
}

function renderTabs() {
  const tabBar = document.getElementById('mgmt-tabs');
  if (!tabBar) return;
  const isSuperuser = state.permissions.includes('superuser');
  const tabs = [
    { id: 'users', label: '사용자', show: isSuperuser },
    { id: 'groups', label: '그룹', show: isSuperuser },
    { id: 'registrations', label: '가입 요청', show: isSuperuser },
    { id: 'settings', label: '인증 설정', show: isSuperuser },
  ];
  const visibleTabs = tabs.filter(t => t.show);
  tabBar.innerHTML = visibleTabs.map(t =>
    `<button class="mgmt-tab ${t.id === state.currentTab ? 'active' : ''}" data-tab="${t.id}">${t.label}</button>`
  ).join('');
  tabBar.querySelectorAll('.mgmt-tab').forEach(btn => {
    btn.addEventListener('click', () => loadTab(btn.dataset.tab));
  });
  const select = document.getElementById('mgmt-select');
  if (select) {
    select.innerHTML = visibleTabs.map(t =>
      `<option value="${t.id}" ${t.id === state.currentTab ? 'selected' : ''}>${t.label}</option>`
    ).join('');
    select.onchange = () => loadTab(select.value);
  }
}

async function loadTab(tab) {
  state.currentTab = tab;
  renderTabs();
  const content = document.getElementById('mgmt-content');
  if (!content) return;
  content.innerHTML = '<p style="padding:20px;color:#888;">로딩 중...</p>';
  try {
    switch (tab) {
      case 'profile': await loadProfile(content); break;
      case 'users': await loadUsers(content); break;
      case 'groups': await loadGroups(content); break;
      case 'registrations': await loadRegistrations(content); break;
      case 'settings': await loadSettings(content); break;
    }
  } catch (e) {
    content.innerHTML = `<p style="padding:20px;color:#d32f2f;">오류: ${_esc(e.message)}</p>`;
  }
}

async function loadProfile(el) {
  const res = await AdminAPI.getMe();
  if (!res.success) { el.innerHTML = '<p class="mgmt-error">프로필을 불러올 수 없습니다.</p>'; return; }
  const u = res.user;
  el.innerHTML = `
    <div class="mgmt-section">
      <h3>내 정보</h3>
      <table class="mgmt-detail-table">
        <tr><th>이메일</th><td>${_esc(u.email)}</td></tr>
        <tr><th>그룹</th><td>${_esc(u.groupName)}</td></tr>
        <tr><th>마지막 로그인</th><td>${u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('ko') : '-'}</td></tr>
        <tr><th>가입일</th><td>${new Date(u.createdAt).toLocaleString('ko')}</td></tr>
      </table>
    </div>
    <div class="mgmt-section">
      <h3>패스워드 변경</h3>
      <button class="btn btn-primary" id="pw-change-btn">패스워드 변경</button>
    </div>
    <div class="mgmt-section">
      <h3>User Key (MCP/API 인증용)</h3>
      <p class="mgmt-hint">이 키는 MCP 클라이언트의 X-API-Key 헤더에 사용합니다.</p>
      <div class="mgmt-key-box">
        <code id="user-key-display">********</code>
        <button class="key-copy-btn" id="key-copy" title="복사" style="display:none;">&#x1F4CB;</button>
        <button class="btn btn-small" id="key-show">표시</button>
        <button class="btn btn-small btn-danger" id="key-regen">재발급</button>
      </div>
      <div id="key-msg" class="mgmt-msg"></div>
    </div>
  `;

  const pwInputs = () => ({
    curEl: document.getElementById('pw-modal-current'),
    nwEl: document.getElementById('pw-modal-new'),
    cfEl: document.getElementById('pw-modal-confirm'),
    msgEl: document.getElementById('pw-modal-msg'),
  });
  const resetPwModal = () => {
    const { curEl, nwEl, cfEl, msgEl } = pwInputs();
    if (curEl) curEl.value = '';
    if (nwEl) nwEl.value = '';
    if (cfEl) cfEl.value = '';
    if (msgEl) { msgEl.textContent = ''; msgEl.style.display = 'none'; }
  };
  const closePwModal = () => {
    _hideModal('password-change-modal');
    resetPwModal();
  };
  document.getElementById('pw-change-btn').addEventListener('click', () => {
    resetPwModal();
    _showModal('password-change-modal');
  });
  const pwCancelBtn = document.getElementById('pw-modal-cancel');
  if (pwCancelBtn) pwCancelBtn.onclick = closePwModal;
  const pwSaveBtn = document.getElementById('pw-modal-save');
  if (pwSaveBtn) pwSaveBtn.onclick = async () => {
    const { curEl, nwEl, cfEl, msgEl } = pwInputs();
    const cur = (curEl?.value || '').trim();
    const nw = (nwEl?.value || '').trim();
    const cf = (cfEl?.value || '').trim();
    const showErr = (text) => { if (msgEl) { msgEl.textContent = text; msgEl.style.display = ''; msgEl.className = 'error-message'; } };
    if (!cur || !nw || !cf) { showErr('모든 필드를 입력해주세요.'); return; }
    if (nw.length < 8) { showErr('새 비밀번호는 최소 8자 이상이어야 합니다.'); return; }
    if (nw !== cf) { showErr('새 비밀번호가 일치하지 않습니다.'); return; }
    const r = await AdminAPI.changePassword(cur, nw, cf);
    if (r.success) {
      closePwModal();
      await _alert('패스워드가 변경되었습니다.');
    } else {
      showErr(r.error?.message || '변경 실패');
    }
  };

  let keyVisible = false;
  const storedKey = u.userKey || null;
  document.getElementById('key-show').addEventListener('click', () => {
    const disp = document.getElementById('user-key-display');
    if (keyVisible) { disp.textContent = '********'; keyVisible = false; document.getElementById('key-copy').style.display = 'none'; }
    else if (storedKey) { disp.textContent = storedKey; keyVisible = true; document.getElementById('key-copy').style.display = ''; }
    else { disp.textContent = '키를 보려면 재발급하세요.'; keyVisible = true; }
  });
  document.getElementById('key-regen').addEventListener('click', async () => {
    const ok = await _confirm('새 키를 발급하면 기존 키는 즉시 무효화됩니다. 계속하시겠습니까?');
    if (!ok) return;
    const r = await AdminAPI.regenerateKey();
    const msg = document.getElementById('key-msg');
    if (r.success) {
      document.getElementById('user-key-display').textContent = r.userKey;
      keyVisible = true;
      const copyBtn = document.getElementById('key-copy');
      if (copyBtn) copyBtn.style.display = '';
      msg.textContent = '새 키가 발급되었습니다. 이 키를 안전하게 보관하세요.'; msg.className = 'mgmt-msg success';
    } else { msg.textContent = r.error?.message || '재발급 실패'; msg.className = 'mgmt-msg error'; }
  });
  document.getElementById('key-copy').addEventListener('click', async () => {
    const key = document.getElementById('user-key-display').textContent;
    if (!key || key === '********') return;
    const btn = document.getElementById('key-copy');
    const msg = document.getElementById('key-msg');
    let ok = false;
    try {
      await navigator.clipboard.writeText(key);
      ok = true;
    } catch (e) {
      try {
        const ta = document.createElement('textarea');
        ta.value = key;
        ta.style.cssText = 'position:fixed;left:-9999px;';
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch (e2) { /* fallback also failed */ }
    }
    if (ok) {
      btn.classList.add('copied'); btn.innerHTML = '&#x2714;';
      setTimeout(() => { btn.classList.remove('copied'); btn.innerHTML = '&#x1F4CB;'; }, 1500);
    } else if (msg) {
      msg.textContent = '클립보드 복사 실패 — 키를 직접 선택하여 복사하세요.'; msg.className = 'mgmt-msg error';
    }
  });
}

async function loadUsers(el) {
  const [usersRes, groupsRes] = await Promise.all([AdminAPI.getUsers(), AdminAPI.getGroups()]);
  if (!usersRes.success) { el.innerHTML = '<p class="mgmt-error">사용자 목록을 불러올 수 없습니다.</p>'; return; }
  state.groups = groupsRes.groups || [];
  const users = usersRes.users || [];
  el.innerHTML = `
    <div class="mgmt-section">
      <div class="mgmt-header"><h3>사용자 목록 (${users.length})</h3><button class="btn btn-primary btn-small" id="add-user-btn">+ 사용자 추가</button></div>
      <table class="mgmt-table" id="users-table">
        <thead><tr><th>이메일</th><th>그룹</th><th>상태</th><th>마지막 로그인</th><th>작업</th></tr></thead>
        <tbody>
          ${users.map(u => {
            const g = state.groups.find(g => g.id === u.groupId);
            return `<tr data-id="${u.id}">
              <td>${_esc(u.email)}</td>
              <td>${g ? _esc(g.name) : '-'}</td>
              <td><span class="status-badge ${u.status}">${u.status === 'active' ? '활성' : '비활성'}</span></td>
              <td>${u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('ko') : '-'}</td>
              <td class="actions">
                <button class="btn btn-small edit-user" data-id="${u.id}">편집</button>
                <button class="btn btn-small btn-danger delete-user" data-id="${u.id}">삭제</button>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
  document.getElementById('add-user-btn').addEventListener('click', () => showUserForm());
  el.querySelectorAll('.edit-user').forEach(btn => btn.addEventListener('click', () => showUserForm(users.find(u => u.id === btn.dataset.id))));
  el.querySelectorAll('.delete-user').forEach(btn => btn.addEventListener('click', async () => {
    const ok = await _confirm('이 사용자를 삭제하시겠습니까?');
    if (!ok) return;
    const r = await AdminAPI.deleteUser(btn.dataset.id);
    if (r.success) loadTab('users');
    else await _alert(r.error?.message || '삭제 실패');
  }));
}

function showUserForm(user) {
  const content = document.getElementById('mgmt-content');
  const isEdit = !!user;
  const groupOptions = state.groups.map(g => `<option value="${g.id}" ${user && user.groupId === g.id ? 'selected' : ''}>${_esc(g.name)}</option>`).join('');
  content.innerHTML = `
    <div class="mgmt-section">
      <h3>${isEdit ? '사용자 편집' : '사용자 추가'}</h3>
      <div class="mgmt-form">
        <div class="mgmt-form-row"><label>이메일</label><input type="email" id="user-email" value="${isEdit ? _esc(user.email) : ''}" ${isEdit ? 'readonly' : ''} autocomplete="off"></div>
        ${!isEdit ? '<div class="mgmt-form-row"><label>패스워드</label><input type="password" id="user-password" autocomplete="new-password"></div>' : ''}
        <div class="mgmt-form-row"><label>그룹</label><select id="user-group">${groupOptions}</select></div>
        ${isEdit ? `<div class="mgmt-form-row"><label>상태</label><select id="user-status"><option value="active" ${user.status === 'active' ? 'selected' : ''}>활성</option><option value="disabled" ${user.status === 'disabled' ? 'selected' : ''}>비활성</option></select></div>` : ''}
        <div class="mgmt-form-actions">
          <button class="btn btn-secondary" id="user-cancel">취소</button>
          <button class="btn btn-primary" id="user-save">저장</button>
        </div>
        ${isEdit ? `<div style="margin-top:16px;"><button class="btn btn-small" id="reset-pw-btn">패스워드 리셋</button> <button class="btn btn-small" id="unlock-btn">잠금 해제</button></div>` : ''}
        <div id="user-msg" class="mgmt-msg"></div>
      </div>
    </div>
  `;
  document.getElementById('user-cancel').addEventListener('click', () => loadTab('users'));
  document.getElementById('user-save').addEventListener('click', async () => {
    const msg = document.getElementById('user-msg');
    if (isEdit) {
      const r = await AdminAPI.updateUser(user.id, { groupId: document.getElementById('user-group').value, status: document.getElementById('user-status').value });
      if (r.success) { msg.textContent = '저장되었습니다.'; msg.className = 'mgmt-msg success'; setTimeout(() => loadTab('users'), 700); }
      else { msg.textContent = r.error?.message || '저장 실패'; msg.className = 'mgmt-msg error'; }
    } else {
      const email = document.getElementById('user-email').value.trim();
      const password = document.getElementById('user-password').value.trim();
      const groupId = document.getElementById('user-group').value;
      if (!email || !password) { msg.textContent = '이메일과 패스워드를 입력하세요.'; msg.className = 'mgmt-msg error'; return; }
      const r = await AdminAPI.createUser({ email, password, groupId });
      if (r.success) { msg.textContent = '사용자가 생성되었습니다.'; msg.className = 'mgmt-msg success'; setTimeout(() => loadTab('users'), 700); }
      else { msg.textContent = r.error?.message || '생성 실패'; msg.className = 'mgmt-msg error'; }
    }
  });
  if (isEdit) {
    document.getElementById('reset-pw-btn')?.addEventListener('click', async () => {
      const pw = (await _promptText({ title: '패스워드 리셋', label: '새 패스워드를 입력하세요 (최소 8자):', type: 'password' }))?.trim();
      if (!pw) return;
      if (pw.length < 8) { await _alert('패스워드는 최소 8자입니다.'); return; }
      const r = await AdminAPI.resetUserPassword(user.id, pw);
      const msg = document.getElementById('user-msg');
      if (r.success) { msg.textContent = '패스워드가 리셋되었습니다.'; msg.className = 'mgmt-msg success'; setTimeout(() => loadTab('users'), 700); }
      else { msg.textContent = r.error?.message || '리셋 실패'; msg.className = 'mgmt-msg error'; }
    });
    document.getElementById('unlock-btn')?.addEventListener('click', async () => {
      const r = await AdminAPI.unlockUser(user.id);
      const msg = document.getElementById('user-msg');
      if (r.success) { msg.textContent = '잠금이 해제되었습니다.'; msg.className = 'mgmt-msg success'; setTimeout(() => loadTab('users'), 700); }
      else { msg.textContent = r.error?.message || '해제 실패'; msg.className = 'mgmt-msg error'; }
    });
  }
}

async function loadGroups(el) {
  const res = await AdminAPI.getGroups();
  if (!res.success) { el.innerHTML = '<p class="mgmt-error">그룹 목록을 불러올 수 없습니다.</p>'; return; }
  state.groups = res.groups || [];
  el.innerHTML = `
    <div class="mgmt-section">
      <div class="mgmt-header"><h3>그룹 목록 (${state.groups.length})</h3><button class="btn btn-primary btn-small" id="add-group-btn">+ 그룹 추가</button></div>
      <table class="mgmt-table">
        <thead><tr><th>이름</th><th>권한</th><th>시스템</th><th>작업</th></tr></thead>
        <tbody>
          ${state.groups.map(g => `<tr>
            <td>${_esc(g.name)}</td>
            <td>${g.permissions.join(', ')}</td>
            <td>${g.isSystem ? '예' : ''}</td>
            <td class="actions">
              ${!g.isSystem ? `<button class="btn btn-small edit-group" data-id="${g.id}">편집</button><button class="btn btn-small btn-danger delete-group" data-id="${g.id}">삭제</button>` : '<span style="color:#999">수정 불가</span>'}
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;
  document.getElementById('add-group-btn').addEventListener('click', () => showGroupForm());
  el.querySelectorAll('.edit-group').forEach(btn => btn.addEventListener('click', () => showGroupForm(state.groups.find(g => g.id === btn.dataset.id))));
  el.querySelectorAll('.delete-group').forEach(btn => btn.addEventListener('click', async () => {
    const ok = await _confirm('이 그룹을 삭제하시겠습니까?');
    if (!ok) return;
    const r = await AdminAPI.deleteGroup(btn.dataset.id);
    if (r.success) loadTab('groups');
    else await _alert(r.error?.message || '삭제 실패');
  }));
}

function showGroupForm(group) {
  const content = document.getElementById('mgmt-content');
  const isEdit = !!group;
  const allPerms = ['superuser', 'write', 'read'];
  const checkedPerms = group ? group.permissions : ['read'];
  content.innerHTML = `
    <div class="mgmt-section">
      <h3>${isEdit ? '그룹 편집' : '그룹 추가'}</h3>
      <div class="mgmt-form">
        <div class="mgmt-form-row"><label>그룹 이름</label><input type="text" id="group-name" value="${isEdit ? _esc(group.name) : ''}"></div>
        <div class="mgmt-form-row"><label>권한</label><div id="group-perms">${allPerms.map(p => `<label class="mgmt-checkbox"><input type="checkbox" value="${p}" ${checkedPerms.includes(p) ? 'checked' : ''}> ${p}</label>`).join('')}</div></div>
        <div class="mgmt-form-actions">
          <button class="btn btn-secondary" id="group-cancel">취소</button>
          <button class="btn btn-primary" id="group-save">저장</button>
        </div>
        <div id="group-msg" class="mgmt-msg"></div>
      </div>
    </div>
  `;
  document.getElementById('group-cancel').addEventListener('click', () => loadTab('groups'));
  document.getElementById('group-save').addEventListener('click', async () => {
    const name = document.getElementById('group-name').value.trim();
    const permissions = [...document.querySelectorAll('#group-perms input:checked')].map(c => c.value);
    const msg = document.getElementById('group-msg');
    if (!name) { msg.textContent = '그룹 이름을 입력하세요.'; msg.className = 'mgmt-msg error'; return; }
    if (permissions.length === 0) { msg.textContent = '최소 하나의 권한을 선택하세요.'; msg.className = 'mgmt-msg error'; return; }
    const r = isEdit ? await AdminAPI.updateGroup(group.id, { name, permissions }) : await AdminAPI.createGroup({ name, permissions });
    if (r.success) { msg.textContent = '저장되었습니다.'; msg.className = 'mgmt-msg success'; setTimeout(() => loadTab('groups'), 700); }
    else { msg.textContent = r.error?.message || '저장 실패'; msg.className = 'mgmt-msg error'; }
  });
}

async function loadRegistrations(el) {
  const [regRes, groupsRes] = await Promise.all([AdminAPI.getRegistrations(), AdminAPI.getGroups()]);
  if (!regRes.success) { el.innerHTML = '<p class="mgmt-error">가입 요청을 불러올 수 없습니다.</p>'; return; }
  state.groups = groupsRes.groups || [];
  const regs = regRes.registrations || [];
  if (regs.length === 0) {
    el.innerHTML = '<div class="mgmt-section"><h3>가입 요청</h3><p style="color:#888;padding:20px;">대기 중인 가입 요청이 없습니다.</p></div>';
    return;
  }
  el.innerHTML = `
    <div class="mgmt-section">
      <h3>가입 요청 (${regs.length}건 대기)</h3>
      <div class="mgmt-reg-list">
        ${regs.map(r => `
          <div class="mgmt-reg-card" data-id="${r.id}">
            <div class="reg-info">
              <strong>${_esc(r.email)}</strong>
              <span class="reg-date">${new Date(r.createdAt).toLocaleString('ko')}</span>
              ${r.message ? `<p class="reg-message">${_esc(r.message)}</p>` : ''}
            </div>
            <div class="reg-actions">
              <select class="reg-group">${state.groups.filter(g => !g.permissions.includes('superuser')).map(g => `<option value="${g.id}">${_esc(g.name)}</option>`).join('')}</select>
              <button class="btn btn-primary btn-small approve-reg" data-id="${r.id}">승인</button>
              <button class="btn btn-danger btn-small reject-reg" data-id="${r.id}">거절</button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
  el.querySelectorAll('.approve-reg').forEach(btn => {
    btn.addEventListener('click', async () => {
      const card = btn.closest('.mgmt-reg-card');
      const groupId = card.querySelector('.reg-group').value;
      const r = await AdminAPI.approveRegistration(btn.dataset.id, groupId);
      if (r.success) loadTab('registrations');
      else await _alert(r.error?.message || '승인 실패');
    });
  });
  el.querySelectorAll('.reject-reg').forEach(btn => {
    btn.addEventListener('click', async () => {
      const ok = await _confirm('이 가입 요청을 거절하시겠습니까?');
      if (!ok) return;
      const r = await AdminAPI.rejectRegistration(btn.dataset.id);
      if (r.success) loadTab('registrations');
      else await _alert(r.error?.message || '거절 실패');
    });
  });
}

async function loadSettings(el) {
  const res = await AdminAPI.getAuthSettings();
  if (!res.success) { el.innerHTML = '<p class="mgmt-error">인증 설정을 불러올 수 없습니다.</p>'; return; }
  const s = res.settings;
  el.innerHTML = `
    <div class="mgmt-section">
      <h3>인증 설정</h3>
      <div class="mgmt-form">
        <div class="mgmt-form-row"><label><input type="checkbox" id="set-requireReadLogin" ${s.requireReadLogin ? 'checked' : ''}> 읽기 로그인 필요 (접근 자체를 차단)</label></div>
        <div class="mgmt-form-row"><label><input type="checkbox" id="set-allowSignup" ${s.allowSignup ? 'checked' : ''}> 가입 요청 허용</label></div>
        <div class="mgmt-form-row"><label>세션 타임아웃 (분)</label><input type="number" id="set-timeout" value="${Math.round((s.sessionTimeout || 3600000) / 60000)}" min="1"></div>
        <div class="mgmt-form-row"><label>가입 모드</label><select id="set-signupMode"><option value="approval" ${(s.signupMode || 'approval') === 'approval' ? 'selected' : ''}>승인 기반 (관리자 승인 필요)</option><option value="self" ${s.signupMode === 'self' ? 'selected' : ''}>직접 가입 (즉시 계정 생성)</option></select></div>
        <div class="mgmt-form-row" id="self-signup-group-row" style="display:${s.signupMode === 'self' ? 'block' : 'none'}"><label>직접 가입 기본 그룹명</label><input type="text" id="set-selfSignupGroup" value="${_esc((s.selfSignup && s.selfSignup.defaultGroupName) || 'Viewer')}" placeholder="Viewer"></div>
        <div class="mgmt-form-row"><label>가입 허용 이메일 도메인 (쉼표 구분)</label><input type="text" id="set-domains" value="${_esc((s.allowedEmailDomains || []).join(', '))}" placeholder="example.com, company.co.kr"></div>
        <div class="mgmt-form-actions"><button class="btn btn-primary" id="settings-save">저장</button></div>
        <div id="settings-msg" class="mgmt-msg"></div>
      </div>
    </div>
  `;
  document.getElementById('set-signupMode').addEventListener('change', function () {
    document.getElementById('self-signup-group-row').style.display = this.value === 'self' ? 'block' : 'none';
  });
  document.getElementById('settings-save').addEventListener('click', async () => {
    const msg = document.getElementById('settings-msg');
    const data = {
      requireReadLogin: document.getElementById('set-requireReadLogin').checked,
      allowSignup: document.getElementById('set-allowSignup').checked,
      sessionTimeout: parseInt(document.getElementById('set-timeout').value, 10) * 60000,
      allowedEmailDomains: document.getElementById('set-domains').value.split(',').map(d => d.trim()).filter(Boolean),
      signupMode: document.getElementById('set-signupMode').value,
      selfSignup: { defaultGroupName: document.getElementById('set-selfSignupGroup').value.trim() || 'Viewer' },
    };
    const r = await AdminAPI.updateAuthSettings(data);
    if (r.success) { msg.textContent = '설정이 저장되었습니다.'; msg.className = 'mgmt-msg success'; }
    else { msg.textContent = r.error?.message || '저장 실패'; msg.className = 'mgmt-msg error'; }
  });
}

function _bindOpenButton() {
  if (state.bound) return;
  const btn = document.getElementById('mgmt-open-btn');
  if (!btn) return;
  btn.addEventListener('click', () => { openManagementModal(); });
  state.bound = true;
}

function _bindCloseHandlers() {
  const modal = document.getElementById('mgmt-modal');
  if (!modal) return;
  modal.querySelectorAll('[data-mgmt-close], #mgmt-close').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      hide();
    });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.style.display !== 'none' && modal.style.display !== '') hide();
  });
}

export function activate() {
  if (activated) return;
  activated = true;
  if (typeof document === 'undefined') return;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { _bindOpenButton(); _bindCloseHandlers(); }, { once: true });
  } else {
    _bindOpenButton();
    _bindCloseHandlers();
  }
}

export function deactivate() {
  activated = false;
  state.bound = false;
  hide();
}

export { openManagementModal };
