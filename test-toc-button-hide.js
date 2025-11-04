/**
 * Test TOC Button Hide When TOC is Open
 */

const { chromium } = require('playwright');

async function testButtonHide() {
  console.log('🧪 TOC Button Hide Test\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();

  try {
    const url = 'http://localhost:3000/doc/%ED%94%84%EB%A1%AC%ED%94%84%ED%8A%B8%20%EA%B0%95%EC%9D%98/6%EA%B0%95.%20LangChain4j%20%EA%B8%B0%EB%B0%98%20RAG%20%EC%84%A4%EA%B3%84%20%EB%B0%8F%20%EC%A7%80%EC%8B%9D%20%EA%B8%B0%EB%B0%98%20%ED%94%84%EB%A1%AC%ED%94%84%ED%8A%B8%20%EC%A0%84%EB%9E%B5';

    await page.goto(url);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    console.log('✅ Page loaded\n');

    // Check initial state
    console.log('📋 Step 1: Initial State');

    const tocToggleBtn = await page.locator('#toc-toggle-btn');
    const tocSidebar = await page.locator('#toc-sidebar');

    const isTocOpen = await tocSidebar.evaluate(el => el.classList.contains('open'));
    const isButtonVisible = await tocToggleBtn.isVisible();
    const hasHiddenClass = await tocToggleBtn.evaluate(el => el.classList.contains('hidden'));

    console.log(`   TOC open: ${isTocOpen}`);
    console.log(`   Button visible: ${isButtonVisible}`);
    console.log(`   Has hidden class: ${hasHiddenClass}\n`);

    await page.screenshot({ path: 'button-hide-initial.png', fullPage: true });

    // Open TOC
    console.log('📋 Step 2: Click to Open TOC');

    if (!isTocOpen) {
      await tocToggleBtn.click();
      await page.waitForTimeout(500);
    }

    const isButtonVisibleAfterOpen = await tocToggleBtn.isVisible();
    const hasHiddenClassAfterOpen = await tocToggleBtn.evaluate(el => el.classList.contains('hidden'));

    console.log(`   Button visible after open: ${isButtonVisibleAfterOpen}`);
    console.log(`   Has hidden class: ${hasHiddenClassAfterOpen}\n`);

    await page.screenshot({ path: 'button-hide-toc-open.png', fullPage: true });

    if (!isButtonVisibleAfterOpen) {
      console.log('   ✅ Button hidden when TOC open\n');
    } else {
      console.log('   ❌ Button still visible when TOC open\n');
    }

    // Reload page
    console.log('📋 Step 3: Reload Page (TOC should restore as open)');

    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const isTocOpenAfterReload = await tocSidebar.evaluate(el => el.classList.contains('open'));
    const isButtonVisibleAfterReload = await tocToggleBtn.isVisible();
    const hasHiddenAfterReload = await tocToggleBtn.evaluate(el => el.classList.contains('hidden'));

    console.log(`   TOC open after reload: ${isTocOpenAfterReload}`);
    console.log(`   Button visible after reload: ${isButtonVisibleAfterReload}`);
    console.log(`   Has hidden class: ${hasHiddenAfterReload}\n`);

    await page.screenshot({ path: 'button-hide-after-reload.png', fullPage: true });

    console.log('═══════════════════════════════════════');
    console.log('🔍 Diagnosis');
    console.log('═══════════════════════════════════════\n');

    if (isTocOpenAfterReload && isButtonVisibleAfterReload) {
      console.log('❌ ISSUE: Button visible when TOC is open after reload');
      console.log('   → Need to add hidden class when restoring open state\n');
    } else if (isTocOpenAfterReload && !isButtonVisibleAfterReload) {
      console.log('✅ SUCCESS: Button hidden correctly after reload\n');
    }

    console.log('⏳ Keeping browser open for 20 seconds...\n');
    await page.waitForTimeout(20000);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await browser.close();
  }
}

testButtonHide();
