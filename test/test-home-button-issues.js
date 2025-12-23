/**
 * Test Home Button Issues
 * 1. Clear lastOpened DB data
 * 2. TOC should be empty on welcome page
 */

const { chromium } = require('playwright');

async function testHomeButton() {
  console.log('🧪 Home Button Issues Test\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Step 1: Load a document
    console.log('📋 Step 1: Load a Document');
    const fileItem = await page.locator('.tree-item.file').first();
    await fileItem.click();
    await page.waitForTimeout(2000);

    // Check IndexedDB lastOpened
    let lastOpened = await page.evaluate(async () => {
      const dbRequest = indexedDB.open('DocuLight', 2);
      return new Promise((resolve) => {
        dbRequest.onsuccess = () => {
          const db = dbRequest.result;
          const tx = db.transaction('lastOpened', 'readonly');
          const store = tx.objectStore('lastOpened');
          const request = store.get('file');
          request.onsuccess = () => resolve(request.result);
        };
      });
    });

    console.log('   lastOpened in DB:', lastOpened);
    console.log('   ✅ Document loaded and saved\n');

    // Step 2: Click home button
    console.log('📋 Step 2: Click Home Button (Sidebar Title)');
    const sidebarTitle = await page.locator('.sidebar-title');
    await sidebarTitle.click();
    await page.waitForTimeout(2000);

    // Check if welcome screen is showing
    const welcomeVisible = await page.locator('.welcome').count();
    const breadcrumb = await page.locator('#breadcrumb').textContent();

    console.log(`   Welcome screen visible: ${welcomeVisible > 0}`);
    console.log(`   Breadcrumb: "${breadcrumb}"`);

    // Check IndexedDB lastOpened (should be cleared)
    lastOpened = await page.evaluate(async () => {
      const dbRequest = indexedDB.open('DocuLight', 2);
      return new Promise((resolve) => {
        dbRequest.onsuccess = () => {
          const db = dbRequest.result;
          const tx = db.transaction('lastOpened', 'readonly');
          const store = tx.objectStore('lastOpened');
          const request = store.get('file');
          request.onsuccess = () => resolve(request.result);
        };
      });
    });

    console.log('   lastOpened in DB after home click:', lastOpened);

    if (!lastOpened || lastOpened.path === null) {
      console.log('   ✅ Issue 1 FIXED: lastOpened cleared\n');
    } else {
      console.log('   ❌ Issue 1: lastOpened NOT cleared\n');
    }

    // Step 3: Check TOC content
    console.log('📋 Step 3: Check TOC on Welcome Page');

    // Open TOC
    const tocToggleBtn = await page.locator('#toc-toggle-btn');
    await tocToggleBtn.click();
    await page.waitForTimeout(500);

    const tocItems = await page.locator('.toc-item').count();
    const tocEmpty = await page.locator('.toc-empty').count();

    console.log(`   TOC items count: ${tocItems}`);
    console.log(`   TOC empty message: ${tocEmpty > 0}`);

    await page.screenshot({ path: 'home-button-toc.png', fullPage: true });
    console.log('   📸 Screenshot: home-button-toc.png');

    if (tocItems === 0 || tocEmpty > 0) {
      console.log('   ✅ Issue 2 FIXED: TOC empty on welcome page\n');
    } else {
      console.log('   ❌ Issue 2: TOC showing items on welcome page\n');
    }

    console.log('⏳ Keeping browser open for 15 seconds...\n');
    await page.waitForTimeout(15000);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await browser.close();
  }
}

testHomeButton();
