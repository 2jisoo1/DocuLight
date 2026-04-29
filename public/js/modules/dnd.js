// public/js/modules/dnd.js
// 좌측 트리 컨테이너에서 OS 파일/폴더 드롭을 받아 upload.js 큐로 전달.
// admin.js UploadModule(라인 2603-2725) 의 외부 드롭 처리 부분을 ESM 으로 이식.
// 내부 항목 이동(DragDropModule, admin.js:2077-2304) 은 tree.js 가 window.DragDropModule
// 을 통해 사용하므로 본 모듈에서는 다루지 않는다.

import { isMobileNoDnd } from './mode.js';
import { enqueue } from './upload.js';

let containerEl = null;
let onDragOver = null;
let onDragLeave = null;
let onDrop = null;

function hasFileType(dt) {
  if (!dt || !dt.types) return false;
  for (let i = 0; i < dt.types.length; i++) {
    if (dt.types[i] === 'Files') return true;
  }
  return false;
}

function getTargetPath(event) {
  const treeItem = event.target.closest && event.target.closest('.tree-item');
  if (treeItem && treeItem.dataset.type === 'directory' && treeItem.dataset.path) {
    return treeItem.dataset.path;
  }
  return '/';
}

function clearHighlight() {
  if (!containerEl) return;
  containerEl.querySelectorAll('.upload-dir-target').forEach((el) => {
    el.classList.remove('upload-dir-target');
  });
}

function getFileFromEntry(fileEntry) {
  return new Promise((resolve) => {
    fileEntry.file(
      (file) => resolve(file),
      () => resolve(null)
    );
  });
}

function readDirectoryRecursive(directoryEntry, basePath) {
  return new Promise((resolve) => {
    const files = [];
    const reader = directoryEntry.createReader();

    const readEntries = () => {
      reader.readEntries(async (entries) => {
        if (entries.length === 0) {
          resolve(files);
          return;
        }
        for (const entry of entries) {
          if (entry.isFile) {
            const file = await getFileFromEntry(entry);
            if (file) files.push({ file, relativePath: basePath });
          } else if (entry.isDirectory) {
            const subFiles = await readDirectoryRecursive(entry, basePath + '/' + entry.name);
            files.push(...subFiles);
          }
        }
        readEntries();
      });
    };

    readEntries();
  });
}

async function collectFiles(dataTransfer) {
  const fallback = Array.from(dataTransfer.files || []);
  const out = [];

  if (dataTransfer.items && dataTransfer.items.length > 0) {
    const items = Array.from(dataTransfer.items);
    for (const item of items) {
      if (item.kind !== 'file') continue;
      const entry = (typeof item.webkitGetAsEntry === 'function') ? item.webkitGetAsEntry() : null;
      if (entry && entry.isDirectory) {
        try {
          const dirFiles = await readDirectoryRecursive(entry, entry.name);
          out.push(...dirFiles);
        } catch (err) {
          console.error('[dnd] failed to read directory:', err);
        }
      } else {
        const file = item.getAsFile();
        if (file) out.push({ file, relativePath: '' });
      }
    }
    if (out.length > 0) return out;
  }

  return fallback.map((file) => ({ file, relativePath: '' }));
}

export function activate(treeContainerEl) {
  if (!treeContainerEl) return;
  if (isMobileNoDnd()) return;
  if (containerEl) deactivate();

  containerEl = treeContainerEl;

  onDragOver = (e) => {
    if (!hasFileType(e.dataTransfer)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';

    const treeItem = e.target.closest && e.target.closest('.tree-item');
    clearHighlight();
    if (treeItem && treeItem.dataset.type === 'directory') {
      treeItem.classList.add('upload-dir-target');
    }
  };

  onDragLeave = (e) => {
    if (!hasFileType(e.dataTransfer)) return;
    e.preventDefault();
    e.stopPropagation();
    if (!containerEl.contains(e.relatedTarget)) {
      clearHighlight();
    }
  };

  onDrop = async (e) => {
    if (!hasFileType(e.dataTransfer)) return;
    e.preventDefault();
    e.stopPropagation();
    clearHighlight();

    const targetPath = getTargetPath(e);
    const files = await collectFiles(e.dataTransfer);
    if (files.length === 0) return;

    const enriched = files.map(({ file, relativePath }) => ({
      file,
      path: relativePath
        ? (targetPath === '/' ? '/' + relativePath : targetPath + '/' + relativePath)
        : targetPath
    }));

    try {
      await enqueue(enriched);
    } catch (err) {
      console.error('[dnd] enqueue failed:', err);
    }
  };

  containerEl.addEventListener('dragover', onDragOver);
  containerEl.addEventListener('dragleave', onDragLeave);
  containerEl.addEventListener('drop', onDrop);
}

export function deactivate() {
  if (!containerEl) return;
  if (onDragOver) containerEl.removeEventListener('dragover', onDragOver);
  if (onDragLeave) containerEl.removeEventListener('dragleave', onDragLeave);
  if (onDrop) containerEl.removeEventListener('drop', onDrop);
  clearHighlight();
  containerEl = null;
  onDragOver = null;
  onDragLeave = null;
  onDrop = null;
}
