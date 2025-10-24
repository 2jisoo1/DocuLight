const { chromium } = require('playwright');

(async () => {
  console.log('🔍 Testing with console error logging...\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Collect console messages
  const consoleLogs = [];
  page.on('console', msg => {
    consoleLogs.push({ type: msg.type(), text: msg.text() });
    console.log(`[BROWSER ${msg.type().toUpperCase()}]:`, msg.text());
  });

  // Collect page errors
  page.on('pageerror', error => {
    console.log('[PAGE ERROR]:', error.message);
    consoleLogs.push({ type: 'pageerror', text: error.message });
  });

  try {
    console.log('📍 Step 1: Navigate and load file\n');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    await page.click('.tree-item-wrapper[data-path="guide"]');
    await page.waitForTimeout(500);
    await page.click('.tree-item[data-path="guide/getting-started.md"]');
    await page.waitForTimeout(2000);

    const breadcrumb1 = await page.locator('#breadcrumb').textContent();
    console.log(`\n✅ First load breadcrumb: "${breadcrumb1}"\n`);

    console.log('📍 Step 2: Refresh page and check console\n');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    await page.waitForTimeout(5000); // Wait longer for init to complete

    const breadcrumb2 = await page.locator('#breadcrumb').textContent();
    console.log(`\n📋 After refresh breadcrumb: "${breadcrumb2}"\n`);

    // Check what the init function logged
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('📊 CONSOLE LOGS ANALYSIS:');
    console.log('═══════════════════════════════════════════════════════════');

    const errors = consoleLogs.filter(log => log.type === 'error' || log.type === 'pageerror');
    const warnings = consoleLogs.filter(log => log.type === 'warning');
    const initLogs = consoleLogs.filter(log =>
      log.text.includes('last opened') ||
      log.text.includes('expandPath') ||
      log.text.includes('loadFile') ||
      log.text.includes('getLastOpened')
    );

    console.log(`\nErrors found: ${errors.length}`);
    if (errors.length > 0) {
      errors.forEach((log, i) => console.log(`  ${i + 1}. ${log.text}`));
    }

    console.log(`\nWarnings found: ${warnings.length}`);
    if (warnings.length > 0) {
      warnings.forEach((log, i) => console.log(`  ${i + 1}. ${log.text}`));
    }

    console.log(`\nInit-related logs: ${initLogs.length}`);
    if (initLogs.length > 0) {
      initLogs.forEach((log, i) => console.log(`  ${i + 1}. [${log.type}] ${log.text}`));
    }

    console.log('\n═══════════════════════════════════════════════════════════');

    // Debug: manually call getLastOpened to see what happens
    console.log('\n📍 Manual IndexedDB check:');
    const manualCheck = await page.evaluate(async () => {
      try {
        const db = await new Promise((resolve, reject) => {
          const request = indexedDB.open('doclight', 1);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });

        const tx = db.transaction('lastOpened', 'readonly');
        const store = tx.objectStore('lastOpened');
        const result = await new Promise((resolve) => {
          const req = store.get('file');
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);
        });

        return {
          success: true,
          lastOpened: result?.path || null,
          timestamp: result?.ts || null,
          error: null
        };
      } catch (error) {
        return {
          success: false,
          lastOpened: null,
          timestamp: null,
          error: error.message
        };
      }
    });

    console.log('Manual IndexedDB result:', JSON.stringify(manualCheck, null, 2));

  } catch (error) {
    console.error('\n❌ Test error:', error.message);
  } finally {
    await page.waitForTimeout(2000);
    await browser.close();
    console.log('\n✅ Test complete');
  }
})();
