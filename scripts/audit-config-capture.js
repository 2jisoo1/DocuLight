// Simple audit script to find potential config-capture patterns
// Run: node scripts/audit-config-capture.js

const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const scanDir = path.join(repoRoot, 'src');
const exts = ['.js', '.mjs', '.cjs'];

const patterns = [
  { name: 'createX_with_config', re: /create\w+\s*\([^)]*\bconfig\b[^)]*\)/i, severity: 'MEDIUM' },
  { name: 'configure_with_config', re: /configure\w*\s*\([^)]*\bconfig\b[^)]*\)/i, severity: 'MEDIUM' },
  { name: 'module_level_config_variable', re: /const\s+\w+\s*=\s*.*config/i, severity: 'HIGH' },
  { name: 'require_config_file', re: /require\([^)]*config/i, severity: 'MEDIUM' },
  { name: 'module_exports_config', re: /module\.exports\s*=\s*config/i, severity: 'HIGH' }
];

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

const findings = [];

walk(scanDir, (file) => {
  if (!exts.includes(path.extname(file))) return;
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split(/\r?\n/);
  lines.forEach((line, idx) => {
    patterns.forEach(p => {
      if (p.re.test(line)) {
        findings.push({ file: path.relative(repoRoot, file), line: idx + 1, text: line.trim(), pattern: p.name, severity: p.severity });
      }
    });
  });
});

if (findings.length === 0) {
  console.log('Audit: No potential config-capture patterns found.');
  process.exit(0);
}

console.log('Audit: Potential config-capture findings:');
findings.forEach(f => {
  console.log(`[${f.severity}] ${f.file}:${f.line} -> ${f.pattern} \n    ${f.text}`);
});

// Summary
const bySeverity = findings.reduce((acc, cur) => {
  acc[cur.severity] = (acc[cur.severity] || 0) + 1;
  return acc;
}, {});
console.log('\nSummary:');
Object.keys(bySeverity).forEach(s => console.log(`  ${s}: ${bySeverity[s]}`));

// Exit code non-zero if any HIGH findings
if (bySeverity['HIGH']) process.exit(2);
process.exit(0);
