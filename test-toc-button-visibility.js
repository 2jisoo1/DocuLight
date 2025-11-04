/**
 * Test TOC Button Visibility
 * 1. Button hidden when TOC open
 * 2. Button visible when TOC closed
 * 3. Close button larger
 */

const { chromium } = require('playwright');

async function testButtonVisibility() {
  console.log('🧪 TOC Button Visibility Test\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();

  let testsPassed = 0;
  let testsFailed = 0;

  try {
    const url = 'http://localhost:3000/doc/%ED%94%84%EB%A1%AC%ED%94%84%ED%8A%B8%20%EA%B0%95%EC%9D%98/6%EA%B0%95.%20LangChain4j%20%EA%B8%B0%EB%B0%98%20RAG%20%EC%84%A4%EA%B3%84%20%EB%B0%8F%20%EC%A7%80%EC%8B%9D%20%EA%B8%B0%EB%B0%98%20%ED%94%84%EB%A1%AC%ED%94%84%ED%8A%B8%20%EC%A0%84%EB%9E%B5';

    await page.goto(url);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    console.log('✅ Page loaded\n');

    // Test 1: Toggle button visible initially
    console.log('📋 Test 1: Toggle Button Visible Initially');

    const tocToggleBtn = await page.locator('#toc-toggle-btn');
    const isVisible = await tocToggleBtn.isVisible();

    console.log(`   Toggle button visible: ${isVisible}`);

    if (isVisible) {
      console.log('   ✅ Test 1 PASSED\n');
      testsPassed++;
    } else {
      console.log('   ❌ Test 1 FAILED\n');
      testsFailed++;
    }

    await page.screenshot({ path: 'toc-btn-before-open.png', fullPage: true });

    // Test 2: Toggle button hidden when TOC opens
    console.log('📋 Test 2: Toggle Button Hidden When TOC Opens');

    await tocToggleBtn.click();
    await page.waitForTimeout(500);

    const isHiddenWhenOpen = await tocToggleBtn.evaluate(el => {
      return !el.offsetParent || el.classList.contains('hidden');
    });

    console.log(`   Toggle button hidden: ${isHiddenWhenOpen}`);

    await page.screenshot({ path: 'toc-btn-toc-open.png', fullPage: true });

    if (isHiddenWhenOpen) {
      console.log('   ✅ Test 2 PASSED\n');
      testsPassed++;
    } else {
      console.log('   ❌ Test 2 FAILED\n');
      testsFailed++;
    }

    // Test 3: Close button size
    console.log('📋 Test 3: Close Button Size');

    const closeBtn = await page.locator('#toc-close-btn');
    const closeBtnBox = await closeBtn.boundingBox();
    const closeBtnFontSize = await closeBtn.evaluate(el => {
      return window.getComputedStyle(el).fontSize;
    });

    console.log(`   Close button size: ${closeBtnBox.width}x${closeBtnBox.height}`);
    console.log(`   Font size: ${closeBtnFontSize}`);

    if (closeBtnBox.width >= 32 && closeBtnBox.height >= 32) {
      console.log('   ✅ Test 3 PASSED: Close button large enough\n');
      testsPassed++;
    } else {
      console.log('   ❌ Test 3 FAILED: Close button too small\n');
      testsFailed++;
    }

    // Test 4: Close button click shows toggle button
    console.log('📋 Test 4: Close Button Shows Toggle Button');

    await closeBtn.click();
    await page.waitForTimeout(500);

    const isVisibleAfterClose = await tocToggleBtn.isVisible();

    console.log(`   Toggle button visible after close: ${isVisibleAfterClose}`);

    await page.screenshot({ path: 'toc-btn-after-close.png', fullPage: true });

    if (isVisibleAfterClose) {
      console.log('   ✅ Test 4 PASSED\n');
      testsPassed++;
    } else {
      console.log('   ❌ Test 4 FAILED\n');
      testsFailed++;
    }

    // Test Summary
    console.log('═══════════════════════════════════════');
    console.log('📊 Test Summary');
    console.log('═══════════════════════════════════════');
    console.log(`✅ Passed: ${testsPassed}`);
    console.log(`❌ Failed: ${testsFailed}`);
    console.log(`📈 Total: ${testsPassed + testsFailed}`);
    console.log(`🎯 Success Rate: ${((testsPassed / (testsPassed + testsFailed)) * 100).toFixed(1)}%`);
    console.log('═══════════════════════════════════════\n');

    if (testsFailed === 0) {
      console.log('🎉 Button Visibility: ALL TESTS PASSED!\n');
    }

    console.log('⏳ Keeping browser open for 15 seconds...\n');
    await page.waitForTimeout(15000);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await browser.close();
  }
}

testButtonVisibility();
