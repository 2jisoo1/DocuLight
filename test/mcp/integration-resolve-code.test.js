/**
 * 통합 테스트: resolve_project + query_code_examples + searchDocuments
 * Context7 워크플로우 재현 테스트
 */
const { ProjectResolverService } = require('../../src/services/mcp/project-resolver-service');
const { CodeBlockExtractorService } = require('../../src/services/mcp/code-block-extractor');
const { searchDocuments } = require('../../src/services/search-service');
const fs = require('fs');
const path = require('path');

const base = path.join(__dirname, '../fixtures/docs/test-integration');
const config = { docsRoot: base, excludes: [] };
const log = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

let passed = 0;
let failed = 0;

function assert(name, condition) {
  if (condition) { passed++; console.log('  \u2705', name); }
  else { failed++; console.log('  \u274C', name); }
}

function setup() {
  fs.mkdirSync(path.join(base, '00.common/jons5'), { recursive: true });
  fs.writeFileSync(path.join(base, '00.common/jons5/json5.md'),
`---
name: JSON5 Library
aliases: json5, jons5, json-five
description: JSON5 Java library
---
# JSON5 Library Guide

## Comment Support

JSON5 supports comments:

\`\`\`java
@JSON5Type(comment = "Config")
public class AppConfig {
    @JSON5Value(comment = "Port")
    private int port = 8080;
}
\`\`\`

## Serialization

\`\`\`java
JSON5Object obj = new JSON5Object();
obj.put("key", "value");
\`\`\`

## Python Example

\`\`\`python
import json5
config = json5.load(open('config.json5'))
\`\`\`
`);
}

function cleanup() {
  try { fs.rmSync(base, { recursive: true, force: true }); } catch (e) {}
}

async function runTests() {
  setup();

  try {
    // === E2E 1: resolve_project ===
    console.log('\n=== E2E: resolve_project ===');
    const resolver = new ProjectResolverService(config, log);
    await resolver.buildIndex();

    const projects = resolver.resolve('json5');
    assert('resolve finds project', projects.length > 0);
    assert('resolve score >= 0.7', projects[0].score >= 0.7);
    assert('resolve returns correct path', projects[0].path.includes('jons5'));

    // === E2E 2: resolve → code_examples ===
    console.log('\n=== E2E: resolve -> query_code_examples ===');
    const extractor = new CodeBlockExtractorService(config, log);
    const codeResult = await extractor.extract('comment annotation', {
      path: projects[0].path,
      language: 'java'
    });
    assert('code_examples finds Java blocks', codeResult.blocks.length > 0);
    assert('code_examples has context heading', codeResult.blocks[0].context !== '');
    assert('all blocks are Java', codeResult.blocks.every(b => b.language === 'java'));
    assert('token budget tracked', codeResult.tokensUsed > 0);

    // === E2E 3: resolve → search ===
    console.log('\n=== E2E: resolve -> searchDocuments ===');
    const searchResult = await searchDocuments(config, log, 'comment', {
      path: '/' + projects[0].path,
      mode: 'snippets'
    });
    assert('search finds results', searchResult.total > 0);

    // === E2E 4: alias matching ===
    console.log('\n=== Alias matching ===');
    const aliasResult = resolver.resolve('json-five');
    assert('alias json-five matches', aliasResult.length > 0 && aliasResult[0].path.includes('jons5'));

    const aliasResult2 = resolver.resolve('jons5');
    assert('alias jons5 matches', aliasResult2.length > 0);

    // === E2E 5: Python language filter ===
    console.log('\n=== Language filter ===');
    const pyResult = await extractor.extract('json5', {
      path: projects[0].path,
      language: 'python'
    });
    assert('python filter works', pyResult.blocks.length > 0);
    assert('only python returned', pyResult.blocks.every(b => b.language === 'python'));

    // === E2E 6: no match ===
    console.log('\n=== No match ===');
    const noMatch = resolver.resolve('nonexistent-library-xyz');
    assert('no match returns empty', noMatch.length === 0);

    // === E2E 7: format output ===
    console.log('\n=== Format output ===');
    const md = resolver.formatAsMarkdown('json5', projects);
    assert('format includes path', md.includes('jons5'));
    assert('format includes next steps', md.includes('query_document'));

    const codeMd = extractor.formatAsMarkdown('comment', codeResult);
    assert('code format includes score', codeMd.includes('score:'));

  } finally {
    cleanup();
  }

  console.log('\n' + '='.repeat(50));
  console.log(`Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
  console.log('='.repeat(50));

  if (failed > 0) process.exit(1);
}

runTests();
