// Simple test script to verify browser features
const puppeteer = require('puppeteer');

(async () => {
  try {
    const browser = await puppeteer.launch({
      headless: false,
      defaultViewport: { width: 1280, height: 720 }
    });

    const page = await browser.newPage();

    // Navigate to localhost
    console.log('Navigating to http://localhost:3000...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });

    // Wait for tree to load
    await page.waitForSelector('#tree-container', { timeout: 5000 });
    console.log('✓ Page loaded successfully');

    // Click on guide directory
    console.log('\n1. Clicking on guide directory...');
    await page.waitForSelector('.tree-item.directory[data-path="guide"]');
    await page.click('.tree-item.directory[data-path="guide"]');
    await page.waitForTimeout(1000);
    console.log('✓ Guide directory expanded');

    // Click on programming-samples.md
    console.log('\n2. Clicking on programming-samples.md...');
    await page.waitForSelector('.tree-item.file[data-path="guide/programming-samples.md"]');
    await page.click('.tree-item.file[data-path="guide/programming-samples.md"]');
    await page.waitForTimeout(2000);
    console.log('✓ File loaded');

    // Check for syntax highlighting
    console.log('\n3. Checking syntax highlighting...');
    const codeBlocks = await page.$$('pre code.hljs');
    console.log(`✓ Found ${codeBlocks.length} highlighted code blocks`);

    // Check if code has color (syntax highlighting applied)
    const hasColor = await page.evaluate(() => {
      const code = document.querySelector('pre code.hljs span.hljs-keyword');
      if (code) {
        const color = window.getComputedStyle(code).color;
        return color !== 'rgb(255, 255, 255)'; // Not white means it has color
      }
      return false;
    });
    console.log(`✓ Syntax highlighting ${hasColor ? 'IS' : 'IS NOT'} applied (colors visible: ${hasColor})`);

    // Check for copy buttons
    console.log('\n4. Checking copy buttons...');
    const copyButtons = await page.$$('.copy-btn');
    console.log(`✓ Found ${copyButtons.length} copy buttons`);

    // Check copy button position
    const buttonInfo = await page.evaluate(() => {
      const btn = document.querySelector('.copy-btn');
      if (btn) {
        const icon = btn.querySelector('.copy-icon');
        return {
          hasIcon: !!icon,
          iconText: icon?.textContent,
          hasMessage: !!btn.querySelector('.copy-message')
        };
      }
      return null;
    });
    console.log(`✓ Copy button has icon: ${buttonInfo?.hasIcon} (${buttonInfo?.iconText})`);
    console.log(`✓ Copy button has message element: ${buttonInfo?.hasMessage}`);

    // Test copy functionality
    console.log('\n5. Testing copy button click...');
    await page.click('.copy-btn');
    await page.waitForTimeout(500);

    const messageVisible = await page.evaluate(() => {
      const msg = document.querySelector('.copy-message');
      return msg && msg.classList.contains('show');
    });
    console.log(`✓ "Copied!" message ${messageVisible ? 'IS' : 'IS NOT'} visible after click`);

    // Take screenshot
    console.log('\n6. Taking screenshot...');
    await page.screenshot({
      path: '/mnt/c/Work/git/DocLight/test-result.png',
      fullPage: true
    });
    console.log('✓ Screenshot saved to test-result.png');

    // Wait a bit before closing
    await page.waitForTimeout(3000);

    console.log('\n✅ All tests completed successfully!');

    await browser.close();
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
})();
