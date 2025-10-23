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

    const testResult = await page.evaluate(() => {
      // Test marked configuration
      const testMarkdown = '```python\ndef hello():\n    print("Hello")\n```';

      // Configure marked with highlight
      marked.setOptions({
        breaks: true,
        gfm: true,
        headerIds: true,
        mangle: false,
        highlight: function(code, lang) {
          console.log('HIGHLIGHT CALLBACK CALLED:', lang);
          if (lang && hljs.getLanguage(lang)) {
            try {
              const result = hljs.highlight(code, { language: lang });
              console.log('Highlighted result:', result.value.substring(0, 100));
              return result.value;
            } catch (error) {
              console.error('Highlight error:', error);
            }
          }
          return code;
        }
      });

      // Test marked.parse
      const parsedHtml = marked.parse(testMarkdown);

      return {
        markedVersion: marked.version || 'unknown',
        parsedHtml: parsedHtml,
        hasHljsClasses: parsedHtml.includes('hljs-'),
        hasSpanTags: parsedHtml.includes('<span'),
        options: marked.getDefaults ? marked.getDefaults() : 'getDefaults not available'
      };
    });

    console.log('\n=== MARKED.JS CONFIGURATION TEST ===\n');
    console.log('Marked version:', testResult.markedVersion);
    console.log('\nParsed HTML:');
    console.log(testResult.parsedHtml);
    console.log('\nHas hljs-* classes:', testResult.hasHljsClasses ? 'YES' : 'NO');
    console.log('Has <span> tags:', testResult.hasSpanTags ? 'YES' : 'NO');

    if (!testResult.hasHljsClasses) {
      console.log('\n❌ PROBLEM FOUND: marked.setOptions({ highlight: ... }) is not working!');
      console.log('This is likely due to marked.js v11+ API changes.');
      console.log('\nIn marked v11+, the highlight option was removed.');
      console.log('You need to use a custom renderer or marked-highlight extension instead.');
    }

  } catch (error) {
    console.error('Test failed:', error.message);
  } finally {
    await browser.close();
  }
})();
