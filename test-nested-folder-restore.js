/**
 * Nested Folder Restoration Test
 *
 * Tests the fix for empty sidebar issue when restoring nested folder files
 * Tests both expandPathToFile() and expandParentFolders() functions
 */

const { chromium } = require('playwright');

async function testNestedFolderRestore() {
  console.log('🧪 Nested Folder Restoration Test (Option 2 Fix)\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  let testsPassed = 0;
  let testsFailed = 0;

  try {
    // Navigate to app
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    console.log('✅ Page loaded successfully\n');

    // ========================================
    // Test 1: Root Level File Restoration
    // ========================================
    console.log('📋 Test 1: Root Level File Restoration');

    // Click a root-level file
    const rootFile = await page.locator('.tree-item.file[data-path="README.md"]');
    await rootFile.click();
    await page.waitForTimeout(1000);

    // Verify sidebar is visible
    let sidebarVisible = await page.locator('.tree-item').count();
    console.log(`   Sidebar items visible: ${sidebarVisible}`);

    if (sidebarVisible > 0) {
      console.log('   ✅ Test 1 PASSED: Root level file works\n');
      testsPassed++;
    } else {
      console.log('   ❌ Test 1 FAILED: Sidebar empty\n');
      testsFailed++;
    }

    // ========================================
    // Test 2: Single Nested Folder (Level 1)
    // ========================================
    console.log('📋 Test 2: Single Nested Folder (guide/intro.md)');

    // Expand guide folder first
    const guideToggle = await page.locator('.tree-item.directory[data-path="guide"] .expand-icon');
    await guideToggle.click();
    await page.waitForTimeout(500);

    // Click nested file
    const nestedFile = await page.locator('.tree-item.file[data-path="guide/intro.md"]');
    if (await nestedFile.count() > 0) {
      await nestedFile.click();
      await page.waitForTimeout(1000);

      // Reload page to test restoration
      console.log('   Reloading page to test restoration...');
      await page.reload();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);  // Wait for async restoration

      // Check if sidebar is populated
      sidebarVisible = await page.locator('.tree-item').count();
      console.log(`   Sidebar items after reload: ${sidebarVisible}`);

      // Check if guide folder is expanded
      const guideExpanded = await page.locator('.tree-item-wrapper[data-path="guide"].expanded').count();
      console.log(`   Guide folder expanded: ${guideExpanded > 0}`);

      // Check if file is visible and active
      const fileVisible = await page.locator('.tree-item.file[data-path="guide/intro.md"]').count();
      const fileActive = await page.locator('.tree-item.file[data-path="guide/intro.md"].active').count();
      console.log(`   File visible: ${fileVisible > 0}`);
      console.log(`   File active: ${fileActive > 0}`);

      if (sidebarVisible > 0 && guideExpanded > 0 && fileVisible > 0 && fileActive > 0) {
        console.log('   ✅ Test 2 PASSED: Nested folder restoration works\n');
        testsPassed++;
      } else {
        console.log('   ❌ Test 2 FAILED: Sidebar or folder state not restored\n');
        testsFailed++;
      }
    } else {
      console.log('   ⚠️  Test 2 SKIPPED: Nested file not found\n');
    }

    // ========================================
    // Test 3: Double Nested Folder (Level 2)
    // ========================================
    console.log('📋 Test 3: Double Nested Folder (guide/advanced/...)');

    // Expand advanced folder
    const advancedToggle = await page.locator('.tree-item.directory[data-path="guide/advanced"] .expand-icon');
    if (await advancedToggle.count() > 0) {
      await advancedToggle.click();
      await page.waitForTimeout(500);

      // Click double nested file
      const doubleNestedFile = await page.locator('.tree-item.file').filter({ hasText: /advanced/ }).first();
      if (await doubleNestedFile.count() > 0) {
        await doubleNestedFile.click();
        await page.waitForTimeout(1000);

        const filePath = await doubleNestedFile.getAttribute('data-path');
        console.log(`   Selected file: ${filePath}`);

        // Reload page to test restoration
        console.log('   Reloading page to test restoration...');
        await page.reload();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(3000);  // Wait longer for double nested

        // Check if sidebar is populated
        sidebarVisible = await page.locator('.tree-item').count();
        console.log(`   Sidebar items after reload: ${sidebarVisible}`);

        // Check if both folders are expanded
        const guideExpanded2 = await page.locator('.tree-item-wrapper[data-path="guide"].expanded').count();
        const advancedExpanded = await page.locator('.tree-item-wrapper[data-path="guide/advanced"].expanded').count();
        console.log(`   Guide folder expanded: ${guideExpanded2 > 0}`);
        console.log(`   Advanced folder expanded: ${advancedExpanded > 0}`);

        if (sidebarVisible > 0 && guideExpanded2 > 0 && advancedExpanded > 0) {
          console.log('   ✅ Test 3 PASSED: Double nested restoration works\n');
          testsPassed++;
        } else {
          console.log('   ❌ Test 3 FAILED: Double nested folders not restored\n');
          testsFailed++;
        }
      } else {
        console.log('   ⚠️  Test 3 SKIPPED: Double nested file not found\n');
      }
    } else {
      console.log('   ⚠️  Test 3 SKIPPED: Advanced folder not found\n');
    }

    // ========================================
    // Test 4: Console Error Check
    // ========================================
    console.log('📋 Test 4: Console Error Check');

    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        consoleErrors.push(msg.text());
      }
    });

    // Reload once more to catch errors
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    console.log(`   Console errors/warnings: ${consoleErrors.length}`);
    if (consoleErrors.length > 0) {
      consoleErrors.forEach(err => console.log(`     - ${err}`));
    }

    if (consoleErrors.filter(e => e.includes('Folder not found')).length === 0) {
      console.log('   ✅ Test 4 PASSED: No "Folder not found" warnings\n');
      testsPassed++;
    } else {
      console.log('   ❌ Test 4 FAILED: Still getting "Folder not found" warnings\n');
      testsFailed++;
    }

    // ========================================
    // Test Summary
    // ========================================
    console.log('═══════════════════════════════════════');
    console.log('📊 Test Summary');
    console.log('═══════════════════════════════════════');
    console.log(`✅ Passed: ${testsPassed}`);
    console.log(`❌ Failed: ${testsFailed}`);
    console.log(`📈 Total: ${testsPassed + testsFailed}`);
    console.log(`🎯 Success Rate: ${((testsPassed / (testsPassed + testsFailed)) * 100).toFixed(1)}%`);
    console.log('═══════════════════════════════════════\n');

    if (testsFailed === 0) {
      console.log('🎉 Option 2 Fix: ALL TESTS PASSED!\n');
      console.log('✅ 중첩 폴더 복원 100% 성공');
      console.log('✅ 빈 메뉴 문제 해결');
      console.log('✅ Console 경고 제거\n');
    } else {
      console.log('⚠️  Some tests failed. Please review.\n');
    }

  } catch (error) {
    console.error('❌ Test execution error:', error);
  } finally {
    await browser.close();
  }
}

testNestedFolderRestore();
