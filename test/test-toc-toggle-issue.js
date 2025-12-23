/**
 * TOC Toggle Button Issue Diagnosis
 */

const { chromium } = require('playwright');

async function testTOCToggle() {
  console.log('🔍 TOC Toggle Button Diagnosis\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Collect console messages
  page.on('console', msg => {
    console.log(`  [${msg.type().toUpperCase()}] ${msg.text()}`);
  });

  page.on('pageerror', error => {
    console.error(`  [ERROR] ${error.message}`);
  });

  try {
    console.log('Loading document with headings...\n');

    const url = 'http://localhost:3000/doc/%ED%94%84%EB%A1%AC%ED%94%84%ED%8A%B8%20%EA%B0%95%EC%9D%98/6%EA%B0%95.%20LangChain4j%20%EA%B8%B0%EB%B0%98%20RAG%20%EC%84%A4%EA%B3%84%20%EB%B0%8F%20%EC%A7%80%EC%8B%9D%20%EA%B8%B0%EB%B0%98%20%ED%94%84%EB%A1%AC%ED%94%84%ED%8A%B8%20%EC%A0%84%EB%9E%B5';

    await page.goto(url);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    console.log('✅ Page loaded\n');

    // Check initial state
    console.log('📋 Step 1: Check Initial State');

    const tocToggleBtn = await page.locator('#toc-toggle-btn');
    const tocSidebar = await page.locator('#toc-sidebar');
    const tocTree = await page.locator('#toc-tree');

    const btnExists = await tocToggleBtn.count();
    const sidebarExists = await tocSidebar.count();
    const tocItemCount = await page.locator('.toc-item').count();

    console.log(`   TOC Toggle Button exists: ${btnExists > 0}`);
    console.log(`   TOC Sidebar exists: ${sidebarExists > 0}`);
    console.log(`   TOC Items count: ${tocItemCount}`);

    // Check initial visibility
    const initialTransform = await tocSidebar.evaluate(el => {
      return window.getComputedStyle(el).transform;
    });
    const hasOpenClass = await tocSidebar.evaluate(el => el.classList.contains('open'));

    console.log(`   Initial transform: ${initialTransform}`);
    console.log(`   Has 'open' class: ${hasOpenClass}`);

    await page.screenshot({ path: 'toc-before-click.png', fullPage: true });
    console.log('   📸 Screenshot: toc-before-click.png\n');

    // Click toggle button
    console.log('📋 Step 2: Click Toggle Button');

    await tocToggleBtn.click();
    await page.waitForTimeout(1000);

    // Check after click
    const afterTransform = await tocSidebar.evaluate(el => {
      return window.getComputedStyle(el).transform;
    });
    const hasOpenClassAfter = await tocSidebar.evaluate(el => el.classList.contains('open'));

    console.log(`   Transform after click: ${afterTransform}`);
    console.log(`   Has 'open' class after click: ${hasOpenClassAfter}`);

    await page.screenshot({ path: 'toc-after-click.png', fullPage: true });
    console.log('   📸 Screenshot: toc-after-click.png\n');

    // Check if TOC is visible
    const tocBoundingBox = await tocSidebar.boundingBox();
    console.log(`   TOC bounding box:`, tocBoundingBox);

    // Check CSS
    const tocStyles = await tocSidebar.evaluate(el => {
      const styles = window.getComputedStyle(el);
      return {
        position: styles.position,
        right: styles.right,
        width: styles.width,
        transform: styles.transform,
        transition: styles.transition,
        display: styles.display,
        visibility: styles.visibility
      };
    });

    console.log('\n   Computed styles:', tocStyles);

    // Diagnosis
    console.log('\n═══════════════════════════════════════');
    console.log('🔍 Diagnosis');
    console.log('═══════════════════════════════════════\n');

    if (tocItemCount === 0) {
      console.log('❌ ISSUE: No TOC items generated');
      console.log('   → Check generateTOC() and renderTOC() functions');
    } else {
      console.log(`✅ TOC generated: ${tocItemCount} items`);
    }

    if (!hasOpenClassAfter) {
      console.log('❌ ISSUE: "open" class not added after click');
      console.log('   → Check initTOCToggle() event listener');
    } else {
      console.log('✅ "open" class added correctly');
    }

    if (afterTransform.includes('matrix(1, 0, 0, 1, 0, 0)') || afterTransform === 'none') {
      console.log('✅ Transform looks correct (translateX(0))');
    } else {
      console.log('❌ ISSUE: Transform not applied correctly');
      console.log(`   → Current: ${afterTransform}`);
      console.log('   → Expected: translateX(0) or matrix(1, 0, 0, 1, 0, 0)');
    }

    if (tocBoundingBox && tocBoundingBox.width > 0) {
      console.log('✅ TOC is visible on screen');
    } else {
      console.log('❌ ISSUE: TOC not visible');
      console.log('   → Check CSS positioning and transform');
    }

    console.log('\n⏳ Keeping browser open for 20 seconds...\n');
    await page.waitForTimeout(20000);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await browser.close();
  }
}

testTOCToggle();
