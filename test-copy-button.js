const { chromium } = require('playwright');

async function testCopyButton() {
  console.log('Starting browser...');
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Step 1: Navigate to localhost:3000
    console.log('Step 1: Navigating to http://localhost:3000');
    await page.goto('http://localhost:3000');
    await page.waitForTimeout(1000);

    // Step 2: Click "guide" folder
    console.log('Step 2: Clicking "guide" folder');
    await page.click('text=guide');
    await page.waitForTimeout(500);

    // Step 3: Click "programming-samples.md"
    console.log('Step 3: Clicking "programming-samples.md"');
    await page.click('text=programming-samples.md');
    await page.waitForTimeout(1000);

    // Step 4: Take screenshot showing code blocks with copy buttons
    console.log('Step 4: Taking screenshot of code blocks');
    await page.screenshot({ path: 'screenshot-before-copy.png', fullPage: true });
    console.log('Screenshot saved: screenshot-before-copy.png');

    // Check if copy buttons are visible
    const copyButtons = await page.locator('.copy-btn').count();
    console.log(`Found ${copyButtons} copy buttons`);

    // Step 5: Click the first copy button
    console.log('Step 5: Clicking first copy button');
    const result = await page.evaluate(() => {
      const copyBtn = document.querySelector('.copy-btn');
      if (copyBtn) {
        copyBtn.click();
        return { found: true, clicked: true };
      }
      return { found: false };
    });
    console.log('Copy button click result:', result);

    // Step 6: Wait 500ms
    console.log('Step 6: Waiting 500ms');
    await page.waitForTimeout(500);

    // Step 7: Take another screenshot
    console.log('Step 7: Taking screenshot after copy');
    await page.screenshot({ path: 'screenshot-after-copy.png', fullPage: true });
    console.log('Screenshot saved: screenshot-after-copy.png');

    // Step 8: Check if "Copied!" message appears
    console.log('Step 8: Checking for "Copied!" message');
    const messageResult = await page.evaluate(() => {
      const message = document.querySelector('.copy-message.show');
      return {
        messageVisible: message !== null,
        messageText: message ? message.textContent : null
      };
    });
    console.log('Message check result:', messageResult);

    // Additional checks
    const copyButtonsVisible = copyButtons > 0;
    const copyButtonsHaveIcon = await page.evaluate(() => {
      const btn = document.querySelector('.copy-btn');
      return btn ? btn.textContent.includes('📋') : false;
    });

    // Final report
    console.log('\n=== TEST REPORT ===');
    console.log(`✓ Copy buttons visible: ${copyButtonsVisible} (${copyButtons} found)`);
    console.log(`✓ Copy buttons have 📋 icon: ${copyButtonsHaveIcon}`);
    console.log(`✓ Copy button clickable: ${result.found && result.clicked}`);
    console.log(`✓ "Copied!" message appears: ${messageResult.messageVisible}`);
    console.log(`✓ Message text: "${messageResult.messageText}"`);
    console.log('\nScreenshots saved:');
    console.log('  - screenshot-before-copy.png');
    console.log('  - screenshot-after-copy.png');

  } catch (error) {
    console.error('Error during test:', error);
  } finally {
    await browser.close();
  }
}

testCopyButton().catch(console.error);
