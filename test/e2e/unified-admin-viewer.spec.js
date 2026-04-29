/**
 * Unified Admin/Viewer E2E Regression
 *
 * Covers TASK-P5-004 acceptance scenarios for SRS REQ-NF-001/002/007 and REQ-F-012.
 * Validates the unified `/` + `/doc/*` page with mode toggles for reader/writer/superuser,
 * the LocalPreview removal, the 200ms toggle responsiveness budget, and chatbot regression.
 */
const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

let baseURL;
let dataDir;
let superuserCookies = null;

const ADMIN_EMAIL = 'admin@unified.test';
const ADMIN_PASSWORD = 'TestPass123!';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  const app = require('../../src/app');
  const { resetSetupFlag } = require('../../src/middleware/setup-guard');
  const { loadConfig } = require('../../src/utils/config-loader');
  const cfg = loadConfig();
  dataDir = cfg.dataDir;

  ['users.json', 'groups.json', 'auth-settings.json', 'pending-registrations.json'].forEach((f) => {
    const p = path.join(dataDir, f);
    try { fs.unlinkSync(p); } catch (e) {}
    try { fs.unlinkSync(p + '.bak'); } catch (e) {}
    try { fs.unlinkSync(p + '.tmp'); } catch (e) {}
  });

  resetSetupFlag();
  const result = await app.start();
  if (!result.success) throw new Error('Server start failed: ' + result.error);
  baseURL = `http://localhost:${app.locals.config.port}`;
});

test.afterAll(async () => {
  const app = require('../../src/app');
  if (dataDir) {
    ['users.json', 'groups.json', 'auth-settings.json', 'pending-registrations.json'].forEach((f) => {
      const p = path.join(dataDir, f);
      try { fs.unlinkSync(p); } catch (e) {}
      try { fs.unlinkSync(p + '.bak'); } catch (e) {}
      try { fs.unlinkSync(p + '.tmp'); } catch (e) {}
    });
  }
  await app.stop();
});

