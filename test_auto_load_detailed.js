const { chromium } = require('playwright');

async function testAutoLoad() {
  console.log('Starting detailed auto-load test...\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Capture console logs
  page.on('console', msg => {
    console.log(`[Browser ${msg.type()}]`, msg.text());
  });

  page.on('pageerror', error => {
    console.error('[Browser error]', error.message);
  });

  try {
    // Step 1: First load - click file
    console.log('=== FIRST LOAD ===');
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await page.click('text=guide');
    await page.waitForTimeout(500);
    await page.click('text=getting-started.md');
    await page.waitForTimeout(2000);

    const firstCheck = await page.evaluate(() => {
      const breadcrumb = document.getElementById('breadcrumb');
      return breadcrumb ? breadcrumb.textContent.trim() : null;
    });
    console.log('Breadcrumb after first load:', firstCheck);

    // Step 2: Check what happens during init on refresh
    console.log('\n=== REFRESH AND AUTO-LOAD ===');

    // Add debug logging to the page
    await page.evaluate(() => {
      // Override console methods to capture
      const originalLog = console.log;
      const originalWarn = console.warn;
      const originalError = console.error;

      window.debugLogs = [];

      console.log = (...args) => {
        window.debugLogs.push({ type: 'log', args: args.map(String) });
        originalLog.apply(console, args);
      };

      console.warn = (...args) => {
        window.debugLogs.push({ type: 'warn', args: args.map(String) });
        originalWarn.apply(console, args);
      };

      console.error = (...args) => {
        window.debugLogs.push({ type: 'error', args: args.map(String) });
        originalError.apply(console, args);
      };
    });

    // Refresh
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(5000);

    // Check debug logs
    const debugLogs = await page.evaluate(() => window.debugLogs || []);
    console.log('\nDebug logs captured:');
    debugLogs.forEach(log => {
      console.log(`  [${log.type}]`, log.args.join(' '));
    });

    // Check final state
    const finalState = await page.evaluate(async () => {
      const breadcrumb = document.getElementById('breadcrumb');

      // Check IndexedDB
      const lastOpened = await new Promise((resolve) => {
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

      // Check if file tree has the file
      const fileElement = document.querySelector('.tree-item.file[data-path="guide/getting-started.md"]');

      return {
        breadcrumb: breadcrumb ? breadcrumb.textContent.trim() : null,
        lastOpenedInDB: lastOpened,
        fileElementExists: fileElement !== null,
        fileElementVisible: fileElement ? window.getComputedStyle(fileElement).display !== 'none' : false,
        activeFileElements: Array.from(document.querySelectorAll('.tree-item.file.active')).map(el => el.dataset.path)
      };
    });

    console.log('\nFinal state:');
    console.log('  Breadcrumb:', finalState.breadcrumb);
    console.log('  Last opened in DB:', finalState.lastOpenedInDB);
    console.log('  File element exists in tree:', finalState.fileElementExists);
    console.log('  File element visible:', finalState.fileElementVisible);
    console.log('  Active file elements:', finalState.activeFileElements);

    // Screenshot
    await page.screenshot({ path: '/mnt/c/Work/git/DocLight/screenshot_final.png' });

    console.log('\n=== TEST RESULT ===');
    const success = finalState.breadcrumb === 'guide/getting-started.md';
    console.log(`Auto-load working: ${success ? 'YES ✓' : 'NO ✗'}`);
    console.log('===================\n');

  } catch (error) {
    console.error('Test error:', error);
  } finally {
    await browser.close();
  }
}

testAutoLoad();
