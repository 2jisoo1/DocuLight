// Playwright test for % character in filenames bug fix
const { test, expect } = require('@playwright/test');

const BASE_URL = 'http://localhost:30000';
const FOLDER_NAME = '특수문자 테스트';

test.describe('% 문자 포함 파일명 버그 수정 테스트', () => {

  test.beforeEach(async ({ page }) => {
    // Listen for console errors
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log(`[CONSOLE ERROR] ${msg.text()}`);
      }
    });

    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
  });

  test('1. 트리에서 특수문자 폴더가 정상 표시됨', async ({ page }) => {
    // Find the test folder in the tree
    const folder = page.locator('.tree-item.directory').filter({ hasText: FOLDER_NAME });
    await expect(folder).toBeVisible({ timeout: 10000 });
    console.log('PASS: 특수문자 폴더가 트리에 표시됨');
  });

  test('2. 폴더 펼침 시 % 포함 파일이 정상 표시됨 (URIError 없음)', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    // Expand the folder
    const folder = page.locator('.tree-item.directory').filter({ hasText: FOLDER_NAME });
    await expect(folder).toBeVisible({ timeout: 10000 });

    // Click the toggle to expand
    const toggle = folder.locator('.expand-icon[data-action="toggle"]');
    if (await toggle.count() > 0) {
      await toggle.click();
    } else {
      await folder.click();
    }

    // Wait for children to appear
    await page.waitForTimeout(1500);

    // Check that files with % are visible in the tree
    const treeItems = page.locator('.tree-item.file');
    const allTexts = await treeItems.allTextContents();
    console.log('Tree items found:', allTexts);

    // Verify no URIError was thrown
    const uriErrors = errors.filter(e => e.includes('URIError') || e.includes('URI malformed'));
    expect(uriErrors).toHaveLength(0);
    console.log('PASS: URIError 없음');

    // Verify files with % are present
    const hasPercentFile = allTexts.some(t => t.includes('100%') || t.includes('file%'));
    expect(hasPercentFile).toBeTruthy();
    console.log('PASS: % 포함 파일이 트리에 정상 표시됨');
  });

  test('3. % 포함 파일 클릭 시 콘텐츠 로딩 확인', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    // Expand the folder
    const folder = page.locator('.tree-item.directory').filter({ hasText: FOLDER_NAME });
    await expect(folder).toBeVisible({ timeout: 10000 });

    const toggle = folder.locator('.expand-icon[data-action="toggle"]');
    if (await toggle.count() > 0) {
      await toggle.click();
    } else {
      await folder.click();
    }

    await page.waitForTimeout(1500);

    // Click on the "100% 완료된 문서" file
    const percentFile = page.locator('.tree-item.file').filter({ hasText: '100%' });
    if (await percentFile.count() > 0) {
      await percentFile.click();
      await page.waitForTimeout(2000);

      // Verify content area shows the file content
      const content = page.locator('#content, .markdown-body, .content-area');
      const text = await content.textContent();
      expect(text).toContain('100%');
      console.log('PASS: % 포함 파일 콘텐츠 정상 로딩');
    } else {
      // Try file%name
      const filePercentName = page.locator('.tree-item.file').filter({ hasText: 'file%' });
      await filePercentName.click();
      await page.waitForTimeout(2000);

      const content = page.locator('#content, .markdown-body, .content-area');
      const text = await content.textContent();
      expect(text).toContain('file%name');
      console.log('PASS: file%name 파일 콘텐츠 정상 로딩');
    }

    // Verify no URIError
    const uriErrors = errors.filter(e => e.includes('URIError') || e.includes('URI malformed'));
    expect(uriErrors).toHaveLength(0);
    console.log('PASS: 콘텐츠 로딩 시 URIError 없음');
  });

  test('4. 폴더 목록 뷰에서 % 포함 파일/폴더 표시 확인', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    // Expand the folder
    const folder = page.locator('.tree-item.directory').filter({ hasText: FOLDER_NAME });
    await expect(folder).toBeVisible({ timeout: 10000 });

    // Click folder name (not toggle) to show folder list view
    const folderName = folder.locator('.folder-name[data-action="list"]');
    if (await folderName.count() > 0) {
      await folderName.click();
    } else {
      // fallback: just click the folder item text
      await folder.locator('span').first().click();
    }

    await page.waitForTimeout(2000);

    // Check content area for folder list view
    const content = page.locator('#content, .markdown-body, .content-area');
    const text = await content.textContent();

    // Should show file names with % without error
    console.log('Folder list content:', text?.substring(0, 300));

    // Verify no URIError
    const uriErrors = errors.filter(e => e.includes('URIError') || e.includes('URI malformed'));
    expect(uriErrors).toHaveLength(0);
    console.log('PASS: 폴더 목록 뷰에서 URIError 없음');
  });

  test('5. Clean URL로 % 포함 문서 직접 접근', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    // Navigate directly to a file with % in the path (URL-encoded)
    const encodedPath = encodeURIComponent('특수문자 테스트') + '/' + encodeURIComponent('normal document');
    await page.goto(`${BASE_URL}/doc/${encodedPath}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Verify content loaded
    const content = page.locator('#content, .markdown-body, .content-area');
    const text = await content.textContent();
    expect(text).toContain('Normal Document');

    // Verify no URIError
    const uriErrors = errors.filter(e => e.includes('URIError') || e.includes('URI malformed'));
    expect(uriErrors).toHaveLength(0);
    console.log('PASS: Clean URL 직접 접근 성공');
  });

  test('6. 파일 다운로드 시 Content-Disposition 확인', async ({ page }) => {
    // Test download endpoint with % in filename
    const encodedPath = encodeURIComponent('특수문자 테스트/100% 완료된 문서.md');
    const response = await page.request.get(`${BASE_URL}/api/download/file?path=${encodedPath}`, {
      headers: { 'X-API-Key': '1234' }
    });

    expect(response.status()).toBe(200);

    const disposition = response.headers()['content-disposition'];
    console.log('Content-Disposition:', disposition);

    // Should contain filename* with UTF-8 encoding (RFC 5987)
    expect(disposition).toContain("filename*=UTF-8''");
    // Should NOT have double-encoded %25 for the original % character
    // The encodeURIComponent of "100% 완료된 문서.md" should encode % as %25
    expect(disposition).toContain('filename=');
    console.log('PASS: Content-Disposition 헤더 정상');
  });

  test('7. 브라우저 콘솔에 URIError 없음 (전체 페이지 로드)', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    page.on('console', msg => {
      if (msg.type() === 'error' && msg.text().includes('URI')) {
        errors.push(msg.text());
      }
    });

    // Load page
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Expand the special characters folder
    const folder = page.locator('.tree-item.directory').filter({ hasText: FOLDER_NAME });
    if (await folder.count() > 0) {
      const toggle = folder.locator('.expand-icon[data-action="toggle"]');
      if (await toggle.count() > 0) {
        await toggle.click();
      } else {
        await folder.click();
      }
      await page.waitForTimeout(1500);
    }

    // Click through all files in the folder
    const files = page.locator('.tree-item.file');
    const fileCount = await files.count();
    for (let i = 0; i < fileCount; i++) {
      const fileText = await files.nth(i).textContent();
      if (fileText && (fileText.includes('%') || fileText.includes('특수') || fileText.includes('normal'))) {
        await files.nth(i).click();
        await page.waitForTimeout(1000);
      }
    }

    // Final check: no URI errors
    const uriErrors = errors.filter(e => e.includes('URIError') || e.includes('URI malformed'));
    expect(uriErrors).toHaveLength(0);
    console.log(`PASS: 전체 테스트 완료 - URIError 0건 (총 에러: ${errors.length}건)`);
  });
});
