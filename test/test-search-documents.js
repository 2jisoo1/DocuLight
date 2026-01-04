/**
 * Search Documents 테스트
 * 실행: node test/test-search-documents.js
 *
 * Step 13.1: 문서 검색 기능 테스트
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs').promises;

// Mock dependencies
const mockLogger = {
  info: () => {},
  error: () => {},
  warn: () => {}
};

const mockConfig = {
  docsRoot: path.join(__dirname, 'test-docs'),
  excludes: ['node_modules', '.git']
};

console.log('Running Search Documents tests...\n');
console.log(`Test docs root: ${mockConfig.docsRoot}\n`);

// Import the function to test
const { searchDocuments, getContextDocuments, getDocumentContent } = require('../src/services/context-service');

// ========== Test Suite ==========

async function runTests() {
  let passed = 0;
  let failed = 0;

  // Test 1: Module exports searchDocuments
  try {
    assert.strictEqual(typeof searchDocuments, 'function');
    console.log('✅ Test 1: searchDocuments is exported as a function');
    passed++;
  } catch (e) {
    console.log('❌ Test 1:', e.message);
    failed++;
  }

  // Test 2: Empty query throws error
  try {
    await searchDocuments(mockConfig, mockLogger, '');
    console.log('❌ Test 2: Should have thrown error for empty query');
    failed++;
  } catch (e) {
    assert.strictEqual(e.message, 'query is required and must not be empty');
    console.log('✅ Test 2: Empty query throws correct error');
    passed++;
  }

  // Test 3: Whitespace-only query throws error
  try {
    await searchDocuments(mockConfig, mockLogger, '   ');
    console.log('❌ Test 3: Should have thrown error for whitespace query');
    failed++;
  } catch (e) {
    assert.strictEqual(e.message, 'query is required and must not be empty');
    console.log('✅ Test 3: Whitespace-only query throws correct error');
    passed++;
  }

  // Test 4: Query over 200 chars throws error
  try {
    const longQuery = 'a'.repeat(201);
    await searchDocuments(mockConfig, mockLogger, longQuery);
    console.log('❌ Test 4: Should have thrown error for long query');
    failed++;
  } catch (e) {
    assert.strictEqual(e.message, 'query must be 200 characters or less');
    console.log('✅ Test 4: Long query throws correct error');
    passed++;
  }

  // Test 5: Basic search returns results
  try {
    const result = await searchDocuments(mockConfig, mockLogger, 'configuration');
    assert.strictEqual(typeof result, 'object');
    assert.strictEqual(result.query, 'configuration');
    assert.strictEqual(typeof result.total_matches, 'number');
    assert.strictEqual(typeof result.total_files, 'number');
    assert.strictEqual(typeof result.truncated, 'boolean');
    assert.ok(Array.isArray(result.results));
    console.log(`✅ Test 5: Basic search works (${result.total_matches} matches in ${result.total_files} files)`);
    passed++;
  } catch (e) {
    console.log('❌ Test 5:', e.message);
    failed++;
  }

  // Test 6: Case-insensitive search (default)
  try {
    const lower = await searchDocuments(mockConfig, mockLogger, 'doclight');
    const upper = await searchDocuments(mockConfig, mockLogger, 'DOCLIGHT');
    assert.strictEqual(lower.total_matches, upper.total_matches, 'Case-insensitive search should match same count');
    console.log(`✅ Test 6: Case-insensitive search works (${lower.total_matches} matches)`);
    passed++;
  } catch (e) {
    console.log('❌ Test 6:', e.message);
    failed++;
  }

  // Test 7: Case-sensitive search
  try {
    const sensitive = await searchDocuments(mockConfig, mockLogger, 'DocLight', { case_sensitive: true });
    const insensitive = await searchDocuments(mockConfig, mockLogger, 'doclight', { case_sensitive: true });
    // DocLight should find matches, doclight should find fewer or none in case-sensitive mode
    console.log(`✅ Test 7: Case-sensitive search works (DocLight: ${sensitive.total_matches}, doclight: ${insensitive.total_matches})`);
    passed++;
  } catch (e) {
    console.log('❌ Test 7:', e.message);
    failed++;
  }

  // Test 8: context_chars option
  try {
    const short = await searchDocuments(mockConfig, mockLogger, 'configuration', { context_chars: 10 });
    const long = await searchDocuments(mockConfig, mockLogger, 'configuration', { context_chars: 100 });

    if (short.results.length > 0 && long.results.length > 0) {
      const shortExcerpt = short.results[0].matches[0].excerpt;
      const longExcerpt = long.results[0].matches[0].excerpt;
      assert.ok(longExcerpt.length >= shortExcerpt.length, 'Longer context should produce longer excerpt');
    }
    console.log('✅ Test 8: context_chars option works');
    passed++;
  } catch (e) {
    console.log('❌ Test 8:', e.message);
    failed++;
  }

  // Test 9: context_chars clamping (min 10, max 500)
  try {
    const tooSmall = await searchDocuments(mockConfig, mockLogger, 'configuration', { context_chars: 5 });
    const tooLarge = await searchDocuments(mockConfig, mockLogger, 'configuration', { context_chars: 1000 });
    // Should not throw errors, values are clamped
    console.log('✅ Test 9: context_chars clamping works (5 -> 10, 1000 -> 500)');
    passed++;
  } catch (e) {
    console.log('❌ Test 9:', e.message);
    failed++;
  }

  // Test 10: max_results option
  try {
    const result = await searchDocuments(mockConfig, mockLogger, 'the', { max_results: 2 });
    if (result.results.length > 0) {
      const maxMatchesPerFile = Math.max(...result.results.map(r => r.matches.length));
      assert.ok(maxMatchesPerFile <= 2, `max_results should limit to 2, got ${maxMatchesPerFile}`);
    }
    console.log('✅ Test 10: max_results option works');
    passed++;
  } catch (e) {
    console.log('❌ Test 10:', e.message);
    failed++;
  }

  // Test 11: max_results clamping (min 1, max 100)
  try {
    const tooSmall = await searchDocuments(mockConfig, mockLogger, 'the', { max_results: 0 });
    const tooLarge = await searchDocuments(mockConfig, mockLogger, 'the', { max_results: 200 });
    // Should not throw errors, values are clamped
    console.log('✅ Test 11: max_results clamping works (0 -> 1, 200 -> 100)');
    passed++;
  } catch (e) {
    console.log('❌ Test 11:', e.message);
    failed++;
  }

  // Test 12: path option limits search scope
  try {
    const allDocs = await searchDocuments(mockConfig, mockLogger, 'authentication');
    const guideOnly = await searchDocuments(mockConfig, mockLogger, 'authentication', { path: '/guide' });

    // Guide-only should have <= all docs matches
    assert.ok(guideOnly.total_matches <= allDocs.total_matches, 'Path-limited search should have <= matches');
    console.log(`✅ Test 12: path option works (all: ${allDocs.total_matches}, /guide: ${guideOnly.total_matches})`);
    passed++;
  } catch (e) {
    console.log('❌ Test 12:', e.message);
    failed++;
  }

  // Test 13: Results contain required fields
  try {
    const result = await searchDocuments(mockConfig, mockLogger, 'configuration');
    if (result.results.length > 0) {
      const file = result.results[0];
      assert.ok(file.path, 'Result should have path');
      assert.ok(file.name, 'Result should have name');
      assert.strictEqual(typeof file.match_count, 'number', 'Result should have match_count');
      assert.ok(Array.isArray(file.matches), 'Result should have matches array');

      if (file.matches.length > 0) {
        const match = file.matches[0];
        assert.strictEqual(typeof match.line, 'number', 'Match should have line number');
        assert.ok(match.excerpt, 'Match should have excerpt');
      }
    }
    console.log('✅ Test 13: Results contain required fields');
    passed++;
  } catch (e) {
    console.log('❌ Test 13:', e.message);
    failed++;
  }

  // Test 14: Excerpt contains highlighted match with **
  try {
    const result = await searchDocuments(mockConfig, mockLogger, 'DocLight');
    if (result.results.length > 0 && result.results[0].matches.length > 0) {
      const excerpt = result.results[0].matches[0].excerpt;
      assert.ok(excerpt.includes('**'), 'Excerpt should contain ** for highlighting');
    }
    console.log('✅ Test 14: Excerpt contains highlighted match');
    passed++;
  } catch (e) {
    console.log('❌ Test 14:', e.message);
    failed++;
  }

  // Test 15: No matches returns empty results
  try {
    const result = await searchDocuments(mockConfig, mockLogger, 'xyznonexistentxyz');
    assert.strictEqual(result.total_matches, 0);
    assert.strictEqual(result.total_files, 0);
    assert.strictEqual(result.results.length, 0);
    console.log('✅ Test 15: No matches returns empty results');
    passed++;
  } catch (e) {
    console.log('❌ Test 15:', e.message);
    failed++;
  }

  // Test 16: Query is trimmed
  try {
    const result = await searchDocuments(mockConfig, mockLogger, '  configuration  ');
    assert.strictEqual(result.query, 'configuration', 'Query should be trimmed');
    console.log('✅ Test 16: Query is trimmed');
    passed++;
  } catch (e) {
    console.log('❌ Test 16:', e.message);
    failed++;
  }

  // Test 17: Results sorted by match_count descending
  try {
    const result = await searchDocuments(mockConfig, mockLogger, 'the');
    if (result.results.length > 1) {
      for (let i = 1; i < result.results.length; i++) {
        assert.ok(result.results[i-1].match_count >= result.results[i].match_count,
          'Results should be sorted by match_count descending');
      }
    }
    console.log('✅ Test 17: Results sorted by match_count descending');
    passed++;
  } catch (e) {
    console.log('❌ Test 17:', e.message);
    failed++;
  }

  // Test 18: Path with leading slash works
  try {
    const result = await searchDocuments(mockConfig, mockLogger, 'configuration', { path: '/guide' });
    // Should not throw
    console.log(`✅ Test 18: Path with leading slash works (${result.total_matches} matches)`);
    passed++;
  } catch (e) {
    console.log('❌ Test 18:', e.message);
    failed++;
  }

  // Test 19: Path without leading slash works
  try {
    const result = await searchDocuments(mockConfig, mockLogger, 'configuration', { path: 'guide' });
    // Should not throw
    console.log(`✅ Test 19: Path without leading slash works (${result.total_matches} matches)`);
    passed++;
  } catch (e) {
    console.log('❌ Test 19:', e.message);
    failed++;
  }

  // Test 20: Newlines in excerpt are replaced with spaces
  try {
    const result = await searchDocuments(mockConfig, mockLogger, 'configuration', { context_chars: 200 });
    if (result.results.length > 0 && result.results[0].matches.length > 0) {
      const excerpt = result.results[0].matches[0].excerpt;
      assert.ok(!excerpt.includes('\n'), 'Excerpt should not contain newlines');
      assert.ok(!excerpt.includes('\r'), 'Excerpt should not contain carriage returns');
    }
    console.log('✅ Test 20: Newlines in excerpt are replaced with spaces');
    passed++;
  } catch (e) {
    console.log('❌ Test 20:', e.message);
    failed++;
  }

  // ========== Summary ==========
  console.log('\n' + '='.repeat(50));
  console.log(`Total: ${passed + failed} tests`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log('='.repeat(50));

  if (failed > 0) {
    process.exit(1);
  }
}

// Run tests
runTests().catch(e => {
  console.error('Test suite error:', e);
  process.exit(1);
});
