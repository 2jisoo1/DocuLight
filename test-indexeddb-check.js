const { chromium } = require('playwright');

(async () => {
  console.log('🔍 Testing IndexedDB persistence...\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Navigate to page
    console.log('📍 Navigating to http://localhost:3000');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    console.log('✅ Page loaded\n');

    // Click guide folder and file
    console.log('📍 Clicking guide folder and file');
    await page.click('.tree-item-wrapper[data-path="guide"]');
    await page.waitForTimeout(500);
    await page.click('.tree-item[data-path="guide/getting-started.md"]');
    await page.waitForTimeout(2000);
    console.log('✅ File clicked\n');

    // Check breadcrumb
    const breadcrumb = await page.locator('#breadcrumb').textContent();
    console.log(`📋 Breadcrumb: "${breadcrumb}"`);

    // Check IndexedDB AFTER file load
    console.log('\n📍 Checking IndexedDB after file load:');
    const indexedDBData = await page.evaluate(async () => {
      return new Promise((resolve) => {
        const request = indexedDB.open('doclight', 1);

        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('lastOpened', 'readonly');
          const store = tx.objectStore('lastOpened');
          const getRequest = store.get('file');

          getRequest.onsuccess = () => {
            resolve({
              exists: getRequest.result !== undefined,
              path: getRequest.result?.path || null,
              timestamp: getRequest.result?.ts || null,
              dbName: db.name,
              version: db.version,
              storeNames: Array.from(db.objectStoreNames)
            });
          };

          getRequest.onerror = () => {
            resolve({ error: getRequest.error?.message || 'Unknown error' });
          };
        };

        request.onerror = () => {
          resolve({ error: 'Failed to open IndexedDB' });
        };
      });
    });

    console.log('IndexedDB Data:', JSON.stringify(indexedDBData, null, 2));

    if (indexedDBData.exists && indexedDBData.path === 'guide/getting-started.md') {
      console.log('✅ IndexedDB correctly saved the file path!\n');
    } else if (!indexedDBData.exists) {
      console.log('❌ IndexedDB does NOT contain the file path!\n');
      console.log('🔍 This means saveLastOpened() is either:');
      console.log('   1. Not being called');
      console.log('   2. Failing silently');
      console.log('   3. Writing to wrong store/key\n');
    } else {
      console.log(`❌ IndexedDB contains wrong path: "${indexedDBData.path}"\n`);
    }

    // Take screenshot before refresh
    await page.screenshot({ path: 'indexeddb-test-before.png', fullPage: true });

    // Now refresh
    console.log('📍 Refreshing page...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    console.log('✅ Page refreshed\n');

    // Check state after refresh
    const afterState = await page.evaluate(() => {
      return {
        breadcrumb: document.getElementById('breadcrumb')?.textContent.trim() || 'NOT FOUND',
        guideExpanded: document.querySelector('.tree-item-wrapper[data-path="guide"] .tree-children')?.style.display !== 'none',
        fileActive: document.querySelector('.tree-item[data-path="guide/getting-started.md"]')?.classList.contains('active')
      };
    });

    console.log('📊 State after refresh:');
    console.log(`   Breadcrumb: "${afterState.breadcrumb}"`);
    console.log(`   Guide expanded: ${afterState.guideExpanded}`);
    console.log(`   File active: ${afterState.fileActive}`);

    // Take screenshot after refresh
    await page.screenshot({ path: 'indexeddb-test-after.png', fullPage: true });

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('📋 DIAGNOSIS:');
    console.log('═══════════════════════════════════════════════════════════');

    if (!indexedDBData.exists) {
      console.log('❌ ROOT CAUSE: IndexedDB is NOT being saved');
      console.log('   The saveLastOpened() function is not working.');
      console.log('   Need to check:');
      console.log('   - Is saveLastOpened() being called?');
      console.log('   - Are there any JavaScript errors?');
      console.log('   - Is the transaction completing successfully?');
    } else if (afterState.breadcrumb !== 'guide/getting-started.md') {
      console.log('❌ ROOT CAUSE: Auto-load is NOT working');
      console.log('   IndexedDB has the data, but getLastOpened() or');
      console.log('   expandPathToFile() or loadFile() is failing.');
    } else {
      console.log('✅ AUTO-LOAD IS WORKING!');
    }
    console.log('═══════════════════════════════════════════════════════════');

  } catch (error) {
    console.error('\n❌ Test error:', error.message);
    await page.screenshot({ path: 'indexeddb-test-error.png' });
  } finally {
    await page.waitForTimeout(2000);
    await browser.close();
    console.log('\n✅ Browser closed');
  }
})();
