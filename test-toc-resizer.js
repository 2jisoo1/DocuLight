/**
 * Test TOC Resizer Functionality
 */

const { chromium } = require('playwright');

async function testTOCResizer() {
  console.log('🧪 TOC Resizer Test\n');

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
    const initialWidth = await tocSidebar.evaluate(el => el.offsetWidth);
    console.log(`   Initial TOC width: ${initialWidth}px\n`);

    await page.screenshot({ path: 'toc-resizer-before.png', fullPage: true });

    // Check if right-resizer exists and is visible
    console.log('📋 Step 2: Check Right Resizer');
    const rightResizer = await page.locator('#right-resizer');
    const resizerCount = await rightResizer.count();
    console.log(`   Right resizer exists: ${resizerCount > 0}`);

    if (resizerCount > 0) {
      const resizerBox = await rightResizer.boundingBox();
      const resizerStyles = await rightResizer.evaluate(el => {
        const styles = window.getComputedStyle(el);
        return {
          position: styles.position,
          right: styles.right,
          opacity: styles.opacity,
          pointerEvents: styles.pointerEvents,
          width: styles.width
        };
      });

      console.log('   Resizer bounding box:', resizerBox);
      console.log('   Resizer styles:', resizerStyles);

      // Try to drag resizer
      if (resizerBox) {
        console.log('\n📋 Step 3: Try Dragging Resizer');

        const resizerX = resizerBox.x + resizerBox.width / 2;
        const resizerY = resizerBox.y + resizerBox.height / 2;

        console.log(`   Resizer center position: (${resizerX}, ${resizerY})`);

        // Drag left 100px to increase width
        await page.mouse.move(resizerX, resizerY);
        await page.mouse.down();
        await page.mouse.move(resizerX - 100, resizerY);
        await page.mouse.up();
        await page.waitForTimeout(500);

        const newWidth = await tocSidebar.evaluate(el => el.offsetWidth);
        console.log(`   New TOC width: ${newWidth}px`);
        console.log(`   Width change: ${newWidth - initialWidth}px`);

        await page.screenshot({ path: 'toc-resizer-after.png', fullPage: true });

        if (newWidth !== initialWidth) {
          console.log('   ✅ Resizer works\n');
        } else {
          console.log('   ❌ Resizer not working - width unchanged\n');
        }
      } else {
        console.log('   ❌ Resizer has no bounding box (not visible)\n');
      }
    } else {
      console.log('   ❌ Right resizer not found\n');
    }

    // Diagnosis
    console.log('═══════════════════════════════════════');
    console.log('🔍 Diagnosis');
    console.log('═══════════════════════════════════════\n');

    // Check if resizer position is correct
    const tocBox = await tocSidebar.boundingBox();
    console.log(`TOC sidebar position: x=${tocBox.x}, width=${tocBox.width}`);
    console.log(`Expected resizer X: ${tocBox.x} (left edge of TOC)`);

    const resizerBox = await rightResizer.boundingBox();
    if (resizerBox) {
      console.log(`Actual resizer X: ${resizerBox.x}`);
      console.log(`Resizer width: ${resizerBox.width}px`);

      if (Math.abs(resizerBox.x - tocBox.x) < 10) {
        console.log('✅ Resizer positioned correctly at TOC left edge');
      } else {
        console.log('❌ Resizer position incorrect');
        console.log(`   Gap: ${Math.abs(resizerBox.x - tocBox.x)}px`);
      }
    }

    console.log('\n⏳ Keeping browser open for inspection (20s)...\n');
    await page.waitForTimeout(20000);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await browser.close();
  }
}

testTOCResizer();
