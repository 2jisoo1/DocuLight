/**
 * Phase 0 Refactoring Validation Test
 *
 * Tests:
 * 1. Left sidebar resizer drag functionality
 * 2. localStorage save/restore for sidebar width
 * 3. Mobile menu button (768px or less)
 * 4. Mobile overlay click to close
 * 5. Auto-close menu on file click (mobile)
 */

const { chromium } = require('playwright');

async function testPhase0Refactoring() {
  console.log('🧪 Phase 0 Refactoring Validation Test\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  let testsPassed = 0;
  let testsFailed = 0;

  try {
    // Navigate to app
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    console.log('✅ Page loaded successfully\n');

    // ========================================
    // Test 1: Left Sidebar Resizer Drag
    // ========================================
    console.log('📋 Test 1: Left Sidebar Resizer Drag');

    const sidebar = await page.locator('.sidebar');
    const resizer = await page.locator('#resizer');

    // Get initial width
    const initialWidth = await sidebar.evaluate(el => el.offsetWidth);
    console.log(`   Initial sidebar width: ${initialWidth}px`);

    // Drag resizer to the right (+100px)
    const resizerBox = await resizer.boundingBox();
    await page.mouse.move(resizerBox.x + resizerBox.width / 2, resizerBox.y + resizerBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(resizerBox.x + 100, resizerBox.y + resizerBox.height / 2);
    await page.mouse.up();
    await page.waitForTimeout(300);

    // Get new width
    const newWidth = await sidebar.evaluate(el => el.offsetWidth);
    console.log(`   New sidebar width: ${newWidth}px`);

    if (Math.abs(newWidth - initialWidth - 100) < 10) {
      console.log('   ✅ Test 1 PASSED: Resizer drag works correctly\n');
      testsPassed++;
    } else {
      console.log(`   ❌ Test 1 FAILED: Expected width ~${initialWidth + 100}px, got ${newWidth}px\n`);
      testsFailed++;
    }

    // ========================================
    // Test 2: localStorage Save/Restore
    // ========================================
    console.log('📋 Test 2: localStorage Save/Restore');

    // Check localStorage
    const savedWidth = await page.evaluate(() => localStorage.getItem('sidebarWidth'));
    console.log(`   localStorage sidebarWidth: ${savedWidth}px`);

    if (savedWidth && Math.abs(parseInt(savedWidth) - newWidth) < 10) {
      console.log('   ✅ Test 2 PASSED: Width saved to localStorage\n');
      testsPassed++;
    } else {
      console.log(`   ❌ Test 2 FAILED: localStorage not updated correctly\n`);
      testsFailed++;
    }

    // Reload page to test restoration
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const restoredWidth = await sidebar.evaluate(el => el.offsetWidth);
    console.log(`   Restored sidebar width: ${restoredWidth}px`);

    if (Math.abs(restoredWidth - newWidth) < 10) {
      console.log('   ✅ Test 2 PASSED: Width restored from localStorage\n');
      testsPassed++;
    } else {
      console.log(`   ❌ Test 2 FAILED: Width not restored correctly\n`);
      testsFailed++;
    }

    // ========================================
    // Test 3: Mobile Menu Button (768px)
    // ========================================
    console.log('📋 Test 3: Mobile Menu Button (768px)');

    // Resize viewport to mobile
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(500);

    // Check if mobile menu button is visible
    const mobileMenuBtn = await page.locator('#mobile-menu-btn');
    const isMobileMenuVisible = await mobileMenuBtn.isVisible();

    console.log(`   Mobile menu button visible: ${isMobileMenuVisible}`);

    if (isMobileMenuVisible) {
      console.log('   ✅ Test 3 PASSED: Mobile menu button visible\n');
      testsPassed++;
    } else {
      console.log('   ❌ Test 3 FAILED: Mobile menu button not visible\n');
      testsFailed++;
    }

    // ========================================
    // Test 4: Mobile Menu Toggle
    // ========================================
    console.log('📋 Test 4: Mobile Menu Toggle');

    // Click mobile menu button
    await mobileMenuBtn.click();
    await page.waitForTimeout(500);

    // Check if sidebar is open
    const isSidebarOpen = await sidebar.evaluate(el => el.classList.contains('open'));
    const overlay = await page.locator('#mobile-overlay');
    const isOverlayActive = await overlay.evaluate(el => el.classList.contains('active'));

    console.log(`   Sidebar open: ${isSidebarOpen}`);
    console.log(`   Overlay active: ${isOverlayActive}`);

    if (isSidebarOpen && isOverlayActive) {
      console.log('   ✅ Test 4 PASSED: Mobile menu opens correctly\n');
      testsPassed++;
    } else {
      console.log('   ❌ Test 4 FAILED: Mobile menu toggle not working\n');
      testsFailed++;
    }

    // ========================================
    // Test 5: Overlay Click to Close
    // ========================================
    console.log('📋 Test 5: Overlay Click to Close');

    // Click overlay (click on right side where sidebar is not covering)
    await page.mouse.click(350, 300);  // Right side of overlay
    await page.waitForTimeout(500);

    const isSidebarClosed = await sidebar.evaluate(el => !el.classList.contains('open'));
    const isOverlayClosed = await overlay.evaluate(el => !el.classList.contains('active'));

    console.log(`   Sidebar closed: ${isSidebarClosed}`);
    console.log(`   Overlay inactive: ${isOverlayClosed}`);

    if (isSidebarClosed && isOverlayClosed) {
      console.log('   ✅ Test 5 PASSED: Overlay closes mobile menu\n');
      testsPassed++;
    } else {
      console.log('   ❌ Test 5 FAILED: Overlay click not working\n');
      testsFailed++;
    }

    // ========================================
    // Test 6: Auto-Close on File Click (Mobile)
    // ========================================
    console.log('📋 Test 6: Auto-Close on File Click (Mobile)');

    // Open menu again
    await mobileMenuBtn.click();
    await page.waitForTimeout(500);

    // Click a file
    const fileItem = await page.locator('.tree-item.file').first();
    await fileItem.click();
    await page.waitForTimeout(1000);

    const isAutoClose = await sidebar.evaluate(el => !el.classList.contains('open'));
    console.log(`   Sidebar auto-closed: ${isAutoClose}`);

    if (isAutoClose) {
      console.log('   ✅ Test 6 PASSED: Menu auto-closes on file click\n');
      testsPassed++;
    } else {
      console.log('   ❌ Test 6 FAILED: Auto-close not working\n');
      testsFailed++;
    }

    // ========================================
    // Test 7: Desktop View Restoration
    // ========================================
    console.log('📋 Test 7: Desktop View Restoration');

    // Resize back to desktop
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForTimeout(500);

    const isMobileMenuHidden = await mobileMenuBtn.evaluate(el => {
      const style = window.getComputedStyle(el);
      return style.display === 'none';
    });

    console.log(`   Mobile menu button hidden: ${isMobileMenuHidden}`);

    if (isMobileMenuHidden) {
      console.log('   ✅ Test 7 PASSED: Desktop view restored correctly\n');
      testsPassed++;
    } else {
      console.log('   ❌ Test 7 FAILED: Desktop view not restored\n');
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
      console.log('🎉 Phase 0 Refactoring: ALL TESTS PASSED!\n');
      console.log('✅ 기존 기능 100% 정상 작동');
      console.log('✅ Resizer 범용 함수 정상');
      console.log('✅ Mobile Panel 범용 함수 정상');
      console.log('✅ CSS 공통 스타일 정상\n');
      console.log('🚀 Phase 0 완료: 우측 TOC 구현 준비 완료!\n');
    } else {
      console.log('⚠️  Some tests failed. Please review the issues.\n');
    }

  } catch (error) {
    console.error('❌ Test execution error:', error);
  } finally {
    await browser.close();
  }
}

testPhase0Refactoring();
