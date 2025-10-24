const { chromium } = require('playwright');

(async () => {
  console.log('🔍 Adding debug logs to check auto-load execution...\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  const consoleLogs = [];
  page.on('console', msg => {
    consoleLogs.push({ type: msg.type(), text: msg.text(), timestamp: new Date().toISOString() });
    if (msg.type() === 'log' || msg.type() === 'warn' || msg.type() === 'error') {
      console.log(`[${msg.type().toUpperCase()}]:`, msg.text());
    }
  });

  try {
    // First, inject console.log statements
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    console.log('📍 Injecting debug statements into init function...\n');

    await page.evaluate(() => {
      // Override the init function with debug logging
      const originalInit = window.init;

      window.init = async function() {
        console.log('[DEBUG] init() started');

        try {
          console.log('[DEBUG] Calling initDB()');
          await initDB();
          console.log('[DEBUG] initDB() completed');

          console.log('[DEBUG] Fetching tree');
          const treeData = await fetchTree('/');
          const container = document.getElementById('tree-container');
          await buildTree(treeData, container);
          console.log('[DEBUG] Tree built');

          // Refresh button setup
          document.getElementById('refresh-btn').addEventListener('click', async () => {
            try {
              container.innerHTML = '<div class="loading">로딩 중...</div>';
              const treeData = await fetchTree('/');
              container.innerHTML = '';
              await buildTree(treeData, container);
            } catch (error) {
              console.error('Failed to refresh tree:', error);
              const userMessage = ErrorHandler.getUserMessage(error, '디렉터리 트리');
              container.innerHTML = `
                <div class="tree-error">
                  <p>${userMessage}</p>
                  <p class="error-details">${error.message}</p>
                </div>
              `;
            }
          });

          // Load last opened file if exists
          console.log('[DEBUG] Calling getLastOpened()');
          const lastOpened = await getLastOpened();
          console.log('[DEBUG] getLastOpened() returned:', lastOpened);

          if (lastOpened) {
            try {
              console.log('[DEBUG] Expanding path to file:', lastOpened);
              await expandPathToFile(lastOpened);
              console.log('[DEBUG] Path expanded, loading file');
              await loadFile(lastOpened);
              console.log('[DEBUG] File loaded successfully');
            } catch (error) {
              console.warn('[DEBUG] Failed to load last opened file:', error.message);
            }
          } else {
            console.log('[DEBUG] No last opened file found');
          }

          console.log('[DEBUG] init() completed successfully');
        } catch (error) {
          console.error('[DEBUG] Initialization error:', error);
          const userMessage = ErrorHandler.getUserMessage(error);
          ErrorHandler.showError(
            '애플리케이션을 초기화하는 중 오류가 발생했습니다.',
            `${userMessage}\n${error.message}`
          );
        }
      };
    });

    // Click file to save it
    console.log('📍 Step 1: Loading a file\n');
    await page.click('.tree-item-wrapper[data-path="guide"]');
    await page.waitForTimeout(500);
    await page.click('.tree-item[data-path="guide/getting-started.md"]');
    await page.waitForTimeout(2000);

    const breadcrumb1 = await page.locator('#breadcrumb').textContent();
    console.log(`\n✅ File loaded, breadcrumb: "${breadcrumb1}"\n`);

    // Refresh page
    console.log('📍 Step 2: Refreshing page to test auto-load\n');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('CONSOLE LOGS FROM REFRESH:');
    console.log('═══════════════════════════════════════════════════════════\n');

    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    await page.waitForTimeout(5000);

    const breadcrumb2 = await page.locator('#breadcrumb').textContent();
    console.log(`\n═══════════════════════════════════════════════════════════`);
    console.log(`📋 Final breadcrumb: "${breadcrumb2}"`);
    console.log('═══════════════════════════════════════════════════════════\n');

    // Analyze logs
    const debugLogs = consoleLogs.filter(log => log.text.includes('[DEBUG]'));

    console.log('📊 DEBUG LOG ANALYSIS:');
    console.log(`Total debug logs captured: ${debugLogs.length}\n`);

    if (debugLogs.length === 0) {
      console.log('❌ NO DEBUG LOGS FOUND!');
      console.log('   This means the modified init() function was NOT called.');
      console.log('   The original init() might be running instead.\n');
    } else {
      console.log('Debug logs in order:');
      debugLogs.forEach((log, i) => {
        console.log(`  ${i + 1}. ${log.text}`);
      });
      console.log('');
    }

  } catch (error) {
    console.error('\n❌ Test error:', error.message);
  } finally {
    await page.waitForTimeout(2000);
    await browser.close();
    console.log('\n✅ Test complete');
  }
})();
