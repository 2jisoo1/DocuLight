const { chromium } = require('playwright');

async function testAutoLoad() {
  console.log('Starting auto-load test with console logs...\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Capture console logs
  const consoleLogs = [];
  page.on('console', msg => {
    const logEntry = `[${msg.type()}] ${msg.text()}`;
    consoleLogs.push(logEntry);
    console.log('Browser console:', logEntry);
  });

  // Capture errors
  page.on('pageerror', error => {
    console.error('Browser error:', error.message);
    consoleLogs.push(`[ERROR] ${error.message}`);
  });

  try {
    // Step 1: Navigate to localhost:3000
    console.log('Step 1: Navigating to http://localhost:3000');
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Step 2: Click "guide" folder to expand
    console.log('\nStep 2: Clicking "guide" folder');
    await page.click('text=guide');
    await page.waitForTimeout(1000);

    // Step 3: Click "getting-started.md" file
    console.log('\nStep 3: Clicking "getting-started.md" file');
    consoleLogs.length = 0; // Clear previous logs
    await page.click('text=getting-started.md');
    await page.waitForTimeout(2000);

    console.log('\nLogs during first load:');
    consoleLogs.forEach(log => console.log('  ' + log));

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

    console.log('\nIndexedDB after first load:', JSON.stringify(dbAfterLoad, null, 2));

    // Step 5: Navigate to http://localhost:3000 again (simulates refresh)
    console.log('\n\nStep 5: Refreshing page (navigate to http://localhost:3000 again)');
    consoleLogs.length = 0; // Clear previous logs
    await page.goto('http://localhost:3000');

    // Step 6: Wait for auto-load
    console.log('Step 6: Waiting 5 seconds for auto-load...\n');
    await page.waitForTimeout(5000);

    console.log('Logs during refresh and auto-load:');
    consoleLogs.forEach(log => console.log('  ' + log));

    // Check state after refresh
    const secondCheck = await page.evaluate(() => {
      const breadcrumb = document.getElementById('breadcrumb');
      return {
        breadcrumbText: breadcrumb ? breadcrumb.textContent.trim() : null,
        hasContent: document.querySelector('.markdown-content h1') !== null,
        h1Text: document.querySelector('.markdown-content h1')?.textContent || null
      };
    });

    console.log('\nState after refresh:');
    console.log(`  Breadcrumb: ${secondCheck.breadcrumbText}`);
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

    // Take screenshot
    await page.screenshot({ path: '/mnt/c/Work/git/DocLight/screenshot_debug.png' });

    // Final report
    console.log('\n=== TEST REPORT ===');
    const isWorking = secondCheck.breadcrumbText === 'guide/getting-started.md';
    console.log(`Auto-load feature working: ${isWorking ? 'YES ✓' : 'NO ✗'}`);
    console.log(`Expected breadcrumb: "guide/getting-started.md"`);
    console.log(`Actual breadcrumb: "${secondCheck.breadcrumbText}"`);
    console.log('==================\n');

  } catch (error) {
    console.error('Error during test:', error);
  } finally {
    await browser.close();
  }
}

testAutoLoad();
