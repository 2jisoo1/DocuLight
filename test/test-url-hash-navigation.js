/**
 * Test URL Hash Navigation
 * Direct navigation to specific heading via URL hash
 */

const { chromium } = require('playwright');

async function testHashNavigation() {
  console.log('🧪 URL Hash Navigation Test\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();

  // Collect console messages
  page.on('console', msg => {
    console.log(`  [CONSOLE] ${msg.text()}`);
  });

  try {
    const url = 'http://localhost:3000/doc/%ED%94%84%EB%A1%AC%ED%94%84%ED%8A%B8%20%EA%B0%95%EC%9D%98/1%EA%B0%95.%20%ED%94%84%EB%A1%AC%ED%94%84%ED%8A%B8%20%EA%B5%AC%EC%A1%B0%EC%99%80%20%EA%B8%B0%EB%8A%A5%20%ED%83%90%EA%B5%AC#%EB%AC%B8%EC%A0%9C-%EC%83%81%ED%99%A9-2-%EB%B3%B5%EC%9E%A1%ED%95%9C-%ED%8C%8C%EB%9D%BC%EB%AF%B8%ED%84%B0-%EC%B6%94%EC%B6%9C-%EC%8B%A4%ED%8C%A8';

    console.log('📋 Step 1: Navigate to URL with Hash');
    console.log(`   URL: ${url}\n`);

    await page.goto(url);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    console.log('✅ Page loaded\n');

    // Check breadcrumb
    console.log('📋 Step 2: Check Document Loading');

    const breadcrumb = await page.locator('#breadcrumb').textContent();
    console.log(`   Breadcrumb: "${breadcrumb}"`);

    const documentTitle = await page.locator('.document-title').count();
    console.log(`   Document title visible: ${documentTitle > 0}`);

    const welcomeVisible = await page.locator('.welcome').count();
    console.log(`   Welcome screen visible: ${welcomeVisible > 0}\n`);

    // Check URL hash
    const currentUrl = page.url();
    const hasHash = currentUrl.includes('#');
    const hashPart = hasHash ? currentUrl.split('#')[1] : '';

    console.log(`   Current URL: ${currentUrl}`);
    console.log(`   Has hash: ${hasHash}`);
    console.log(`   Hash part: ${decodeURIComponent(hashPart)}\n`);

    // Check target element
    console.log('📋 Step 3: Check Target Heading');

    const targetId = decodeURIComponent(hashPart);

    const targetHeading = await page.evaluate((id) => {
      const element = document.getElementById(id);
      return element ? 1 : 0;
    }, targetId);

    console.log(`   Target heading ID: "${targetId}"`);
    console.log(`   Target heading exists: ${targetHeading > 0}`);

    if (targetHeading > 0) {
      // Check if heading is in viewport
      const isInViewport = await page.evaluate((id) => {
        const element = document.getElementById(id);
        if (!element) return false;

        const rect = element.getBoundingClientRect();
        const mainContent = document.querySelector('.main-content');
        const mainRect = mainContent.getBoundingClientRect();

        return (
          rect.top >= mainRect.top &&
          rect.bottom <= mainRect.bottom
        );
      }, targetId);

      console.log(`   Heading in viewport: ${isInViewport}`);

      // Get scroll position
      const scrollTop = await page.evaluate(() => {
        return document.querySelector('.main-content').scrollTop;
      });

      console.log(`   Main-content scrollTop: ${scrollTop}px\n`);

      if (isInViewport || scrollTop > 0) {
        console.log('   ✅ Scrolled to heading\n');
      } else {
        console.log('   ❌ Not scrolled to heading\n');
      }
    } else {
      console.log('   ❌ Target heading not found\n');
    }

    // Check TOC active state
    console.log('📋 Step 4: Check TOC Active State');

    // Open TOC to check
    const tocToggleBtn = await page.locator('#toc-toggle-btn');
    if (await tocToggleBtn.isVisible()) {
      await tocToggleBtn.click();
      await page.waitForTimeout(500);
    }

    const activeTocItems = await page.locator('.toc-item.active').count();
    console.log(`   Active TOC items: ${activeTocItems}`);

    if (activeTocItems > 0) {
      const activeTocText = await page.locator('.toc-item.active').textContent();
      console.log(`   Active item text: "${activeTocText}"`);
    }

    await page.screenshot({ path: 'hash-navigation-result.png', fullPage: true });
    console.log('   📸 Screenshot: hash-navigation-result.png\n');

    // Diagnosis
    console.log('═══════════════════════════════════════');
    console.log('🔍 Diagnosis');
    console.log('═══════════════════════════════════════\n');

    if (welcomeVisible > 0) {
      console.log('❌ ISSUE 1: Still showing welcome screen');
      console.log('   → Document not loaded from URL\n');
    }

    if (targetHeading === 0) {
      console.log('❌ ISSUE 2: Target heading not found');
      console.log('   → Heading ID generation issue or document not loaded\n');
    }

    if (targetHeading > 0 && scrollTop === 0) {
      console.log('❌ ISSUE 3: Not scrolled to target');
      console.log('   → Hash scroll not triggered\n');
    }

    if (activeTocItems === 0) {
      console.log('⚠️  WARNING: No active TOC item');
      console.log('   → Active state not set from hash\n');
    }

    console.log('⏳ Keeping browser open for 30 seconds...\n');
    await page.waitForTimeout(30000);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await browser.close();
  }
}

testHashNavigation();
