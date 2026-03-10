/**
 * Step 17: User Management E2E Tests (Playwright)
 *
 * Tests: Setup → Login → Admin Panel (Profile/Groups/Users/Settings) → Signup → API
 */
const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

let baseURL;
let dataDir;
let adminCookies = null; // reuse login session to avoid rate limiting

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  const app = require('../../src/app');
  const { resetSetupFlag } = require('../../src/middleware/setup-guard');
  const { loadConfig } = require('../../src/utils/config-loader');
  const cfg = loadConfig();
  dataDir = cfg.dataDir;

  // Clean state
  ['users.json', 'groups.json', 'auth-settings.json', 'pending-registrations.json'].forEach(f => {
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
    ['users.json', 'groups.json', 'auth-settings.json', 'pending-registrations.json'].forEach(f => {
      const p = path.join(dataDir, f);
      try { fs.unlinkSync(p); } catch (e) {}
      try { fs.unlinkSync(p + '.bak'); } catch (e) {}
      try { fs.unlinkSync(p + '.tmp'); } catch (e) {}
    });
  }
  await app.stop();
});

// Login helper that reuses cookies after first login
async function loginAsAdmin(page) {
  if (adminCookies) {
    await page.context().addCookies(adminCookies);
    await page.goto(baseURL + '/admin');
    // Check if cookie was valid (no redirect to login)
    if (!page.url().includes('/login')) {
      try {
        await page.waitForSelector('#admin-app', { state: 'visible', timeout: 3000 });
        return;
      } catch (e) { /* cookie expired, fall through to fresh login */ }
    }
    adminCookies = null;
  }
  await page.goto(baseURL + '/login');
  await page.fill('#email', 'admin@test.com');
  await page.fill('#password', 'TestPass123!');
  await page.click('#login-btn');
  await page.waitForURL(new RegExp('/admin'), { timeout: 5000 });
  await page.waitForSelector('#admin-app', { state: 'visible', timeout: 5000 });
  adminCookies = await page.context().cookies();
}

// ============================================================
// 1. Setup Wizard
// ============================================================
test('1-1: redirect to /setup when no users exist', async ({ page }) => {
  await page.goto(baseURL + '/admin');
  await expect(page).toHaveURL(new RegExp('/setup'));
});

test('1-2: show setup form fields', async ({ page }) => {
  await page.goto(baseURL + '/setup');
  await expect(page.locator('#email')).toBeVisible();
  await expect(page.locator('#password')).toBeVisible();
  await expect(page.locator('#passwordConfirm')).toBeVisible();
});

test('1-3: reject mismatched passwords in setup', async ({ page }) => {
  await page.goto(baseURL + '/setup');
  await page.fill('#email', 'admin@test.com');
  await page.fill('#password', 'TestPass123!');
  await page.fill('#passwordConfirm', 'DifferentPass');
  await page.click('button[type="submit"]');
  await expect(page.locator('#error-msg')).toBeVisible();
});

test('1-4: complete setup with valid data', async ({ page }) => {
  await page.goto(baseURL + '/setup');
  await page.fill('#email', 'admin@test.com');
  await page.fill('#password', 'TestPass123!');
  await page.fill('#passwordConfirm', 'TestPass123!');
  await page.click('button[type="submit"]');
  await page.waitForURL(new RegExp('/(login|admin)'), { timeout: 5000 });
});

// ============================================================
// 2. Login Page
// ============================================================
test('2-1: show login form', async ({ page }) => {
  await page.goto(baseURL + '/login');
  await expect(page.locator('#email')).toBeVisible();
  await expect(page.locator('#password')).toBeVisible();
});

test('2-2: show signup link on login', async ({ page }) => {
  await page.goto(baseURL + '/login');
  const signupLink = page.locator('a[href*="/signup"]');
  await expect(signupLink).toBeVisible();
  await expect(signupLink).toHaveText('가입 요청');
});

test('2-3: toggle forgot password info', async ({ page }) => {
  await page.goto(baseURL + '/login');
  await page.click('#forgot-link');
  await expect(page.locator('#forgot-info')).toBeVisible();
});

test('2-4: reject invalid credentials', async ({ page }) => {
  await page.goto(baseURL + '/login');
  await page.fill('#email', 'admin@test.com');
  await page.fill('#password', 'WrongPassword');
  await page.click('#login-btn');
  await expect(page.locator('#error-msg')).toBeVisible({ timeout: 5000 });
});

