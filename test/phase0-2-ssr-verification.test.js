/**
 * Phase 0-2: Server-Side Rendering Verification Test
 *
 * Purpose: Verify that server-side markdown rendering works identically to client-side
 *
 * Tests:
 * 1. Marked SSR - Convert markdown to HTML
 * 2. DOMPurify SSR - XSS protection
 * 3. Korean text handling - Ensure Korean characters work properly
 * 4. Heading ID generation - Must match client-side logic exactly
 */

const marked = require('marked');
const createDOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');
const hljs = require('highlight.js');

console.log('=== Phase 0-2: Server-Side Rendering Verification Test ===\n');

// Initialize JSDOM for server-side DOM
const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);

// Test results tracking
const results = {
  passed: [],
  failed: []
};

/**
 * Test helper function
 */
function test(name, fn) {
  try {
    fn();
    results.passed.push(name);
    console.log(`✅ PASS: ${name}`);
  } catch (error) {
    results.failed.push({ name, error: error.message });
    console.log(`❌ FAIL: ${name}`);
    console.log(`   Error: ${error.message}\n`);
  }
}

/**
 * Configure marked with custom heading renderer (same as client)
 */
function setupMarkedRenderer() {
  const renderer = new marked.Renderer();

  // Custom heading renderer with ID generation (MUST match client logic)
  // marked v4+ API: heading({ text, depth, raw })
  renderer.heading = function({ text, depth, raw }) {
    // Generate ID from heading text (slug format)
    // Keep alphanumeric, spaces, hyphens, and Korean characters (가-힣)
    // Note: raw may include markdown symbols, use text for cleaner ID generation
    const cleanRaw = (raw || text).trim();
    const id = cleanRaw
      .toLowerCase()
      .replace(/[^\w\s\-가-힣]/gu, '') // Keep Korean characters
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '') // Remove leading/trailing hyphens
      .trim();

    return `<h${depth} id="${id}">${text}</h${depth}>\n`;
  };

  // Code highlighting renderer
  // marked v4+ API: code({ text, lang, escaped })
  renderer.code = function({ text, lang, escaped }) {
    const code = text;
    const language = lang;

    if (language && hljs.getLanguage(language)) {
      try {
        const highlighted = hljs.highlight(code, { language }).value;
        return `<pre><code class="hljs language-${language}">${highlighted}</code></pre>`;
      } catch (error) {
        console.warn('Code highlighting failed:', error.message);
      }
    }
    // Always escape HTML in code blocks for safety
    const escapedCode = code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
    return `<pre><code>${escapedCode}</code></pre>`;
  };

  marked.setOptions({
    breaks: true,
    gfm: true,
    renderer: renderer
  });

  return renderer;
}

// Setup marked renderer
setupMarkedRenderer();

// Test 1: Basic marked parsing
test('marked.parse() converts markdown to HTML', () => {
  const markdown = '# Hello World\n\nThis is a paragraph.';
  const html = marked.parse(markdown);

  if (!html.includes('<h1')) {
    throw new Error('Did not generate h1 tag');
  }

  if (!html.includes('Hello World')) {
    throw new Error('Lost heading text');
  }

  if (!html.includes('<p>')) {
    throw new Error('Did not generate paragraph tag');
  }
});

// Test 2: DOMPurify XSS protection
test('DOMPurify.sanitize() removes XSS attacks', () => {
  const dirty = '<script>alert("xss")</script><p>Safe content</p>';
  const clean = DOMPurify.sanitize(dirty);

  if (clean.includes('<script>')) {
    throw new Error('Failed to remove script tag');
  }

  if (!clean.includes('Safe content')) {
    throw new Error('Removed safe content');
  }
});

// Test 3: Korean text handling
test('Korean text is preserved in markdown parsing', () => {
  const markdown = '## 한글 제목\n\n가나다라마바사';
  const html = marked.parse(markdown);

  if (!html.includes('한글 제목')) {
    throw new Error('Lost Korean heading text');
  }

  if (!html.includes('가나다라마바사')) {
    throw new Error('Lost Korean paragraph text');
  }
});

// Test 4: Heading ID generation (must match client exactly)
test('Heading ID generation matches client logic', () => {
  const testCases = [
    { markdown: '# Hello World', expectedId: 'hello-world' },
    { markdown: '## 한글 제목', expectedId: '한글-제목' },
    { markdown: '### Mixed 한글 English', expectedId: 'mixed-한글-english' },
    { markdown: '#### Hello-World', expectedId: 'hello-world' },
    { markdown: '##### Hello   World', expectedId: 'hello-world' },
    { markdown: '###### Hello--World', expectedId: 'hello-world' },
    { markdown: '# Special !@#$%^& Characters', expectedId: 'special-characters' } // Fixed: -+ -> -
  ];

  for (const { markdown, expectedId } of testCases) {
    const html = marked.parse(markdown);
    const idMatch = html.match(/id="([^"]+)"/);

    if (!idMatch) {
      throw new Error(`No ID generated for: ${markdown}`);
    }

    const actualId = idMatch[1];
    if (actualId !== expectedId) {
      throw new Error(
        `ID mismatch for "${markdown}":\n` +
        `  Expected: "${expectedId}"\n` +
        `  Actual: "${actualId}"`
      );
    }
  }
});

