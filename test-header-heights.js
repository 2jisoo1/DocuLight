const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  try {
    // Navigate to localhost:3000
    console.log('Navigating to http://localhost:3000...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });

    // Wait 2 seconds
    console.log('Waiting 2 seconds...');
    await page.waitForTimeout(2000);

    // Take screenshot
    console.log('Taking screenshot...');
    await page.screenshot({ path: 'header-height-fixed.png', fullPage: false });
    console.log('Screenshot saved as header-height-fixed.png');

    // Measure heights
    console.log('\nMeasuring header heights...');
    const measurements = await page.evaluate(() => {
      const sidebarHeader = document.querySelector('.sidebar-header');
      const contentHeader = document.querySelector('.content-header');

      if (!sidebarHeader || !contentHeader) {
        return { error: 'Headers not found' };
      }

      const sidebarRect = sidebarHeader.getBoundingClientRect();
      const contentRect = contentHeader.getBoundingClientRect();

      const sidebarStyle = window.getComputedStyle(sidebarHeader);
      const contentStyle = window.getComputedStyle(contentHeader);
      const sidebarH1 = sidebarHeader.querySelector('h1');
      const sidebarH1Style = sidebarH1 ? window.getComputedStyle(sidebarH1) : null;

      return {
        sidebar: {
          height: Math.round(sidebarRect.height * 100) / 100,
          minHeight: sidebarStyle.minHeight,
          padding: sidebarStyle.padding,
          h1FontSize: sidebarH1Style ? sidebarH1Style.fontSize : null
        },
        content: {
          height: Math.round(contentRect.height * 100) / 100,
          minHeight: contentStyle.minHeight,
          padding: contentStyle.padding
        },
        difference: Math.round(Math.abs(sidebarRect.height - contentRect.height) * 100) / 100,
        equal: Math.abs(sidebarRect.height - contentRect.height) < 2
      };
    });

    // Report results
    console.log('\n=== HEADER HEIGHT TEST RESULTS ===\n');

    if (measurements.error) {
      console.log('ERROR:', measurements.error);
    } else {
      console.log('SIDEBAR HEADER:');
      console.log(`  Height: ${measurements.sidebar.height}px`);
      console.log(`  Min-Height: ${measurements.sidebar.minHeight}`);
      console.log(`  Padding: ${measurements.sidebar.padding}`);
      console.log(`  H1 Font Size: ${measurements.sidebar.h1FontSize || 'N/A'}`);

      console.log('\nCONTENT HEADER:');
      console.log(`  Height: ${measurements.content.height}px`);
      console.log(`  Min-Height: ${measurements.content.minHeight}`);
      console.log(`  Padding: ${measurements.content.padding}`);

      console.log('\nCOMPARISON:');
      console.log(`  Difference: ${measurements.difference}px`);
      console.log(`  Equal (within 2px): ${measurements.equal ? 'YES ✓' : 'NO ✗'}`);

      if (!measurements.equal) {
        console.log('\n⚠️  Headers are NOT equal. Adjustment needed.');
      } else {
        console.log('\n✓ Headers are equal!');
      }
    }

  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await browser.close();
  }
})();
