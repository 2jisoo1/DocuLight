const { chromium } = require('playwright');

(async () => {
  console.log('🧪 Testing FIXED auto-load feature...\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Step 1: Navigate to http://localhost:3000
    console.log('📍 Step 1: Navigating to http://localhost:3000');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    console.log('✅ Page loaded\n');

    // Step 2: Click "guide" folder
    console.log('📍 Step 2: Clicking "guide" folder');
    const guideFolder = page.locator('.tree-item-wrapper[data-path="guide"] .tree-item-label');
    await guideFolder.click();
    await page.waitForTimeout(500);
    console.log('✅ Guide folder clicked\n');

    // Step 3: Click "getting-started.md" file
    console.log('📍 Step 3: Clicking "getting-started.md" file');
    const gettingStartedFile = page.locator('.tree-item[data-path="guide/getting-started.md"]');
    await gettingStartedFile.click();
    await page.waitForTimeout(1000);
    console.log('✅ File clicked\n');

    // Step 4: Verify file is loaded (check breadcrumb)
    console.log('📍 Step 4: Verifying file is loaded');
    const breadcrumb = await page.locator('#breadcrumb').textContent();
    console.log(`   Breadcrumb: "${breadcrumb}"`);

    if (breadcrumb === 'guide/getting-started.md') {
      console.log('✅ File loaded correctly\n');
    } else {
      console.log('❌ File not loaded correctly\n');
      await browser.close();
      return;
    }

    // Step 5: Take screenshot (before refresh)
    console.log('📍 Step 5: Taking screenshot before refresh');
    await page.screenshot({ path: 'screenshot-before-auto-load.png' });
    console.log('✅ Screenshot saved: screenshot-before-auto-load.png\n');

    // Check localStorage
    console.log('📍 Checking localStorage before refresh:');
    const localStorageBefore = await page.evaluate(() => {
      return {
        lastOpenedFile: localStorage.getItem('lastOpenedFile'),
        allItems: { ...localStorage }
      };
    });
    console.log('   lastOpenedFile:', localStorageBefore.lastOpenedFile);
    console.log('   All localStorage:', JSON.stringify(localStorageBefore.allItems, null, 2));
    console.log('');

    // Step 6: Navigate to http://localhost:3000 again (simulates refresh)
    console.log('📍 Step 6: Refreshing page (navigating to http://localhost:3000 again)');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    console.log('✅ Page refreshed\n');

    // Step 7: Wait 3 seconds for auto-load
    console.log('📍 Step 7: Waiting 3 seconds for auto-load...');
    await page.waitForTimeout(3000);
    console.log('✅ Wait complete\n');

    // Step 8: Take screenshot (after refresh)
    console.log('📍 Step 8: Taking screenshot after refresh');
    await page.screenshot({ path: 'screenshot-after-auto-load.png' });
    console.log('✅ Screenshot saved: screenshot-after-auto-load.png\n');

    // Step 9: Check breadcrumb and state with browser_evaluate
    console.log('📍 Step 9: Checking state after refresh');
    const stateAfterRefresh = await page.evaluate(() => {
      const breadcrumbElement = document.getElementById('breadcrumb');
      const guideFolder = document.querySelector('.tree-item-wrapper[data-path="guide"]');
      const guideChildren = guideFolder ? guideFolder.querySelector('.tree-children') : null;
      const fileItem = document.querySelector('.tree-item[data-path="guide/getting-started.md"]');
      const activeFile = document.querySelector('.tree-item.active');

      return {
        breadcrumb: breadcrumbElement ? breadcrumbElement.textContent : 'NOT FOUND',
        guideExpanded: guideChildren ? guideChildren.style.display !== 'none' : false,
        fileVisible: fileItem !== null,
        fileActive: fileItem ? fileItem.classList.contains('active') : false,
        activePath: activeFile ? activeFile.getAttribute('data-path') : 'NONE',
        guideChildrenDisplay: guideChildren ? guideChildren.style.display : 'NOT FOUND',
        localStorageLastFile: localStorage.getItem('lastOpenedFile')
      };
    });

    console.log('📊 State after refresh:');
    console.log(`   Breadcrumb: "${stateAfterRefresh.breadcrumb}"`);
    console.log(`   Guide folder expanded: ${stateAfterRefresh.guideExpanded}`);
    console.log(`   File visible: ${stateAfterRefresh.fileVisible}`);
    console.log(`   File active: ${stateAfterRefresh.fileActive}`);
    console.log(`   Active path: ${stateAfterRefresh.activePath}`);
    console.log(`   Guide children display: ${stateAfterRefresh.guideChildrenDisplay}`);
    console.log(`   localStorage lastOpenedFile: ${stateAfterRefresh.localStorageLastFile}`);
    console.log('');

    // Final verdict
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📋 FINAL REPORT:');
    console.log('═══════════════════════════════════════════════════════════');

    const expectedBreadcrumb = 'guide/getting-started.md';
    const breadcrumbCorrect = stateAfterRefresh.breadcrumb === expectedBreadcrumb;
    const folderExpanded = stateAfterRefresh.guideExpanded;
    const fileDisplayed = stateAfterRefresh.fileVisible;
    const fileMarkedActive = stateAfterRefresh.fileActive;

    console.log(`Breadcrumb correct: ${breadcrumbCorrect ? '✅' : '❌'} (Expected: "${expectedBreadcrumb}", Got: "${stateAfterRefresh.breadcrumb}")`);
    console.log(`Folder auto-expanded: ${folderExpanded ? '✅' : '❌'}`);
    console.log(`File visible in tree: ${fileDisplayed ? '✅' : '❌'}`);
    console.log(`File marked as active: ${fileMarkedActive ? '✅' : '❌'}`);
    console.log('');

    const allPassed = breadcrumbCorrect && folderExpanded && fileDisplayed && fileMarkedActive;

    if (allPassed) {
      console.log('🎉 AUTO-LOAD FEATURE IS WORKING CORRECTLY! 🎉');
      console.log('   The last opened document loads automatically on page refresh.');
    } else {
      console.log('❌ AUTO-LOAD FEATURE HAS ISSUES');
      console.log('   Some expected behaviors are not working.');
    }

    console.log('═══════════════════════════════════════════════════════════');
    console.log('\n📸 Screenshots saved:');
    console.log('   - screenshot-before-auto-load.png');
    console.log('   - screenshot-after-auto-load.png');

  } catch (error) {
    console.error('❌ Test failed with error:', error);
    await page.screenshot({ path: 'error-auto-load-test.png' });
    console.log('Error screenshot saved: error-auto-load-test.png');
  } finally {
    await page.waitForTimeout(2000);
    await browser.close();
    console.log('\n✅ Browser closed');
  }
})();