// Test 5: Code highlighting
test('Code highlighting works with highlight.js', () => {
  const markdown = '```javascript\nconst x = 42;\nconsole.log(x);\n```';
  const html = marked.parse(markdown);

  if (!html.includes('class="hljs')) {
    throw new Error('No hljs class found');
  }

  if (!html.includes('language-javascript')) {
    throw new Error('No language class found');
  }
});

// Test 6: Multiple code blocks with different languages
test('Multiple code blocks are highlighted correctly', () => {
  const markdown = `
\`\`\`javascript
const x = 42;
\`\`\`

\`\`\`python
x = 42
print(x)
\`\`\`
`;

  const html = marked.parse(markdown);

  if (!html.includes('language-javascript')) {
    throw new Error('JavaScript code block not highlighted');
  }

  if (!html.includes('language-python')) {
    throw new Error('Python code block not highlighted');
  }
});

// Test 7: DOMPurify preserves safe HTML attributes
test('DOMPurify preserves safe HTML attributes', () => {
  const html = '<h1 id="test">Title</h1><a href="/doc/test">Link</a>';
  const clean = DOMPurify.sanitize(html, {
    ADD_ATTR: ['id', 'href', 'class'],
    ADD_TAGS: ['h1', 'a']
  });

  if (!clean.includes('id="test"')) {
    throw new Error('Lost id attribute');
  }

  if (!clean.includes('href="/doc/test"')) {
    throw new Error('Lost href attribute');
  }
});

// Test 8: Full pipeline test (Markdown → Marked → DOMPurify)
test('Full SSR pipeline: Markdown → HTML → Sanitized', () => {
  const markdown = `
# Test Document

This is a **bold** text with *italic*.

## Code Example

\`\`\`javascript
function hello() {
  console.log("Hello World");
}
\`\`\`

## 한글 섹션

한글 텍스트입니다.

<script>alert("xss")</script>
`;

  // Step 1: Parse markdown
  const rawHtml = marked.parse(markdown);

  // Step 2: Sanitize HTML
  const cleanHtml = DOMPurify.sanitize(rawHtml, {
    ADD_ATTR: ['class', 'id', 'href'],
    ADD_TAGS: ['span']
  });

  // Verify results
  if (!cleanHtml.includes('id="test-document"')) {
    throw new Error('Lost heading ID');
  }

  if (!cleanHtml.includes('<strong>bold</strong>')) {
    throw new Error('Lost bold formatting');
  }

  if (!cleanHtml.includes('<em>italic</em>')) {
    throw new Error('Lost italic formatting');
  }

  if (!cleanHtml.includes('language-javascript')) {
    throw new Error('Lost code highlighting');
  }

  if (!cleanHtml.includes('한글 텍스트')) {
    throw new Error('Lost Korean text');
  }

  if (cleanHtml.includes('<script>')) {
    throw new Error('Failed to remove XSS script');
  }
});

// Test 9: Edge cases - Empty headings
test('Empty or whitespace-only headings are handled', () => {
  const markdown = '# \n\n##   \n\n### Valid Heading';
  const html = marked.parse(markdown);

  // Should have at least one valid heading
  if (!html.includes('id="valid-heading"')) {
    throw new Error('Failed to generate ID for valid heading');
  }
});

// Test 10: Special characters in code blocks
test('Special characters in code blocks are escaped', () => {
  // Test without language specification to ensure escaping works
  const markdown = '```\n<div>Hello</div>\n<script>alert("xss")</script>\n```';
  const html = marked.parse(markdown);

  // HTML tags should be escaped in code blocks
  if (!html.includes('&lt;div&gt;') || !html.includes('&lt;script&gt;')) {
    throw new Error('Failed to escape HTML tags in code block');
  }

  // Should not contain actual HTML tags (unescaped)
  const codeBlockMatch = html.match(/<code[^>]*>([\s\S]*?)<\/code>/);
  if (!codeBlockMatch) {
    throw new Error('No code block found');
  }

  const codeContent = codeBlockMatch[1];
  // Check for unescaped tags (should not exist)
  const unescapedTagPattern = /<(div|script)>/;
  if (unescapedTagPattern.test(codeContent)) {
    throw new Error('Code block contains unescaped HTML tags');
  }
});

// Print summary
console.log('\n=== Test Summary ===');
console.log(`Total tests: ${results.passed.length + results.failed.length}`);
console.log(`Passed: ${results.passed.length}`);
console.log(`Failed: ${results.failed.length}`);

if (results.failed.length > 0) {
  console.log('\n❌ Failed tests:');
  results.failed.forEach(({ name, error }) => {
    console.log(`  - ${name}: ${error}`);
  });
  process.exit(1);
} else {
  console.log('\n✅ All tests passed!');
  console.log('\n📝 Server-side rendering is verified and matches client behavior.');
  process.exit(0);
}
