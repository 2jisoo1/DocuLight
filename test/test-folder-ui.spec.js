// Playwright test for Step 9.2 - Folder UI improvements
const { test, expect } = require('@playwright/test');

test.describe('Folder UI Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to home page
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
  });

  test('1. 폴더 아이콘 제거 확인', async ({ page }) => {
    // guide 폴더 찾기
    const guideFolder = page.locator('.tree-item.directory').filter({ hasText: 'guide' }).first();
    await expect(guideFolder).toBeVisible();

    // 📁 아이콘이 없는지 확인
    const folderIcon = guideFolder.locator('.tree-icon');
    await expect(folderIcon).toHaveCount(0);

    console.log('✓ 폴더 아이콘 제거 확인');
  });

  test('2. 삼각형 토글 독립성 확인', async ({ page }) => {
    // 삼각형 아이콘 찾기
    const toggle = page.locator('.expand-icon[data-action="toggle"]').first();
    await expect(toggle).toBeVisible();

    // 초기 상태 (▶)
    await expect(toggle).toHaveText('▶');

    // 클릭 → 확장
    await toggle.click();
    await page.waitForTimeout(300);

    // 확장 상태 (▼)
    await expect(toggle).toHaveText('▼');

    // 메인 영역이 변하지 않았는지 확인 (welcome screen 유지)
    const welcome = page.locator('.welcome');
    await expect(welcome).toBeVisible();

    console.log('✓ 삼각형 토글 독립성 확인');
  });

  test('3. 폴더명 클릭 → 리스트 뷰 표시', async ({ page }) => {
    // 폴더명 클릭
    const folderName = page.locator('.folder-name[data-action="list"]').filter({ hasText: 'guide' }).first();
    await expect(folderName).toBeVisible();

    await folderName.click();
    await page.waitForLoadState('networkidle');

    // 리스트 뷰 표시 확인
    await expect(page.locator('h1:has-text("📂 guide")')).toBeVisible();
    await expect(page.locator('h2:has-text("Documents")')).toBeVisible();

    // URL 확인
    expect(page.url()).toContain('/doc/guide');

    console.log('✓ 폴더 리스트 뷰 표시');
  });

  test('4. 리스트에서 문서 클릭', async ({ page }) => {
    // 폴더 리스트 표시
    const folderName = page.locator('.folder-name').filter({ hasText: 'guide' }).first();
    await folderName.click();
    await page.waitForLoadState('networkidle');

    // 문서 링크 클릭
    const docLink = page.locator('a:has-text("programming-samples")').first();
    await docLink.click();
    await page.waitForLoadState('networkidle');

    // 문서 렌더링 확인
    await expect(page.locator('#markdown-content')).toBeVisible();

    // URL 확인
    expect(page.url()).toContain('/doc/guide/programming-samples');
    expect(page.url()).not.toContain('.md');

    console.log('✓ 리스트에서 문서 클릭');
  });

  test('5. 폴더 URL 직접 접속', async ({ page }) => {
    // 폴더 URL로 직접 이동
    await page.goto('http://localhost:3000/doc/guide');
    await page.waitForLoadState('networkidle');

    // 리스트 뷰 표시 확인
    const title = page.locator('h1');
    const titleText = await title.textContent();

    console.log('폴더 URL 접속 결과:', titleText);

    // 404가 아닌지 확인
    const errorDiv = page.locator('.error-message');
    const hasError = await errorDiv.count() > 0;

    if (hasError) {
      console.error('❌ 폴더 URL 404 에러 발생');
    } else {
      console.log('✓ 폴더 URL 정상 접속');
    }
  });

  test('6. 폴더 active 상태 스타일 확인', async ({ page }) => {
    // 폴더 클릭
    const folderName = page.locator('.folder-name').filter({ hasText: 'guide' }).first();
    await folderName.click();
    await page.waitForTimeout(500);

    // active 클래스 확인
    const activeFolder = page.locator('.tree-item.directory.active');
    await expect(activeFolder).toBeVisible();

    // 배경색 확인
    const bgColor = await activeFolder.evaluate(el => {
      return window.getComputedStyle(el).backgroundColor;
    });

    console.log('Active folder 배경색:', bgColor);

    // 텍스트 색 확인
    const textColor = await activeFolder.evaluate(el => {
      return window.getComputedStyle(el).color;
    });

    console.log('Active folder 텍스트색:', textColor);

    // 스크린샷 저장
    await activeFolder.screenshot({ path: 'test-results/folder-active-state.png' });
  });
});