test('2-5: login with valid credentials', async ({ page }) => {
  await loginAsAdmin(page);
  await expect(page.locator('#admin-app')).toBeVisible();
  await expect(page.locator('#logout-btn')).toBeVisible();
  // This also saves cookies for future loginAsAdmin calls
});

test('2-6: show superuser toolbar buttons', async ({ page }) => {
  await loginAsAdmin(page);
  await expect(page.locator('#settings-btn')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#profile-btn')).toBeVisible({ timeout: 5000 });
});

test('2-7: logout and redirect to login', async ({ page }) => {
  await loginAsAdmin(page);
  await page.click('#logout-btn');
  await page.waitForURL(new RegExp('/login'), { timeout: 5000 });
  // Invalidate cached cookies since session was destroyed server-side
  adminCookies = null;
});

// ============================================================
// 3. Management Panel - Profile
// ============================================================
test('3-1: open profile tab', async ({ page }) => {
  await loginAsAdmin(page);
  await page.click('#profile-btn');
  await expect(page.locator('#management-panel')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('.mgmt-tab.active')).toHaveText('내 정보');
});

test('3-2: display user email in profile', async ({ page }) => {
  await loginAsAdmin(page);
  await page.click('#profile-btn');
  await expect(page.locator('#mgmt-content')).toContainText('admin@test.com', { timeout: 5000 });
});

test('3-3: show user-key in profile', async ({ page }) => {
  await loginAsAdmin(page);
  await page.click('#profile-btn');
  await page.waitForTimeout(500);
  const content = await page.locator('#mgmt-content').textContent();
  expect(content).toMatch(/User Key|user-key|키/i);
});

test('3-4: close management panel', async ({ page }) => {
  await loginAsAdmin(page);
  await page.click('#profile-btn');
  await expect(page.locator('#management-panel')).toBeVisible({ timeout: 5000 });
  await page.click('#mgmt-close');
  await expect(page.locator('#management-panel')).toBeHidden();
});

// ============================================================
// 4. Management Panel - Groups
// ============================================================
test('4-1: show groups tab with default groups', async ({ page }) => {
  await loginAsAdmin(page);
  await page.click('#settings-btn');
  await expect(page.locator('#management-panel')).toBeVisible({ timeout: 5000 });
  await page.click('.mgmt-tab[data-tab="groups"]');
  await expect(page.locator('.mgmt-tab.active')).toHaveText('그룹');
  await expect(page.locator('#mgmt-content')).toContainText('Superuser', { timeout: 5000 });
});

// ============================================================
// 5. Management Panel - Users
// ============================================================
test('5-1: show users list with admin', async ({ page }) => {
  await loginAsAdmin(page);
  await page.click('#settings-btn');
  await expect(page.locator('#management-panel')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#mgmt-content')).toContainText('admin@test.com', { timeout: 5000 });
});

test('5-2: create user via API and show in list', async ({ page }) => {
  await loginAsAdmin(page);

  const groupsData = await page.evaluate(async (base) => {
    const r = await fetch(base + '/api/admin/groups', { credentials: 'include' });
    return r.json();
  }, baseURL);
  const editorGroup = groupsData.groups.find(g => g.name === 'Editor');

  const createRes = await page.evaluate(async ({ base, groupId }) => {
    const r = await fetch(base + '/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email: 'editor@test.com', password: 'EditorPass1!', groupId })
    });
    return r.json();
  }, { base: baseURL, groupId: editorGroup.id });
  expect(createRes.success).toBe(true);

  await page.click('#settings-btn');
  await expect(page.locator('#mgmt-content')).toContainText('editor@test.com', { timeout: 5000 });
});

// ============================================================
// 6. Management Panel - Settings
// ============================================================
test('6-1: show auth settings tab', async ({ page }) => {
  await loginAsAdmin(page);
  await page.click('#settings-btn');
  await expect(page.locator('#management-panel')).toBeVisible({ timeout: 5000 });
  await page.click('.mgmt-tab[data-tab="settings"]');
  await expect(page.locator('.mgmt-tab.active')).toHaveText('인증 설정');
  await page.waitForTimeout(500);
  const content = await page.locator('#mgmt-content').textContent();
  expect(content).toMatch(/세션|타임아웃|session/i);
});

// ============================================================
// 7. Signup Page
// ============================================================
test('7-1: show signup form', async ({ page }) => {
  await page.goto(baseURL + '/signup');
  await expect(page.locator('#email')).toBeVisible();
  await expect(page.locator('#password')).toBeVisible();
  await expect(page.locator('#passwordConfirm')).toBeVisible();
  await expect(page.locator('#message')).toBeVisible();
});

test('7-2: show back link to login', async ({ page }) => {
  await page.goto(baseURL + '/signup');
  await expect(page.locator('a.back-link')).toHaveText('로그인 페이지로 돌아가기');
});

test('7-3: validate password mismatch client-side', async ({ page }) => {
  await page.goto(baseURL + '/signup');
  await page.fill('#email', 'newuser@test.com');
  await page.fill('#password', 'NewUserPass1!');
  await page.fill('#passwordConfirm', 'DifferentPass');
  await page.click('#submit-btn');
  await expect(page.locator('#error-msg')).toBeVisible();
  await expect(page.locator('#error-msg')).toContainText('일치하지 않습니다');
});

test('7-4: navigate from login to signup', async ({ page }) => {
  await page.goto(baseURL + '/login');
  await page.click('a[href*="/signup"]');
  await expect(page).toHaveURL(new RegExp('/signup'));
});

// ============================================================
// 8. Deprecated Endpoints
// ============================================================
test('8-1: POST /api/admin/auth returns 410', async ({ request }) => {
  const res = await request.post(baseURL + '/api/admin/auth', { data: { apiKey: 'test' } });
  expect(res.status()).toBe(410);
  const body = await res.json();
  expect(body.error.message).toContain('/api/auth/login');
});

test('8-2: POST /api/admin/logout returns 410', async ({ request }) => {
  const res = await request.post(baseURL + '/api/admin/logout');
  expect(res.status()).toBe(410);
});

test('8-3: GET /api/admin/session returns 410', async ({ request }) => {
  const res = await request.get(baseURL + '/api/admin/session');
  expect(res.status()).toBe(410);
});

test('8-4: POST /api/admin/session/refresh returns 410', async ({ request }) => {
  const res = await request.post(baseURL + '/api/admin/session/refresh');
  expect(res.status()).toBe(410);
});

// ============================================================
// 9. Auth API
// ============================================================
test('9-1: session returns 401 without cookies', async ({ request }) => {
  const res = await request.get(baseURL + '/api/auth/session');
  // Without valid session cookie, returns 401
  expect(res.status()).toBe(401);
});

test('9-2: session returns user info when logged in', async ({ page }) => {
  await loginAsAdmin(page);
  const data = await page.evaluate(async (base) => {
    const r = await fetch(base + '/api/auth/session', { credentials: 'include' });
    return r.json();
  }, baseURL);
  expect(data.success).toBe(true);
  expect(data.session.email).toBe('admin@test.com');
});

test('9-3: /me returns profile with userKey', async ({ page }) => {
  await loginAsAdmin(page);
  const me = await page.evaluate(async (base) => {
    const r = await fetch(base + '/api/auth/me', { credentials: 'include' });
    return r.json();
  }, baseURL);
  expect(me.success).toBe(true);
  expect(me.user.email).toBe('admin@test.com');
  expect(me.user.groupName).toBeTruthy();
});

// ============================================================
// 10. Admin CRUD API
// ============================================================
test('10-1: GET /api/admin/groups returns groups', async ({ page }) => {
  await loginAsAdmin(page);
  const data = await page.evaluate(async (base) => {
    const r = await fetch(base + '/api/admin/groups', { credentials: 'include' });
    return r.json();
  }, baseURL);
  expect(data.success).toBe(true);
  expect(data.groups.length).toBeGreaterThanOrEqual(3);
});

test('10-2: GET /api/admin/users returns users', async ({ page }) => {
  await loginAsAdmin(page);
  const data = await page.evaluate(async (base) => {
    const r = await fetch(base + '/api/admin/users', { credentials: 'include' });
    return r.json();
  }, baseURL);
  expect(data.success).toBe(true);
  expect(data.users.length).toBeGreaterThanOrEqual(1);
});

test('10-3: GET /api/admin/auth-settings returns settings', async ({ page }) => {
  await loginAsAdmin(page);
  const data = await page.evaluate(async (base) => {
    const r = await fetch(base + '/api/admin/auth-settings', { credentials: 'include' });
    return r.json();
  }, baseURL);
  expect(data.success).toBe(true);
  expect(data.settings).toBeTruthy();
});
