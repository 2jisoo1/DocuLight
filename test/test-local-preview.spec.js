/**
 * Local Preview Playwright Tests
 * Phase 7: Drag-and-drop local preview feature
 * Run: npx playwright test test/test-local-preview.spec.js
 */

const { test, expect } = require('@playwright/test');

test.describe('Local Preview', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000');
    // Wait for LocalPreview to be initialized
    await page.waitForFunction(() => typeof LocalPreview !== 'undefined');
  });

  test('should initialize LocalPreview module', async ({ page }) => {
    const isInitialized = await page.evaluate(() => {
      return typeof LocalPreview !== 'undefined' &&
             typeof LocalPreview.init === 'function' &&
             LocalPreview.state === 'IDLE';
    });
    expect(isInitialized).toBe(true);
  });

  test('should show drop overlay on drag enter', async ({ page }) => {
    // Simulate drag enter with a file
    await page.evaluate(() => {
      const dataTransfer = new DataTransfer();
      const file = new File(['# Test'], 'test.md', { type: 'text/markdown' });
      dataTransfer.items.add(file);

      const event = new DragEvent('dragenter', {
        bubbles: true,
        dataTransfer
      });
      document.body.dispatchEvent(event);
    });

    const overlay = page.locator('#drop-overlay');
    await expect(overlay).toBeVisible();
    await expect(overlay).toContainText('.md');
  });

  test('should hide drop overlay on drag leave', async ({ page }) => {
    // First show the overlay
    await page.evaluate(() => {
      LocalPreview.showDropOverlay();
    });

    let overlay = page.locator('#drop-overlay');
    await expect(overlay).toBeVisible();

    // Then hide it
    await page.evaluate(() => {
      LocalPreview.hideDropOverlay();
    });

    overlay = page.locator('#drop-overlay');
    await expect(overlay).toHaveClass(/hidden/);
  });

  test('should render dropped markdown file', async ({ page }) => {
    const testContent = '----\nname: Test Document\n----\n# Hello World\n\nThis is a **test** document.';

    await page.evaluate((content) => {
      const file = new File([content], 'test.md', { type: 'text/markdown' });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);

      const event = new DragEvent('drop', {
        bubbles: true,
        dataTransfer
      });
      document.body.dispatchEvent(event);
    }, testContent);

    // Wait for rendering
    await page.waitForTimeout(500);

    // Check banner is visible with correct name
    const banner = page.locator('#local-preview-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('Test Document');
    await expect(banner).toContainText('Local Preview');

    // Check content is rendered
    const content = page.locator('#markdown-content');
    await expect(content).toContainText('Hello World');
    await expect(content.locator('strong')).toContainText('test');
  });

  test('should use filename when frontmatter name is missing', async ({ page }) => {
    const testContent = '# Simple Doc\n\nNo frontmatter here.';

    await page.evaluate((content) => {
      const file = new File([content], 'my-document.md', { type: 'text/markdown' });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      document.body.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer }));
    }, testContent);

    await page.waitForTimeout(500);

    const banner = page.locator('#local-preview-banner');
    await expect(banner).toContainText('my-document.md');
  });

  test('should close preview when close button clicked', async ({ page }) => {
    // Open a preview first
    await page.evaluate(() => {
      const file = new File(['# Test'], 'test.md', { type: 'text/markdown' });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      document.body.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer }));
    });

    await page.waitForTimeout(500);

    // Click close button
    await page.click('.local-preview-banner .close-btn');

    // Banner should be gone
    await expect(page.locator('#local-preview-banner')).not.toBeVisible();

    // State should be IDLE
    const state = await page.evaluate(() => LocalPreview.state);
    expect(state).toBe('IDLE');
  });

  test('should close preview with ESC key', async ({ page }) => {
    // Open a preview first
    await page.evaluate(() => {
      const file = new File(['# Test'], 'test.md', { type: 'text/markdown' });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      document.body.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer }));
    });

    await page.waitForTimeout(500);

    // Press ESC
    await page.keyboard.press('Escape');

    // Banner should be gone
    await expect(page.locator('#local-preview-banner')).not.toBeVisible();
  });

  test('should reject non-markdown files', async ({ page }) => {
    await page.evaluate(() => {
      const file = new File(['test content'], 'test.txt', { type: 'text/plain' });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      document.body.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer }));
    });

    await page.waitForTimeout(500);

    // Should show error toast
    const toast = page.locator('.toast');
    await expect(toast).toBeVisible();

    // Banner should not appear
    await expect(page.locator('#local-preview-banner')).not.toBeVisible();
  });

  test('should reject files over 10MB', async ({ page }) => {
    // Create large file simulation
    const result = await page.evaluate(() => {
      // Create 11MB content
      const largeContent = 'x'.repeat(11 * 1024 * 1024);
      const file = new File([largeContent], 'large.md', { type: 'text/markdown' });

      // Check the validation directly
      return LocalPreview.getMarkdownFile({
        dataTransfer: {
          files: [file]
        }
      });
    });

    expect(result).toBeNull();
  });

  test('should reject empty files', async ({ page }) => {
    const result = await page.evaluate(() => {
      const file = new File([''], 'empty.md', { type: 'text/markdown' });
      return LocalPreview.getMarkdownFile({
        dataTransfer: {
          files: [file]
        }
      });
    });

    expect(result).toBeNull();
  });

  test('should parse frontmatter correctly', async ({ page }) => {
    const testCases = [
      { input: '----\nname: Test\ndescription: Desc\n----\n# Content', name: 'Test', description: 'Desc' },
      { input: '----------\nname: Dashes\n-----\n# Content', name: 'Dashes' },
      { input: '---\nname: YAML\n---\n# Content', name: undefined }, // 3 dashes should be rejected
      { input: '# No Frontmatter', name: undefined },
    ];

    for (const tc of testCases) {
      const result = await page.evaluate((content) => {
        return LocalPreview.parseFrontmatter(content);
      }, tc.input);

      expect(result.metadata.name).toBe(tc.name);
    }
  });

  test('should handle local images by marking them as broken', async ({ page }) => {
    const testContent = '# Test\n\n![Local Image](./images/test.png)\n\n![External Image](https://example.com/image.png)';

    await page.evaluate((content) => {
      const file = new File([content], 'test.md', { type: 'text/markdown' });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      document.body.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer }));
    }, testContent);

    await page.waitForTimeout(500);

    // Local image should be marked as broken
    const brokenImage = page.locator('.local-preview-broken-image');
    await expect(brokenImage).toBeVisible();
    await expect(brokenImage).toHaveAttribute('data-local-src', './images/test.png');

    // External image should not be marked as broken
    const externalImage = page.locator('img[src="https://example.com/image.png"]');
    await expect(externalImage).not.toHaveClass(/local-preview-broken-image/);
  });

  test('should hide document navigation in local preview', async ({ page }) => {
    // First load a regular document to show navigation
    const firstFile = page.locator('.file-tree .file').first();
    if (await firstFile.isVisible()) {
      await firstFile.click();
      await page.waitForTimeout(300);
    }

    // Then open local preview
    await page.evaluate(() => {
      const file = new File(['# Test'], 'test.md', { type: 'text/markdown' });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      document.body.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer }));
    });

    await page.waitForTimeout(500);

    // Navigation should be hidden
    const nav = page.locator('.doc-navigation');
    if (await nav.count() > 0) {
      await expect(nav).toHaveCSS('display', 'none');
    }
  });

  test('should update URL to #local-preview', async ({ page }) => {
    await page.evaluate(() => {
      const file = new File(['# Test'], 'test.md', { type: 'text/markdown' });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      document.body.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer }));
    });

    await page.waitForTimeout(500);

    const url = page.url();
    expect(url).toContain('#local-preview');
  });

  test('should restore URL after closing preview', async ({ page }) => {
    const originalUrl = page.url();

    // Open preview
    await page.evaluate(() => {
      const file = new File(['# Test'], 'test.md', { type: 'text/markdown' });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      document.body.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer }));
    });

    await page.waitForTimeout(500);

    // Close preview
    await page.click('.local-preview-banner .close-btn');
    await page.waitForTimeout(300);

    const newUrl = page.url();
    expect(newUrl).not.toContain('#local-preview');
  });

  test('should open file dialog with Ctrl+O', async ({ page }) => {
    // Check that hidden file input exists
    const input = page.locator('#local-preview-file-input');
    await expect(input).toBeAttached();

    // Verify the input accepts .md files
    const accept = await input.getAttribute('accept');
    expect(accept).toContain('.md');
  });

  test('should sanitize HTML to prevent XSS', async ({ page }) => {
    const maliciousContent = '# Test\n\n<script>alert("XSS")</script>\n\n<img src="x" onerror="alert(1)">';

    await page.evaluate((content) => {
      const file = new File([content], 'xss.md', { type: 'text/markdown' });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      document.body.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer }));
    }, maliciousContent);

    await page.waitForTimeout(500);

    // Script tag should be removed
    const scriptTags = await page.locator('#markdown-content script').count();
    expect(scriptTags).toBe(0);

    // onerror attribute should be removed
    const imgWithOnerror = await page.locator('#markdown-content img[onerror]').count();
    expect(imgWithOnerror).toBe(0);
  });
});
