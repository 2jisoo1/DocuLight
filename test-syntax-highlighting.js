const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log('Step 1: Navigating to http://localhost:3000...');
    await page.goto('http://localhost:3000');
    await page.waitForTimeout(2000);

    console.log('Step 2: Clicking "guide" folder...');
    // Look for the guide folder link
    const guideFolder = await page.locator('text=/.*guide.*/i').first();
    await guideFolder.click();
    await page.waitForTimeout(1000);

    console.log('Step 3: Clicking "programming-samples.md" file...');
    // Look for the programming-samples.md file
    const programmingSamples = await page.locator('text=/.*programming-samples.*/i').first();
    await programmingSamples.click();
    await page.waitForTimeout(2000);

    console.log('Step 4: Taking screenshot...');
    await page.screenshot({ path: 'syntax-highlighting-test.png', fullPage: true });

    console.log('Step 5: Checking code block classes...');
    const codeBlockInfo = await page.evaluate(() => {
      const codeBlocks = document.querySelectorAll('pre code');
      if (codeBlocks.length === 0) {
        return { error: 'No code blocks found' };
      }

      const firstCode = codeBlocks[0];
      const allCodeBlocks = Array.from(codeBlocks).map((code, idx) => ({
        index: idx,
        classList: Array.from(code.classList),
        hasHljsClass: code.classList.contains('hljs'),
        parentClassList: Array.from(code.parentElement.classList),
        innerHTML: code.innerHTML.substring(0, 200),
        hasSpanElements: code.querySelector('span') !== null,
        spanClasses: Array.from(code.querySelectorAll('span[class*="hljs"]')).map(s => Array.from(s.classList))
      }));

      // Check for console errors
      const errors = window.__consoleErrors || [];

      return {
        totalCodeBlocks: codeBlocks.length,
        codeBlocks: allCodeBlocks,
        errors: errors
      };
    });

    console.log('\n=== SYNTAX HIGHLIGHTING TEST RESULTS ===\n');
    console.log('Total code blocks found:', codeBlockInfo.totalCodeBlocks);
    console.log('\nDetailed analysis:');
    console.log(JSON.stringify(codeBlockInfo, null, 2));

    // Check computed styles
    const styleInfo = await page.evaluate(() => {
      const code = document.querySelector('pre code');
      if (!code) return null;

      const computedStyle = window.getComputedStyle(code);
      const span = code.querySelector('span');
      const spanStyle = span ? window.getComputedStyle(span) : null;

      return {
        codeBackground: computedStyle.backgroundColor,
        codeColor: computedStyle.color,
        spanColor: spanStyle ? spanStyle.color : null,
        spanBackground: spanStyle ? spanStyle.backgroundColor : null
      };
    });

    console.log('\nComputed styles:');
    console.log(JSON.stringify(styleInfo, null, 2));

    console.log('\n=== SUMMARY ===');
    console.log('✓ Screenshot saved as: syntax-highlighting-test.png');
    console.log('✓ Check the screenshot for visual confirmation of syntax highlighting');

  } catch (error) {
    console.error('Error during test:', error);
  } finally {
    await browser.close();
  }
})();
