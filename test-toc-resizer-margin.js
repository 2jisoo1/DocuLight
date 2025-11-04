/**
 * Test TOC Resizer + Main Content Margin Sync
 */

const { chromium } = require('playwright');

async function testResizerMargin() {
  console.log('🧪 TOC Resizer + Margin Sync Test\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();

  try {
    const url = 'http://localhost:3000/doc/%ED%94%84%EB%A1%AC%ED%94%84%ED%8A%B8%20%EA%B0%95%EC%9D%98/6%EA%B0%95.%20LangChain4j%20%EA%B8%B0%EB%B0%98%20RAG%20%EC%84%A4%EA%B3%84%20%EB%B0%8F%20%EC%A7%80%EC%8B%9D%20%EA%B8%B0%EB%B0%98%20%ED%94%84%EB%A1%AC%ED%94%84%ED%8A%B8%20%EC%A0%84%EB%9E%B5';

    await page.goto(url);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    console.log('✅ Page loaded\n');

    // Open TOC
    console.log('📋 Step 1: Open TOC');
    const tocToggleBtn = await page.locator('#toc-toggle-btn');
    await tocToggleBtn.click();
    await page.waitForTimeout(1000);

    const tocSidebar = await page.locator('#toc-sidebar');
    const mainContent = await page.locator('.main-content');

    const initialTocWidth = await tocSidebar.evaluate(el => el.offsetWidth);
    const initialMargin = await mainContent.evaluate(el => window.getComputedStyle(el).marginRight);

    console.log(`   Initial TOC width: ${initialTocWidth}px`);
    console.log(`   Initial main-content margin-right: ${initialMargin}\n`);

    // Drag resizer
    console.log('📋 Step 2: Drag Resizer to Increase Width');

    const rightResizer = await page.locator('#right-resizer');
    const resizerBox = await rightResizer.boundingBox();

    console.log(`   Resizer position: x=${resizerBox.x}, y=${resizerBox.y}`);

    // Drag left 100px to increase width
    await page.mouse.move(resizerBox.x + 2, resizerBox.y + 360);
    await page.mouse.down();
    await page.mouse.move(resizerBox.x - 98, resizerBox.y + 360);
    await page.mouse.up();
    await page.waitForTimeout(500);

    const newTocWidth = await tocSidebar.evaluate(el => el.offsetWidth);
    const newMargin = await mainContent.evaluate(el => window.getComputedStyle(el).marginRight);

    console.log(`   New TOC width: ${newTocWidth}px`);
    console.log(`   New main-content margin-right: ${newMargin}`);
    console.log(`   Width change: ${newTocWidth - initialTocWidth}px\n`);

    await page.screenshot({ path: 'toc-resizer-margin-test.png', fullPage: true });
    console.log('   📸 Screenshot: toc-resizer-margin-test.png\n');

    // Check if margin matches TOC width
    console.log('═══════════════════════════════════════');
    console.log('🔍 Analysis');
    console.log('═══════════════════════════════════════\n');

    const marginValue = parseInt(newMargin);
    const widthDiff = Math.abs(marginValue - newTocWidth);

    console.log(`TOC width: ${newTocWidth}px`);
    console.log(`Margin-right: ${marginValue}px`);
    console.log(`Difference: ${widthDiff}px`);

    if (widthDiff <= 1) {
      console.log('\n✅ SUCCESS: Margin synced with TOC width\n');
    } else {
      console.log('\n❌ ISSUE: Margin not synced\n');
      console.log('Need to update margin-right when resizing TOC\n');
    }

    console.log('⏳ Keeping browser open for 15 seconds...\n');
    await page.waitForTimeout(15000);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await browser.close();
  }
}

testResizerMargin();
