/**
 * Phase 2 TOC Functionality Test
 *
 * Tests:
 * 1. TOC generation from headings
 * 2. TOC toggle button
 * 3. TOC item click → scroll
 * 4. TOC active state update
 * 5. Mobile overlay
 */

const { chromium } = require('playwright');

async function testPhase2TOC() {
  console.log('🧪 Phase 2: TOC Functionality Test\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  let testsPassed = 0;
  let testsFailed = 0;

  try {
    // Navigate to a document with headings
    const url = 'http://localhost:3000/doc/%ED%94%84%EB%A1%AC%ED%94%84%ED%8A%B8%20%EA%B0%95%EC%9D%98/6%EA%B0%95.%20LangChain4j%20%EA%B8%B0%EB%B0%98%20RAG%20%EC%84%A4%EA%B3%84%20%EB%B0%8F%20%EC%A7%80%EC%8B%9D%20%EA%B8%B0%EB%B0%98%20%ED%94%84%EB%A1%AC%ED%94%84%ED%8A%B8%20%EC%A0%84%EB%9E%B5';

    await page.goto(url);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    console.log('✅ Page loaded\n');

    // ========================================
    // Test 1: TOC Generation
    // ========================================
    console.log('📋 Test 1: TOC Generation');

    const tocItems = await page.locator('.toc-item').count();
    console.log(`   TOC items generated: ${tocItems}`);

    if (tocItems > 0) {
      console.log('   ✅ Test 1 PASSED: TOC generated\n');
      testsPassed++;
    } else {
      console.log('   ❌ Test 1 FAILED: No TOC items\n');
      testsFailed++;
    }

    // ========================================
    // Test 2: TOC Toggle Button
    // ========================================
    console.log('📋 Test 2: TOC Toggle Button');

    const tocToggleBtn = await page.locator('#toc-toggle-btn');
    const tocSidebar = await page.locator('#toc-sidebar');

    // Check if TOC is hidden by default
    const isHiddenInitially = await tocSidebar.evaluate(el => !el.classList.contains('open'));
    console.log(`   TOC hidden initially: ${isHiddenInitially}`);

    // Click toggle button
    await tocToggleBtn.click();
    await page.waitForTimeout(500);

    const isOpen = await tocSidebar.evaluate(el => el.classList.contains('open'));
    console.log(`   TOC open after click: ${isOpen}`);

    if (isHiddenInitially && isOpen) {
      console.log('   ✅ Test 2 PASSED: Toggle works\n');
      testsPassed++;
    } else {
      console.log('   ❌ Test 2 FAILED: Toggle not working\n');
      testsFailed++;
    }

    // Take screenshot with TOC open
    await page.screenshot({ path: 'phase2-toc-open.png', fullPage: true });
    console.log('   📸 Screenshot: phase2-toc-open.png\n');

    // ========================================
    // Test 3: TOC Item Click → Scroll
    // ========================================
    console.log('📋 Test 3: TOC Item Click → Scroll');

    // Get first TOC item
    const firstTocItem = await page.locator('.toc-item').first();
    const tocItemText = await firstTocItem.textContent();
    const headingId = await firstTocItem.getAttribute('data-heading-id');

    console.log(`   First TOC item: "${tocItemText}"`);
    console.log(`   Heading ID: "${headingId}"`);

    // Click TOC item
    await firstTocItem.click();
    await page.waitForTimeout(1000);

    // Check if URL has hash
    const currentUrl = page.url();
    const hasHash = currentUrl.includes('#');
    console.log(`   URL updated with hash: ${hasHash}`);

    if (hasHash) {
      console.log('   ✅ Test 3 PASSED: Scroll and URL update work\n');
      testsPassed++;
    } else {
      console.log('   ❌ Test 3 FAILED: URL not updated\n');
      testsFailed++;
    }

    // ========================================
    // Test 4: TOC Active State
    // ========================================
    console.log('📋 Test 4: TOC Active State');

    const activeTocItems = await page.locator('.toc-item.active').count();
    console.log(`   Active TOC items: ${activeTocItems}`);

    if (activeTocItems === 1) {
      console.log('   ✅ Test 4 PASSED: Active state set correctly\n');
      testsPassed++;
    } else {
      console.log('   ❌ Test 4 FAILED: Active state incorrect\n');
      testsFailed++;
    }

    // ========================================
    // Test 5: Mobile TOC Overlay
    // ========================================
    console.log('📋 Test 5: Mobile TOC Overlay');

    // Resize to mobile
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(500);

    // Close TOC (if open)
    const isTocOpen = await tocSidebar.evaluate(el => el.classList.contains('open'));
    if (isTocOpen) {
      await tocToggleBtn.click();
      await page.waitForTimeout(300);
    }

    // Open TOC
    await tocToggleBtn.click();
    await page.waitForTimeout(500);

    const tocOverlay = await page.locator('#toc-overlay');
    const isOverlayActive = await tocOverlay.evaluate(el => el.classList.contains('active'));
    console.log(`   TOC overlay active: ${isOverlayActive}`);

    if (isOverlayActive) {
      console.log('   ✅ Test 5 PASSED: Mobile overlay works\n');
      testsPassed++;
    } else {
      console.log('   ❌ Test 5 FAILED: Overlay not active\n');
      testsFailed++;
    }

    // Test auto-close on TOC item click (mobile)
    const secondTocItem = await page.locator('.toc-item').nth(1);
    await secondTocItem.click();
    await page.waitForTimeout(500);

    const isTocClosed = await tocSidebar.evaluate(el => !el.classList.contains('open'));
    console.log(`   TOC auto-closed on item click: ${isTocClosed}`);

    if (isTocClosed) {
      console.log('   ✅ Test 5-2 PASSED: Auto-close on click\n');
      testsPassed++;
    } else {
      console.log('   ❌ Test 5-2 FAILED: Not auto-closed\n');
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
      console.log('🎉 Phase 2 TOC: ALL TESTS PASSED!\n');
      console.log('✅ TOC 생성 정상');
      console.log('✅ TOC 토글 정상');
      console.log('✅ TOC 클릭 스크롤 정상');
      console.log('✅ Active 상태 정상');
      console.log('✅ 모바일 오버레이 정상\n');
    } else {
      console.log('⚠️  Some tests failed. Please review.\n');
    }

  } catch (error) {
    console.error('❌ Test execution error:', error);
  } finally {
    await browser.close();
  }
}

testPhase2TOC();
