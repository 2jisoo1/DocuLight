const puppeteer = require('puppeteer');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  try {
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle0', timeout: 10000 });
    await page.waitForSelector('#tree-container .tree-item');

    // Click guide directory
    const guideDir = await page.$('.tree-item.directory[data-path="guide"]');
    if (guideDir) {
      await guideDir.click();
      await sleep(1000);
    }

    // Click programming-samples.md
    const sampleFile = await page.$('.tree-item.file[data-path="guide/programming-samples.md"]');
    if (sampleFile) {
      await sampleFile.click();
      await sleep(2000);
    }

    // Test highlight.js manually
    const testResult = await page.evaluate(() => {
      const testCode = 'def hello():\n    print("Hello, World!")';
      const lang = 'python';

      // Test 1: Does hljs exist?
      const hljsExists = typeof hljs !== 'undefined';

      // Test 2: Can we highlight code?
      let highlightedHtml = '';
      let highlightError = null;
      if (hljsExists) {
        try {
          const result = hljs.highlight(testCode, { language: lang });
          highlightedHtml = result.value;
        } catch (e) {
          highlightError = e.message;
        }
      }

      // Test 3: What does DOMPurify do to highlighted code?
      let sanitizedHtml = '';
      if (highlightedHtml) {
        sanitizedHtml = DOMPurify.sanitize(highlightedHtml, {
          ADD_ATTR: ['class', 'data-language'],
          ADD_TAGS: ['span']
        });
      }

      // Test 4: What classes are being stripped?
      const originalClasses = (highlightedHtml.match(/class="[^"]+"/g) || []).join(', ');
      const sanitizedClasses = (sanitizedHtml.match(/class="[^"]+"/g) || []).join(', ');

      // Test 5: Check actual code block in DOM
      const actualCodeBlock = document.querySelector('pre > code');
      const actualHtml = actualCodeBlock ? actualCodeBlock.innerHTML.substring(0, 300) : '';
      const actualClasses = actualCodeBlock ? actualCodeBlock.className : '';

      return {
        hljsExists,
        highlightError,
        originalHtml: highlightedHtml.substring(0, 300),
        sanitizedHtml: sanitizedHtml.substring(0, 300),
        originalClasses,
        sanitizedClasses,
        actualHtml,
        actualClasses,
        hasSpanTags: highlightedHtml.includes('<span'),
        spansSurvived: sanitizedHtml.includes('<span')
      };
    });

    console.log('\n=== DETAILED DIAGNOSTIC RESULTS ===\n');
    console.log('1. Highlight.js loaded:', testResult.hljsExists ? 'YES ✓' : 'NO ✗');

    if (testResult.highlightError) {
      console.log('2. Highlight error:', testResult.highlightError);
    } else {
      console.log('2. Highlight.js can highlight code: YES ✓');
    }

    console.log('\n3. Original highlighted HTML (first 300 chars):');
    console.log(testResult.originalHtml);

    console.log('\n4. After DOMPurify sanitization (first 300 chars):');
    console.log(testResult.sanitizedHtml);

    console.log('\n5. Classes comparison:');
    console.log('   Original classes:', testResult.originalClasses || '(none)');
    console.log('   After sanitization:', testResult.sanitizedClasses || '(none)');

    console.log('\n6. Actual code block in DOM:');
    console.log('   Classes:', testResult.actualClasses || '(none)');
    console.log('   HTML (first 300 chars):', testResult.actualHtml);

    console.log('\n7. Span tags:');
    console.log('   Original has <span>:', testResult.hasSpanTags ? 'YES' : 'NO');
    console.log('   Spans survived sanitization:', testResult.spansSurvived ? 'YES' : 'NO');

    console.log('\n=== ROOT CAUSE ANALYSIS ===');
    if (!testResult.hljsExists) {
      console.log('❌ Problem: Highlight.js is not loaded');
    } else if (testResult.highlightError) {
      console.log('❌ Problem: Highlight.js throws error:', testResult.highlightError);
    } else if (testResult.hasSpanTags && !testResult.spansSurvived) {
      console.log('❌ Problem: DOMPurify is stripping out highlight.js markup');
      console.log('   Solution: Update DOMPurify configuration to allow hljs-* classes');
    } else if (!testResult.hasSpanTags) {
      console.log('❌ Problem: Highlight.js is not generating span tags');
    } else {
      console.log('✓ Highlight.js and DOMPurify are working correctly');
      console.log('❓ Need to investigate further why colors are not showing');
    }

  } catch (error) {
    console.error('Test failed:', error.message);
  } finally {
    await browser.close();
  }
})();
