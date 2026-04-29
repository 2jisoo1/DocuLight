// public/js/modules/upload.js
// 업로드 큐 + XHR 진행률 토스트.
// admin.js UploadModule (라인 2524-2925) 의 큐/진행률/완료 처리 부분을 ESM 으로 이식.
// 외부 드롭 수집은 dnd.js, 트리 새로고침은 tree.js 가 담당하므로 본 모듈은 큐만 다룬다.

import { refresh as refreshTree } from './tree.js';

let containerEl = null;
let activated = false;

function bp(p) {
  if (typeof window !== 'undefined' && window.DocLightUtils && typeof window.DocLightUtils.prefixPath === 'function') {
    return window.DocLightUtils.prefixPath(p);
  }
  return p;
}

function notify(message, type = 'info') {
  if (typeof window !== 'undefined' && window.ClipboardModule && typeof window.ClipboardModule.showNotification === 'function') {
    window.ClipboardModule.showNotification(message, type);
    return;
  }
  if (typeof window !== 'undefined' && typeof window.showNotification === 'function') {
    window.showNotification(message, type);
    return;
  }
  console.log(`[upload:${type}]`, message);
}

function ensureContainer() {
  if (containerEl && document.body.contains(containerEl)) return containerEl;
  let el = document.getElementById('upload-toast-container');
  if (!el) {
    el = document.createElement('div');
    el.id = 'upload-toast-container';
    el.className = 'upload-toast';
    el.style.display = 'none';
    document.body.appendChild(el);
  }
  containerEl = el;
  return el;
}

function truncateFilename(name, maxLength = 20) {
  if (name.length <= maxLength) return name;
  const ext = name.includes('.') ? '.' + name.split('.').pop() : '';
  const base = name.slice(0, name.length - ext.length);
  const truncated = base.slice(0, Math.max(0, maxLength - ext.length - 3)) + '...';
  return truncated + ext;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function uploadSingleFile(file, targetPath) {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append('files', file);

    const itemEl = document.createElement('div');
    itemEl.className = 'upload-item';
    itemEl.innerHTML = `
      <span class="upload-filename" title="${escapeHtml(file.name)}">${escapeHtml(truncateFilename(file.name))}</span>
      <span class="upload-percent">0%</span>
    `;
    containerEl.appendChild(itemEl);

    const percentEl = itemEl.querySelector('.upload-percent');

    const markError = () => {
      percentEl.textContent = '\u2717';
      percentEl.classList.add('error');
      setTimeout(() => {
        itemEl.classList.add('fade-out');
        setTimeout(() => itemEl.remove(), 300);
      }, 2000);
    };

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
          percentEl.textContent = '\u2713';
          percentEl.classList.add('complete');
          setTimeout(() => {
            itemEl.classList.add('fade-out');
            setTimeout(() => itemEl.remove(), 300);
          }, 1000);
          resolve({ success: true, filename: file.name, path: targetPath, ...response });
        } catch {
          markError();
          resolve({ success: false, filename: file.name, error: 'Invalid response' });
        }
      } else {
        let errorMsg = `Error ${xhr.status}`;
        try {
          const errResponse = JSON.parse(xhr.responseText);
          if (errResponse.error && errResponse.error.message) errorMsg = errResponse.error.message;
        } catch { /* ignore */ }
        markError();
        resolve({ success: false, filename: file.name, error: errorMsg });
      }
    };

    xhr.onerror = () => {
      markError();
      resolve({ success: false, filename: file.name, error: 'Network error' });
    };

    xhr.open('POST', bp(`/api/admin/upload?path=${encodeURIComponent(targetPath)}`));
    xhr.withCredentials = true;
    xhr.send(formData);
  });
}

async function onAllUploadsComplete(results) {
  const checkAndHide = () => {
    if (containerEl && containerEl.children.length === 0) {
      containerEl.style.display = 'none';
    } else {
      setTimeout(checkAndHide, 500);
    }
  };
  setTimeout(checkAndHide, 1000);

  try { await refreshTree(); } catch (e) { console.warn('[upload] tree refresh failed', e); }

  const successResults = results.filter((r) => r.success);
  const failedResults = results.filter((r) => !r.success);
  const successCount = successResults.length;
  const failCount = failedResults.length;

  if (failCount > 0) {
    const failMessages = failedResults.map((r) => `${r.filename}: ${r.error}`).join('\n');
    const message = successCount > 0
      ? `${successCount} uploaded, ${failCount} failed:\n${failMessages}`
      : `Upload failed:\n${failMessages}`;
    notify(message, successCount > 0 ? 'warning' : 'error');
  } else {
    notify(`${successCount} file(s) uploaded`, 'success');
  }
}

export function activate() {
  if (activated) return;
  ensureContainer();
  activated = true;
}

export function deactivate() {
  if (!activated) return;
  if (containerEl && containerEl.parentNode) {
    containerEl.parentNode.removeChild(containerEl);
  }
  containerEl = null;
  activated = false;
}

export async function enqueue(files) {
  if (!Array.isArray(files) || files.length === 0) return;
  ensureContainer();
  containerEl.style.display = 'flex';

  const results = [];
  for (const item of files) {
    const file = item && item.file;
    const path = (item && item.path) || '/';
    if (!file) continue;
    try {
      const result = await uploadSingleFile(file, path);
      results.push(result);
    } catch (error) {
      results.push({ success: false, filename: file.name, error: error && error.message ? error.message : String(error) });
    }
  }

  await onAllUploadsComplete(results);
}
