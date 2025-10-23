const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    // Navigate to the page
    await page.goto('http://localhost:3000');

    // Wait 2 seconds for page to load
    await page.waitForTimeout(2000);

    // Take full page screenshot
    await page.screenshot({
      path: 'header-height-test.png',
      fullPage: true
    });
    console.log('✓ Screenshot saved as header-height-test.png');

    // Measure header heights
    const measurements = await page.evaluate(() => {
      const sidebarHeader = document.querySelector('.sidebar-header');
      const contentHeader = document.querySelector('.content-header');

      if (!sidebarHeader || !contentHeader) {
        return {
          error: 'Headers not found',
          sidebarFound: !!sidebarHeader,
          contentFound: !!contentHeader
        };
      }

      const sidebarRect = sidebarHeader.getBoundingClientRect();
      const contentRect = contentHeader.getBoundingClientRect();

      const sidebarStyle = window.getComputedStyle(sidebarHeader);
      const contentStyle = window.getComputedStyle(contentHeader);

      return {
        sidebar: {
          height: sidebarRect.height,
          padding: sidebarStyle.padding,
          paddingTop: sidebarStyle.paddingTop,
          paddingBottom: sidebarStyle.paddingBottom,
          fontSize: sidebarHeader.querySelector('h1') ? window.getComputedStyle(sidebarHeader.querySelector('h1')).fontSize : null
        },
        content: {
          height: contentRect.height,
          padding: contentStyle.padding,
          paddingTop: contentStyle.paddingTop,
          paddingBottom: contentStyle.paddingBottom,
          fontSize: contentStyle.fontSize
        },
        difference: Math.abs(sidebarRect.height - contentRect.height),
        areEqual: Math.abs(sidebarRect.height - contentRect.height) < 2
      };
    });

    if (measurements.error) {
      console.error('❌ Error:', measurements.error);
      console.log('Sidebar found:', measurements.sidebarFound);
      console.log('Content found:', measurements.contentFound);
    } else {
      console.log('\n=== HEADER HEIGHT MEASUREMENTS ===\n');
      console.log('📏 Sidebar Header:');
      console.log(`   Height: ${measurements.sidebar.height}px`);
      console.log(`   Padding: ${measurements.sidebar.padding}`);
      console.log(`   Padding Top: ${measurements.sidebar.paddingTop}`);
      console.log(`   Padding Bottom: ${measurements.sidebar.paddingBottom}`);
      console.log(`   Font Size (h1): ${measurements.sidebar.fontSize}`);

      console.log('\n📏 Content Header:');
      console.log(`   Height: ${measurements.content.height}px`);
      console.log(`   Padding: ${measurements.content.padding}`);
      console.log(`   Padding Top: ${measurements.content.paddingTop}`);
      console.log(`   Padding Bottom: ${measurements.content.paddingBottom}`);
      console.log(`   Font Size: ${measurements.content.fontSize}`);

      console.log('\n📊 Comparison:');
      console.log(`   Difference: ${measurements.difference.toFixed(2)}px`);
      console.log(`   Are Equal (within 2px): ${measurements.areEqual ? '✓ YES' : '✗ NO'}`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
  }
})();
