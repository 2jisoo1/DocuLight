/**
 * Test TOC Width Persistence
 * 1. Resize TOC
 * 2. Check if width saved to IndexedDB
 * 3. Reload page
 * 4. Check if width restored
 */

const { chromium } = require('playwright');

async function testWidthPersistence() {
  console.log('🧪 TOC Width Persistence Test\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();

  try {
    const url = 'http://localhost:3000/doc/%ED%94%84%EB%A1%AC%ED%94%84%ED%8A%B8%20%EA%B0%95%EC%9D%98/6%EA%B0%95.%20LangChain4j%20%EA%B8%B0%EB%B0%98%20RAG%20%EC%84%A4%EA%B3%84%20%EB%B0%8F%20%EC%A7%80%EC%8B%9D%20%EA%B8%B0%EB%B0%98%20%ED%94%84%EB%A1%AC%ED%94%84%ED%8A%B8%20%EC%A0%84%EB%9E%B5';

    await page.goto(url);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    console.log('✅ Page loaded\n');

    // Step 1: Open TOC
    console.log('📋 Step 1: Open TOC and Resize');

    const tocToggleBtn = await page.locator('#toc-toggle-btn');
    await tocToggleBtn.click();
    await page.waitForTimeout(1000);

    const tocSidebar = await page.locator('#toc-sidebar');
    const initialWidth = await tocSidebar.evaluate(el => el.offsetWidth);
    console.log(`   Initial width: ${initialWidth}px`);

    // Drag resizer to change width
    const rightResizer = await page.locator('#right-resizer');
    const resizerBox = await rightResizer.boundingBox();

    await page.mouse.move(resizerBox.x + 2, resizerBox.y + 360);
    await page.mouse.down();
    await page.mouse.move(resizerBox.x - 98, resizerBox.y + 360);
    await page.mouse.up();
    await page.waitForTimeout(1000);

    const newWidth = await tocSidebar.evaluate(el => el.offsetWidth);
    console.log(`   New width after resize: ${newWidth}px\n`);

    // Step 2: Check IndexedDB
    console.log('📋 Step 2: Check IndexedDB');

    const savedState = await page.evaluate(async () => {
      const dbRequest = indexedDB.open('DocuLight', 2);
      return new Promise((resolve) => {
        dbRequest.onsuccess = () => {
          const db = dbRequest.result;
          const tx = db.transaction('tocState', 'readonly');
          const store = tx.objectStore('tocState');
          const request = store.get('toc');
          request.onsuccess = () => resolve(request.result);
        };
      });
    });

    console.log('   Saved state in DB:', savedState);

    if (savedState && savedState.width === newWidth) {
      console.log('   ✅ Width saved correctly\n');
    } else {
      console.log(`   ❌ Width not saved (expected ${newWidth}, got ${savedState?.width})\n`);
    }

    // Step 3: Reload page
    console.log('📋 Step 3: Reload Page and Check Restoration');

    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const restoredWidth = await tocSidebar.evaluate(el => el.offsetWidth);
    const isTocOpen = await tocSidebar.evaluate(el => el.classList.contains('open'));

    console.log(`   TOC open after reload: ${isTocOpen}`);
    console.log(`   Restored width: ${restoredWidth}px`);
    console.log(`   Expected width: ${newWidth}px\n`);

    await page.screenshot({ path: 'toc-width-restored.png', fullPage: true });

    // Diagnosis
    console.log('═══════════════════════════════════════');
    console.log('🔍 Analysis');
    console.log('═══════════════════════════════════════\n');

    if (Math.abs(restoredWidth - newWidth) <= 1) {
      console.log('✅ SUCCESS: Width restored correctly\n');
    } else {
      console.log('❌ ISSUE: Width not restored\n');
      console.log(`   Difference: ${Math.abs(restoredWidth - newWidth)}px\n`);
    }

    console.log('⏳ Keeping browser open for 15 seconds...\n');
    await page.waitForTimeout(15000);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await browser.close();
  }
}

testWidthPersistence();
