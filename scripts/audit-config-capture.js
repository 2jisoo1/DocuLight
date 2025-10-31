// Improved audit script to detect likely module-level config capture patterns
// Heuristics:
// - Detect top-level calls to loadConfig() (HIGH)
// - Detect top-level require of config-loader followed by top-level loadConfig usage (MEDIUM/HIGH)
// - Detect top-level fs.readFileSync of `config.json5` (HIGH)
// - Flag createX(config) at top-level as MEDIUM, but lower severity when inside functions
// Run: node scripts/audit-config-capture.js

const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const scanDir = path.join(repoRoot, 'src');
const exts = new Set(['.js', '.mjs', '.cjs']);

function walk(dir, callback) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      walk(full, callback);
    } else if (e.isFile()) {
      callback(full);
    }
  }
}

function trimComment(line) {
  // very small heuristic: remove // comments
  const idx = line.indexOf('//');
  if (idx !== -1) return line.slice(0, idx);
  return line;
}

const findings = [];

walk(scanDir, (file) => {
  if (!exts.has(path.extname(file))) return;
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split(/\r?\n/);

  let braceDepth = 0;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = trimComment(raw).trim();
    // update brace depth based on the raw line (approximate)
    for (const ch of raw) {
      if (ch === '{') braceDepth++;
      else if (ch === '}') braceDepth = Math.max(0, braceDepth - 1);
    }

    // 1) top-level loadConfig() call
    if (/\bloadConfig\s*\(/.test(line)) {
      const sev = braceDepth === 0 ? 'HIGH' : 'LOW';
      findings.push({ file: path.relative(repoRoot, file), line: i + 1, text: line, pattern: 'loadConfig_call', severity: sev });
      continue;
    }

    // 2) top-level require of config-loader
    if (/require\([^)]*config-loader[^)]*\)/.test(line)) {
      const sev = braceDepth === 0 ? 'MEDIUM' : 'LOW';
      findings.push({ file: path.relative(repoRoot, file), line: i + 1, text: line, pattern: 'require_config_loader', severity: sev });
      continue;
    }

    // 3) top-level direct read of config.json5
    if (/fs\.(readFileSync|readFile)\([^)]*config\.json5/.test(line) || /config\.json5/.test(line) && /readFile/.test(line)) {
      const sev = braceDepth === 0 ? 'HIGH' : 'MEDIUM';
      findings.push({ file: path.relative(repoRoot, file), line: i + 1, text: line, pattern: 'read_config_json5', severity: sev });
      continue;
    }

    // 4) createX(..., config, ...) at top-level (possible capture)
    if (/create\w+\s*\([^)]*\bconfig\b[^)]*\)/i.test(line)) {
      const sev = braceDepth === 0 ? 'MEDIUM' : 'LOW';
      findings.push({ file: path.relative(repoRoot, file), line: i + 1, text: line, pattern: 'create_with_config', severity: sev });
      continue;
    }

    // 5) module.exports = config
    if (/module\.exports\s*=\s*config\b/.test(line)) {
      findings.push({ file: path.relative(repoRoot, file), line: i + 1, text: line, pattern: 'module_exports_config', severity: 'HIGH' });
      continue;
    }
  }
});

// Post-filtering: merge adjacent findings and remove low-priority noise
const filtered = findings.filter(f => {
  // Ignore low-severity loadConfig calls when they appear inside functions (low brace depth > 0)
  if (f.pattern === 'loadConfig_call' && f.severity === 'LOW') return false;
  // Ignore require_config_loader if it's in a file that also contains a top-level loadConfig (we'll flag loadConfig instead)
  if (f.pattern === 'require_config_loader') {
    const sameFileHasTopLoad = findings.some(x => x.file === f.file && x.pattern === 'loadConfig_call' && x.severity === 'HIGH');
    if (sameFileHasTopLoad) return false;
  }
  return true;
});

if (filtered.length === 0) {
  console.log('Audit: No likely module-level config-capture patterns found.');
  process.exit(0);
}

console.log('Audit: Potential config-capture findings (improved heuristics):');
filtered.forEach(f => {
  console.log(`[${f.severity}] ${f.file}:${f.line} -> ${f.pattern} \n    ${f.text}`);
});

// Summary
const bySeverity = filtered.reduce((acc, cur) => {
  acc[cur.severity] = (acc[cur.severity] || 0) + 1;
  return acc;
}, {});
console.log('\nSummary:');
Object.keys(bySeverity).forEach(s => console.log(`  ${s}: ${bySeverity[s]}`));

// Exit code non-zero if any HIGH findings
if (bySeverity['HIGH']) process.exit(2);
process.exit(0);
