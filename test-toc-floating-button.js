/**
 * Test TOC Floating Button
 * 1. Button positioned at far right in header
 * 2. Floating button appears when scrolled
 */

const { chromium } = require('playwright');

async function testFloatingButton() {
  console.log('🧪 TOC Floating Button Test\n');

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

    // Test 1: Button position at far right
    console.log('📋 Test 1: TOC Button at Far Right');

    const tocButton = await page.locator('#toc-toggle-btn');
    const contentHeader = await page.locator('.content-header');

    const buttonBox = await tocButton.boundingBox();
    const headerBox = await contentHeader.boundingBox();

    console.log(`   Header right edge: ${headerBox.x + headerBox.width}`);
    console.log(`   Button right edge: ${buttonBox.x + buttonBox.width}`);
    console.log(`   Button size: ${buttonBox.width}x${buttonBox.height}`);

    const isAtFarRight = (headerBox.x + headerBox.width - (buttonBox.x + buttonBox.width)) < 30;

    if (isAtFarRight) {
      console.log('   ✅ Test 1 PASSED: Button at far right\n');
      testsPassed++;
    } else {
      console.log('   ❌ Test 1 FAILED: Button not at far right\n');
      testsFailed++;
    }

    await page.screenshot({ path: 'toc-button-initial.png', fullPage: true });

    // Test 2: Scroll down - check floating
    console.log('📋 Test 2: Floating Button on Scroll');

    // Scroll down 500px
    await page.evaluate(() => {
      document.querySelector('.main-content').scrollTop = 500;
    });

    await page.waitForTimeout(500);

    const hasFloatingClass = await tocButton.evaluate(el => el.classList.contains('floating'));
    console.log(`   Floating class added: ${hasFloatingClass}`);

    const floatingStyles = await tocButton.evaluate(el => {
      const styles = window.getComputedStyle(el);
      return {
        position: styles.position,
        top: styles.top,
        right: styles.right,
        zIndex: styles.zIndex
      };
    });

    console.log('   Floating styles:', floatingStyles);

    await page.screenshot({ path: 'toc-button-floating.png', fullPage: true });

    if (hasFloatingClass && floatingStyles.position === 'fixed') {
      console.log('   ✅ Test 2 PASSED: Floating button active\n');
      testsPassed++;
    } else {
      console.log('   ❌ Test 2 FAILED: Floating not working\n');
      testsFailed++;
    }

    // Test 3: Scroll back up - floating removed
    console.log('📋 Test 3: Floating Removed on Scroll Up');

    await page.evaluate(() => {
      document.querySelector('.main-content').scrollTop = 0;
    });

    await page.waitForTimeout(500);

    const floatingRemoved = await tocButton.evaluate(el => !el.classList.contains('floating'));
    console.log(`   Floating class removed: ${floatingRemoved}`);

    if (floatingRemoved) {
      console.log('   ✅ Test 3 PASSED: Floating removed\n');
      testsPassed++;
    } else {
      console.log('   ❌ Test 3 FAILED: Floating not removed\n');
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
      console.log('🎉 Floating Button: ALL TESTS PASSED!\n');
    }

    console.log('⏳ Keeping browser open for 15 seconds...\n');
    await page.waitForTimeout(15000);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await browser.close();
  }
}

testFloatingButton();