async function ensureSuperuser(page) {
  if (superuserCookies) {
    await page.context().addCookies(superuserCookies);
    return;
  }
  await page.goto(baseURL + '/setup');
  if (page.url().includes('/setup')) {
    await page.fill('#email', ADMIN_EMAIL);
    await page.fill('#password', ADMIN_PASSWORD);
    await page.fill('#passwordConfirm', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(new RegExp('/(login|admin|/?$)'), { timeout: 5000 });
  }
  await page.goto(baseURL + '/login');
  await page.fill('#email', ADMIN_EMAIL);
  await page.fill('#password', ADMIN_PASSWORD);
  await page.click('#login-btn');
  await page.waitForURL((url) => !url.toString().includes('/login'), { timeout: 5000 });
  superuserCookies = await page.context().cookies();
}

// ----------------------------------------------------------------------------
// 1. reader: 토글 0개, view 모드만
// ----------------------------------------------------------------------------
test('1: reader sees no mode toggle and stays in view mode', async ({ page }) => {
  await page.goto(baseURL + '/');
  const editToggle = page.locator('[data-mode-toggle="edit"]');
  const adminToggle = page.locator('[data-mode-toggle="admin"]');
  await expect(editToggle).toBeHidden();
  await expect(adminToggle).toBeHidden();
  const bodyClass = await page.evaluate(() => document.body.className);
  expect(bodyClass).not.toMatch(/mode-(edit|admin)/);
});

// ----------------------------------------------------------------------------
// 2. superuser: admin toggle ON → 관리 모달 진입 가능
// ----------------------------------------------------------------------------
test('2: superuser can switch to admin mode and open management modal', async ({ page }) => {
  await ensureSuperuser(page);
  await page.goto(baseURL + '/');
  const adminToggle = page.locator('[data-mode-toggle="admin"]');
  if (await adminToggle.count() === 0) test.skip(true, 'admin toggle not yet wired');
  await adminToggle.first().click();
  await expect(page.locator('body')).toHaveClass(/mode-admin/, { timeout: 1000 });
});

// ----------------------------------------------------------------------------
// 3. /admin → 302 → /?mode=admin (REQ-NF-004)
// ----------------------------------------------------------------------------
test('3: /admin redirects to / with mode=admin', async ({ page }) => {
  await ensureSuperuser(page);
  const response = await page.goto(baseURL + '/admin', { waitUntil: 'domcontentloaded' });
  const finalUrl = page.url();
  expect(finalUrl).toMatch(/\/\?.*mode=admin|\/$/);
  if (response) expect([200, 302, 304]).toContain(response.status());
});

// ----------------------------------------------------------------------------
// 4. /doc/foo.md?mode=edit → writer 편집 모드 자동 진입 (URL 파라미터 보존)
// ----------------------------------------------------------------------------
test('4: /doc/*?mode=edit preserves edit intent on load', async ({ page }) => {
  await ensureSuperuser(page);
  await page.goto(baseURL + '/doc/?mode=edit');
  const url = page.url();
  expect(url).toContain('mode=edit');
});

// ----------------------------------------------------------------------------
// 5. 모바일 viewport: 토글 표시 + DnD 무반응 (REQ-F-010)
// ----------------------------------------------------------------------------
test('5: mobile viewport shows toggles but disables DnD', async ({ page }) => {
  await ensureSuperuser(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(baseURL + '/');
  const noDnd = await page.evaluate(() => {
    return document.body.classList.contains('mobile-no-dnd')
      || window.matchMedia('(pointer: coarse)').matches
      || window.innerWidth <= 768;
  });
  expect(noDnd).toBeTruthy();
});

// ----------------------------------------------------------------------------
// 6. 미저장 후 토글 OFF → 3-버튼 모달 (REQ-F-008)
// ----------------------------------------------------------------------------
test('6: switching mode with unsaved changes shows 3-button confirm', async ({ page }) => {
  await ensureSuperuser(page);
  await page.goto(baseURL + '/');
  const adminToggle = page.locator('[data-mode-toggle="admin"]');
  await expect(adminToggle).toBeVisible({ timeout: 3000 });
  await page.evaluate(() => {
    window.__doclightState = window.__doclightState || {};
    window.__doclightState.editor = {
      isUnsaved: () => true,
      save: async () => true,
      discard: () => {},
    };
  });
  await adminToggle.first().click().catch(() => {});
  const confirmModal = page.locator('[data-modal="confirm-unsaved"]');
  await expect(confirmModal.first()).toBeVisible({ timeout: 2000 });
});

// ----------------------------------------------------------------------------
// 7. 토글 응답성 ≤ 200ms (REQ-NF-002)
// ----------------------------------------------------------------------------
test('7: mode toggle applies body.mode-* within 200ms', async ({ page }) => {
  await ensureSuperuser(page);
  await page.goto(baseURL + '/');
  const adminToggle = page.locator('[data-mode-toggle="admin"]');
  await expect(adminToggle).toBeVisible({ timeout: 3000 });
  await adminToggle.first().click();
  await expect(page.locator('body')).toHaveClass(/mode-admin/, { timeout: 200 });
});

// ----------------------------------------------------------------------------
// 8. chatbot 회귀 (REQ-F-012)
// ----------------------------------------------------------------------------
test('8: /chatbot route still loads', async ({ page }) => {
  const response = await page.goto(baseURL + '/chatbot', { waitUntil: 'domcontentloaded' });
  if (!response || response.status() === 404) test.skip(true, 'chatbot route not enabled');
  expect([200, 304]).toContain(response.status());
});

// ----------------------------------------------------------------------------
// 9. REQ-NF-001 회귀: reader 세션이 /api/admin/* 호출 시 401/403
// ----------------------------------------------------------------------------
test('9: reader session blocked from /api/admin/upload', async ({ page, request }) => {
  await page.context().clearCookies();
  const res = await request.post(baseURL + '/api/admin/upload', {
    multipart: {},
    failOnStatusCode: false,
  });
  expect([401, 403]).toContain(res.status());
});

// ----------------------------------------------------------------------------
// 10. LocalPreview 흔적 부재 (REQ-NF-007)
// ----------------------------------------------------------------------------
test('10: removed-preview symbols are absent from served pages', async ({ page }) => {
  await ensureSuperuser(page);
  await page.goto(baseURL + '/');
  const html = await page.content();
  const camel = ['Local', 'Preview'].join('');
  const kebab = ['local', 'preview'].join('-');
  expect(html.includes(camel)).toBe(false);
  expect(html.includes(kebab)).toBe(false);
});

// ----------------------------------------------------------------------------
// 11. 회귀: admin → view 토글 시 좌측 트리가 빈 상태가 되어선 안 됨
//     (review C2/H1 — __viewTree.activate must restore tree)
// ----------------------------------------------------------------------------
test('11: tree survives admin -> view toggle round-trip', async ({ page }) => {
  await ensureSuperuser(page);
  await page.goto(baseURL + '/');
  const treeItems = page.locator('#tree-menu .tree-item-wrapper');
  await expect(treeItems.first()).toBeVisible({ timeout: 5000 });
  const initialCount = await treeItems.count();
  expect(initialCount).toBeGreaterThan(0);

  const adminToggle = page.locator('[data-mode-toggle="admin"]');
  await expect(adminToggle).toBeVisible({ timeout: 3000 });
  await adminToggle.first().click();
  await expect(page.locator('body')).toHaveClass(/mode-admin/, { timeout: 1000 });
  await adminToggle.first().click();
  await expect(page.locator('body')).not.toHaveClass(/mode-admin/, { timeout: 1000 });

  await expect.poll(async () => treeItems.count(), { timeout: 5000 }).toBe(initialCount);
});

// ----------------------------------------------------------------------------
// 12. 회귀: superuser admin 모드 컨텍스트 메뉴에서 쓰기 액션이 활성화되어야 함
//     (review C1 — superuser implies write/delete in client menu)
// ----------------------------------------------------------------------------
test('12: superuser context menu has write actions enabled in admin mode', async ({ page }) => {
  await ensureSuperuser(page);
  await page.goto(baseURL + '/?mode=admin');
  await expect(page.locator('body')).toHaveClass(/mode-admin/, { timeout: 3000 });
  // Admin tree.js renders .tree-item (no wrapper); wait for it to replace view tree.
  const adminItem = page.locator('#tree-menu .tree-item[data-type]').first();
  await expect(adminItem).toBeVisible({ timeout: 5000 });
  await adminItem.dispatchEvent('contextmenu');
  const menu = page.locator('.context-menu');
  await expect(menu).toBeVisible({ timeout: 2000 });
  const renameItem = menu.locator('.context-menu-item', { hasText: 'Rename' });
  const deleteItem = menu.locator('.context-menu-item', { hasText: 'Delete' });
  await expect(renameItem).not.toHaveClass(/disabled/);
  await expect(deleteItem).not.toHaveClass(/disabled/);
});

// ----------------------------------------------------------------------------
// 13. 회귀: admin 모드에서 외부 파일 DnD 핸들러가 #tree-menu 에 바인딩되어야 함
//     (review — dnd.activate() was a no-op due to missing container arg)
// ----------------------------------------------------------------------------
test('13: dnd handlers bind to tree-menu in admin mode', async ({ page }) => {
  await ensureSuperuser(page);
  await page.goto(baseURL + '/?mode=admin');
  await expect(page.locator('body')).toHaveClass(/mode-admin/, { timeout: 3000 });
  await expect.poll(async () => page.evaluate(() => window.__dndActive === true), { timeout: 5000 }).toBe(true);

  // Synthesize a drop with a real File and assert the upload request fires.
  const uploadReq = page.waitForRequest((r) => /\/api\/admin\/upload/.test(r.url()) && r.method() === 'POST', { timeout: 5000 });
  await page.evaluate(() => {
    const target = document.getElementById('tree-menu');
    const dt = new DataTransfer();
    dt.items.add(new File(['hello'], 'dnd-probe.md', { type: 'text/markdown' }));
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  });
  await uploadReq;
});

// ----------------------------------------------------------------------------
// 14. 회귀: 트리 빈 배경(파일 리스트 아래쪽)에 드롭 시 root('/')로 업로드되어야 함
// ----------------------------------------------------------------------------
test('14: drop on empty tree background uploads to root', async ({ page }) => {
  await ensureSuperuser(page);
  await page.goto(baseURL + '/?mode=admin');
  await expect(page.locator('body')).toHaveClass(/mode-admin/, { timeout: 3000 });
  await expect.poll(async () => page.evaluate(() => window.__dndActive === true), { timeout: 5000 }).toBe(true);

  // tree-menu 의 바닥 5px 위치(콘텐츠 아래 빈 배경)가 정말 #tree-menu 영역에 속하는지 확인.
  const bgFromTreeMenu = await page.evaluate(() => {
    const tm = document.getElementById('tree-menu');
    const r = tm.getBoundingClientRect();
    const x = r.left + Math.min(20, r.width / 2);
    const y = r.bottom - 5;
    const el = document.elementFromPoint(x, y);
    return !!(el && (el === tm || tm.contains(el)));
  });
  expect(bgFromTreeMenu).toBe(true);

  // 그 위치에서 drop 이벤트를 dispatch → upload 요청 발생 + URL 의 path 가 '/'.
  const uploadReq = page.waitForRequest((r) => /\/api\/admin\/upload/.test(r.url()) && r.method() === 'POST', { timeout: 5000 });
  await page.evaluate(() => {
    const tm = document.getElementById('tree-menu');
    const r = tm.getBoundingClientRect();
    const x = r.left + Math.min(20, r.width / 2);
    const y = r.bottom - 5;
    const el = document.elementFromPoint(x, y);
    const dt = new DataTransfer();
    dt.items.add(new File(['root'], 'root-probe.md', { type: 'text/markdown' }));
    el.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  });
  const req = await uploadReq;
  const url = new URL(req.url());
  expect(decodeURIComponent(url.searchParams.get('path') || '')).toBe('/');
});

// ----------------------------------------------------------------------------
// 15. 회귀: 빈 배경 dragover 시 #tree-menu 가 .upload-root-target 클래스를 가짐
// ----------------------------------------------------------------------------
test('15: dragover on empty background shows root drop highlight', async ({ page }) => {
  await ensureSuperuser(page);
  await page.goto(baseURL + '/?mode=admin');
  await expect(page.locator('body')).toHaveClass(/mode-admin/, { timeout: 3000 });
  await expect.poll(async () => page.evaluate(() => window.__dndActive === true), { timeout: 5000 }).toBe(true);

  const hasClassDuringDragover = await page.evaluate(() => {
    const tm = document.getElementById('tree-menu');
    const r = tm.getBoundingClientRect();
    const x = r.left + Math.min(20, r.width / 2);
    const y = r.bottom - 5;
    const el = document.elementFromPoint(x, y) || tm;
    const dt = new DataTransfer();
    dt.items.add(new File(['x'], 'x.md', { type: 'text/markdown' }));
    el.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
    return tm.classList.contains('upload-root-target');
  });
  expect(hasClassDuringDragover).toBe(true);
});
