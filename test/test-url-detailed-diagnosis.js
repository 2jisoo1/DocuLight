/**
 * Detailed URL Issue Diagnosis
 */

const { chromium } = require('playwright');

async function detailedDiagnosis() {
  console.log('🔍 Detailed URL Issue Diagnosis\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Collect ALL console messages
  const allLogs = [];
  page.on('console', msg => {
    const text = msg.text();
    allLogs.push(`[${msg.type().toUpperCase()}] ${text}`);
    console.log(`  [${msg.type().toUpperCase()}] ${text}`);
  });

  try {
    const url = 'http://localhost:3000/doc/%ED%94%84%EB%A1%AC%ED%94%84%ED%8A%B8%20%EA%B0%95%EC%9D%98/6%EA%B0%95.%20LangChain4j%20%EA%B8%B0%EB%B0%98%20RAG%20%EC%84%A4%EA%B3%84%20%EB%B0%8F%20%EC%A7%80%EC%8B%9D%20%EA%B8%B0%EB%B0%98%20%ED%94%84%EB%A1%AC%ED%94%84%ED%8A%B8%20%EC%A0%84%EB%9E%B5';

    console.log('Navigating to URL...\n');
    console.log('📋 Console output:\n');

    await page.goto(url);
    await page.waitForLoadState('domcontentloaded');

    console.log('\n⏳ Waiting 5 seconds for async operations...\n');
    await page.waitForTimeout(5000);

    // Check DOM state
    console.log('\n═══════════════════════════════════════');
    console.log('📊 DOM State Analysis');
    console.log('═══════════════════════════════════════\n');

    const sidebarItems = await page.locator('.tree-item').count();
    const breadcrumb = await page.locator('#breadcrumb').textContent();
    const welcomeVisible = await page.locator('.welcome').count();
    const documentTitle = await page.locator('.document-title').count();
    const mainContentText = await page.locator('.markdown-content').textContent();

    console.log(`Sidebar items: ${sidebarItems}`);
    console.log(`Breadcrumb: "${breadcrumb}"`);
    console.log(`Welcome screen: ${welcomeVisible > 0 ? 'YES' : 'NO'}`);
    console.log(`Document title: ${documentTitle > 0 ? 'YES' : 'NO'}`);
    console.log(`Main content length: ${mainContentText.length} chars`);

    // Check if expandPathToFile was called
    const waitingLogs = allLogs.filter(log => log.includes('Waiting for folder'));
    console.log(`\nFolder waiting logs: ${waitingLogs.length}`);
    waitingLogs.forEach(log => console.log(`  ${log}`));

    // Check if folder warnings appeared
    const warningLogs = allLogs.filter(log => log.includes('Folder not found'));
    console.log(`\nFolder warning logs: ${warningLogs.length}`);
    warningLogs.forEach(log => console.log(`  ${log}`));

    // Take screenshot
    await page.screenshot({ path: 'detailed-diagnosis.png', fullPage: true });
    console.log('\n✅ Screenshot: detailed-diagnosis.png');

    // Check tree state
    const expandedFolders = await page.locator('.tree-item-wrapper.expanded').count();
    console.log(`\nExpanded folders: ${expandedFolders}`);

    // List expanded folders
    const expandedPaths = await page.evaluate(() => {
      const expanded = document.querySelectorAll('.tree-item-wrapper.expanded');
      return Array.from(expanded).map(el => el.dataset.path);
    });
    console.log('Expanded folder paths:', expandedPaths);

    console.log('\n⏳ Keeping browser open for inspection (30s)...\n');
    await page.waitForTimeout(30000);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await browser.close();
  }
}

detailedDiagnosis();
