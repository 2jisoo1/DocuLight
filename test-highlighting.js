const puppeteer = require('puppeteer');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  // Enable console logging
  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));

  try {
    console.log('Navigating to http://localhost:3000...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle0', timeout: 10000 });

    console.log('\n=== Step 1: Navigate to localhost:3000 ===');
    console.log('✓ Page loaded successfully');

    // Wait for tree to load
    await page.waitForSelector('#tree-container .tree-item', { timeout: 5000 });
    console.log('✓ File tree loaded');

    console.log('\n=== Step 2: Click on "guide" directory ===');
    // Find and click the guide directory
    const guideDir = await page.$('.tree-item.directory[data-path="guide"]');
    if (guideDir) {
      await guideDir.click();
      console.log('✓ Clicked "guide" directory');
      await sleep(1000);
    } else {
      console.log('✗ "guide" directory not found');
    }

    console.log('\n=== Step 3: Click on "programming-samples.md" ===');
    // Find and click programming-samples.md
    const sampleFile = await page.$('.tree-item.file[data-path="guide/programming-samples.md"]');
    if (sampleFile) {
      await sampleFile.click();
      console.log('✓ Clicked "programming-samples.md"');
      await sleep(2000);
    } else {
      console.log('✗ "programming-samples.md" not found');
    }

    console.log('\n=== Step 4: Take screenshot ===');
    await page.screenshot({
      path: '/mnt/c/Work/git/DocLight/test-screenshot.png',
      fullPage: true
    });
    console.log('✓ Screenshot saved to test-screenshot.png');

    console.log('\n=== Step 5: Check console for errors ===');
    const consoleLogs = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleLogs.push(`ERROR: ${msg.text()}`);
      }
    });

    await sleep(1000);

    if (consoleLogs.length === 0) {
      console.log('✓ No console errors found');
    } else {
      console.log('✗ Console errors:');
      consoleLogs.forEach(log => console.log(`  ${log}`));
    }

    console.log('\n=== Step 6: Inspect code block elements ===');

    // Check if code blocks exist
    const codeBlocks = await page.$$('pre > code');
    console.log(`✓ Found ${codeBlocks.length} code blocks`);

    if (codeBlocks.length > 0) {
      // Check first code block for highlighting classes
      const firstCodeBlock = codeBlocks[0];
      const classes = await firstCodeBlock.evaluate(el => el.className);
      const innerHTML = await firstCodeBlock.evaluate(el => el.innerHTML.substring(0, 200));

      console.log('\nFirst code block analysis:');
      console.log(`  Classes: ${classes || '(none)'}`);
      console.log(`  Has hljs classes: ${classes.includes('hljs') ? 'YES' : 'NO'}`);
      console.log(`  Has language-specific classes: ${/language-\w+/.test(classes) ? 'YES' : 'NO'}`);
      console.log(`  Has <span> elements (syntax highlighting): ${innerHTML.includes('<span') ? 'YES' : 'NO'}`);
      console.log(`  Sample HTML (first 200 chars): ${innerHTML}`);
    }

    // Check for copy buttons
    const copyButtons = await page.$$('.copy-btn');
    console.log(`\n✓ Found ${copyButtons.length} copy buttons`);

    // Check if code has colors
    const hasColors = await page.evaluate(() => {
      const codeBlock = document.querySelector('pre > code');
      if (!codeBlock) return false;

      const spans = codeBlock.querySelectorAll('span[class*="hljs-"]');
      if (spans.length === 0) return false;

      // Check if any span has computed color different from parent
      const parentColor = window.getComputedStyle(codeBlock).color;
      for (let span of spans) {
        const spanColor = window.getComputedStyle(span).color;
        if (spanColor !== parentColor) {
          return true;
        }
      }
      return false;
    });

    console.log('\n=== FINAL RESULTS ===');
    console.log(`Syntax highlighting colors: ${hasColors ? 'YES ✓' : 'NO ✗'}`);
    console.log(`Copy buttons present: ${copyButtons.length > 0 ? 'YES ✓' : 'NO ✗'}`);
    console.log(`Console errors: ${consoleLogs.length === 0 ? 'NONE ✓' : consoleLogs.length + ' ✗'}`);
  } catch (error) {
    console.error('Test failed:', error.message);
    await page.screenshot({ path: '/mnt/c/Work/git/DocLight/error-screenshot.png' });
    console.log('Error screenshot saved to error-screenshot.png');
  } finally {
    await browser.close();
  }
})();
