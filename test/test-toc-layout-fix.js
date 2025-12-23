/**
 * Test TOC Layout Fix - Document should not be covered
 */

const { chromium } = require('playwright');

async function testTOCLayoutFix() {
  console.log('🧪 TOC Layout Fix Test\n');

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

    // ========================================
    // Test 1: No White Space Initially
    // ========================================
    console.log('📋 Test 1: No White Space Initially (TOC Closed)');

    const mainContent = await page.locator('.main-content');
    const initialMarginRight = await mainContent.evaluate(el => {
      return window.getComputedStyle(el).marginRight;
    });

    console.log(`   Initial margin-right: ${initialMarginRight}`);

    await page.screenshot({ path: 'test-toc-closed.png', fullPage: true });
    console.log('   📸 Screenshot: test-toc-closed.png');

    if (initialMarginRight === '0px') {
      console.log('   ✅ Test 1 PASSED: No white space\n');
      testsPassed++;
    } else {
      console.log(`   ❌ Test 1 FAILED: Has margin ${initialMarginRight}\n`);
      testsFailed++;
    }

    // ========================================
    // Test 2: TOC Opens Without Covering Document
    // ========================================
    console.log('📋 Test 2: TOC Opens Without Covering Document');

    const tocToggleBtn = await page.locator('#toc-toggle-btn');
    await tocToggleBtn.click();
    await page.waitForTimeout(1000);  // Wait for animation

    const openMarginRight = await mainContent.evaluate(el => {
      return window.getComputedStyle(el).marginRight;
    });

    console.log(`   Margin-right after opening: ${openMarginRight}`);

    await page.screenshot({ path: 'test-toc-open.png', fullPage: true });
    console.log('   📸 Screenshot: test-toc-open.png');

    // Check if margin-right equals TOC width
    const tocSidebar = await page.locator('#toc-sidebar');
    const tocWidth = await tocSidebar.evaluate(el => el.offsetWidth);

    console.log(`   TOC width: ${tocWidth}px`);
    console.log(`   Expected margin-right: ${tocWidth}px`);

    if (parseInt(openMarginRight) === tocWidth) {
      console.log('   ✅ Test 2 PASSED: Main content adjusted correctly\n');
      testsPassed++;
    } else {
      console.log(`   ❌ Test 2 FAILED: Margin not adjusted (expected ${tocWidth}px, got ${openMarginRight})\n`);
      testsFailed++;
    }

    // ========================================
    // Test 3: Document Content Not Covered
    // ========================================
    console.log('📋 Test 3: Document Content Not Covered');

    // Get document heading position
    const heading = await page.locator('h2').first();
    const headingBox = await heading.boundingBox();

    // Get TOC sidebar position
    const tocBox = await tocSidebar.boundingBox();

    console.log(`   Document heading X: ${headingBox.x}`);
    console.log(`   TOC sidebar X: ${tocBox.x}`);

    // Check if heading is not covered (heading should be to the left of TOC)
    const isNotCovered = headingBox.x + headingBox.width < tocBox.x;

    console.log(`   Document not covered: ${isNotCovered}`);

    if (isNotCovered) {
      console.log('   ✅ Test 3 PASSED: Document not covered by TOC\n');
      testsPassed++;
    } else {
      console.log('   ❌ Test 3 FAILED: Document is covered by TOC\n');
      testsFailed++;
    }

    // ========================================
    // Test 4: Close TOC - Margin Restored
    // ========================================
    console.log('📋 Test 4: Close TOC - Margin Restored');

    await tocToggleBtn.click();
    await page.waitForTimeout(1000);  // Wait for animation

    const closedMarginRight = await mainContent.evaluate(el => {
      return window.getComputedStyle(el).marginRight;
    });

    console.log(`   Margin-right after closing: ${closedMarginRight}`);

    if (closedMarginRight === '0px') {
      console.log('   ✅ Test 4 PASSED: Margin restored to 0\n');
      testsPassed++;
    } else {
      console.log(`   ❌ Test 4 FAILED: Margin not restored (${closedMarginRight})\n`);
      testsFailed++;
    }

    // ========================================
    // Test Summary
    // ========================================
    console.log('═══════════════════════════════════════');
    console.log('📊 Test Summary');
    console.log('═══════════════════════════════════════');
    console.log(`✅ Passed: ${testsPassed}`);
    console.log(`❌ Failed: ${testsFailed}`);
    console.log(`📈 Total: ${testsPassed + testsFailed}`);
    console.log(`🎯 Success Rate: ${((testsPassed / (testsPassed + testsFailed)) * 100).toFixed(1)}%`);
    console.log('═══════════════════════════════════════\n');

    if (testsFailed === 0) {
      console.log('🎉 TOC Layout: ALL TESTS PASSED!\n');
      console.log('✅ 흰색 공간 없음');
      console.log('✅ TOC가 문서 안 가림');
      console.log('✅ Margin 자동 조정');
      console.log('✅ 부드러운 전환\n');
    } else {
      console.log('⚠️  Some tests failed. Review needed.\n');
    }

  } catch (error) {
    console.error('❌ Test error:', error);
  } finally {
    await browser.close();
  }
}

testTOCLayoutFix();
