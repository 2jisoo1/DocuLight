const { chromium } = require('playwright');

async function testAutoLoad() {
  console.log('Starting auto-load test...\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Step 1: Navigate to localhost:3000
    console.log('Step 1: Navigating to http://localhost:3000');
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Step 2: Click "guide" folder to expand
    console.log('Step 2: Clicking "guide" folder');
    await page.click('text=guide');
    await page.waitForTimeout(1000);

    // Step 3: Click "getting-started.md" file
    console.log('Step 3: Clicking "getting-started.md" file');
    await page.click('text=getting-started.md');
    await page.waitForTimeout(2000);

    // Step 4: Verify it loaded by checking breadcrumb
    console.log('Step 4: Checking breadcrumb after first load');
    const firstCheck = await page.evaluate(() => {
      const breadcrumb = document.getElementById('breadcrumb');
      return {
        breadcrumbText: breadcrumb ? breadcrumb.textContent.trim() : null,
        hasContent: document.querySelector('.markdown-content h1') !== null,
        h1Text: document.querySelector('.markdown-content h1')?.textContent || null
      };
    });

    console.log('First check result:');
    console.log(`  Breadcrumb: ${firstCheck.breadcrumbText}`);
    console.log(`  Has content: ${firstCheck.hasContent}`);
    console.log(`  H1 text: ${firstCheck.h1Text}`);

    // Check IndexedDB after first load
    const dbAfterLoad = await page.evaluate(async () => {
      return new Promise((resolve) => {
        const request = indexedDB.open('doclight', 1);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('lastOpened', 'readonly');
          const store = tx.objectStore('lastOpened');
          const getRequest = store.get('file');

          getRequest.onsuccess = () => {
            resolve(getRequest.result || null);
          };
          getRequest.onerror = () => resolve(null);
        };
        request.onerror = () => resolve(null);
      });
    });

    console.log('IndexedDB after first load:', JSON.stringify(dbAfterLoad, null, 2));

    // Take screenshot before refresh
    await page.screenshot({ path: '/mnt/c/Work/git/DocLight/screenshot_before_refresh.png' });
    console.log('Screenshot saved: screenshot_before_refresh.png\n');

    // Step 5: Navigate to http://localhost:3000 again (simulates refresh)
    console.log('Step 5: Refreshing page (navigate to http://localhost:3000 again)');
    await page.goto('http://localhost:3000');

    // Step 6: Wait for auto-load (increased to 3 seconds to ensure IndexedDB operations complete)
    console.log('Step 6: Waiting 3 seconds for auto-load...');
    await page.waitForTimeout(3000);

    // Step 7: Take screenshot
    await page.screenshot({ path: '/mnt/c/Work/git/DocLight/screenshot_after_refresh.png' });
    console.log('Screenshot saved: screenshot_after_refresh.png\n');

    // Step 8: Check breadcrumb again
    console.log('Step 8: Checking breadcrumb after refresh');
    const secondCheck = await page.evaluate(() => {
      const breadcrumb = document.getElementById('breadcrumb');
      return {
        breadcrumbText: breadcrumb ? breadcrumb.textContent.trim() : null,
        hasContent: document.querySelector('.markdown-content h1') !== null,
        h1Text: document.querySelector('.markdown-content h1')?.textContent || null
      };
    });

    console.log('Second check result (after refresh):');
    console.log(`  Breadcrumb: ${secondCheck.breadcrumbText}`);
    console.log(`  Has content: ${secondCheck.hasContent}`);
    console.log(`  H1 text: ${secondCheck.h1Text}`);

    // Check IndexedDB after refresh
    const dbAfterRefresh = await page.evaluate(async () => {
      return new Promise((resolve) => {
        const request = indexedDB.open('doclight', 1);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('lastOpened', 'readonly');
          const store = tx.objectStore('lastOpened');
          const getRequest = store.get('file');

          getRequest.onsuccess = () => {
            resolve(getRequest.result || null);
          };
          getRequest.onerror = () => resolve(null);
        };
        request.onerror = () => resolve(null);
      });
    });

    console.log('IndexedDB after refresh:', JSON.stringify(dbAfterRefresh, null, 2));

    // Final report
    console.log('\n=== TEST REPORT ===');
    const isWorking = secondCheck.breadcrumbText === 'guide/getting-started.md';
    console.log(`Auto-load feature working: ${isWorking ? 'YES ✓' : 'NO ✗'}`);
    console.log(`Expected breadcrumb: "guide/getting-started.md"`);
    console.log(`Actual breadcrumb: "${secondCheck.breadcrumbText}"`);
    console.log(`File content displayed: ${secondCheck.hasContent ? 'YES ✓' : 'NO ✗'}`);
    console.log(`IndexedDB persistence: ${dbAfterLoad?.path === dbAfterRefresh?.path ? 'YES ✓' : 'NO ✗'}`);
    console.log(`Screenshots saved in project root directory`);

    if (!isWorking) {
      console.log('\nDIAGNOSTIC INFO:');
      console.log('- IndexedDB data was saved after first load:', dbAfterLoad !== null);
      console.log('- IndexedDB data persisted after refresh:', dbAfterRefresh !== null);
      console.log('- Saved path:', dbAfterLoad?.path);
      console.log('- Expected auto-load but breadcrumb shows:', secondCheck.breadcrumbText);
    }

    console.log('==================\n');

  } catch (error) {
    console.error('Error during test:', error);
  } finally {
    await browser.close();
  }
}

testAutoLoad();
