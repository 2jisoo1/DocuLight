#!/usr/bin/env node
/**
 * scripts/golden-set-runner.mjs
 * Golden-set 회귀 채점 러너 (TASK-P2-003, FR-13)
 *
 * Usage:
 *   node scripts/golden-set-runner.mjs --suite 30-mvp --dry-run
 *   node scripts/golden-set-runner.mjs --suite 30-mvp [--url http://localhost:3000/api/chatbot/chat]
 *
 * Exit codes:
 *   0 — all cases pass (or dry-run validation OK)
 *   1 — load failure, schema error, or CI gate triggered
 */

import { parseArgs } from 'node:util';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

const REQUIRED_FIELDS = ['id', 'category', 'query', 'expect_refusal', 'language'];
const VALID_CATEGORIES = new Set(['broad', 'pinpoint', 'nonexistent', 'ambiguous', 'unauthorized', 'multilingual']);
const VALID_SUITE_PATTERN = /^[a-zA-Z0-9_-]+$/;
const REFUSAL_PATTERN = /수정.*할 수 없|삭제.*할 수 없|생성.*할 수 없|읽기 전용|read.only|CUD|write.*not|delete.*not|create.*not|edit.*not|변경.*불가|삭제.*불가|생성.*불가/i;
const CONCURRENCY = 5;

const { values: args } = parseArgs({
  options: {
    suite:                   { type: 'string' },
    'dry-run':               { type: 'boolean', default: false },
    url:                     { type: 'string',  default: 'http://localhost:3000/api/chatbot/chat' },
    'max-hallucination-rate':{ type: 'string' },
    verbose:                 { type: 'boolean', default: false },
  },
  strict: false,
});

if (!args.suite) {
  console.error('[golden-set-runner] ERROR: --suite <name> is required');
  process.exit(1);
}

const suiteName = args.suite;

if (!VALID_SUITE_PATTERN.test(suiteName)) {
  console.error('[golden-set-runner] ERROR: --suite must match [a-zA-Z0-9_-]+');
  process.exit(1);
}

const dryRun    = args['dry-run'];
const targetUrl = args.url;

const maxHallucinationRate = args['max-hallucination-rate'] !== undefined
  ? parseFloat(args['max-hallucination-rate'])
  : null;

if (maxHallucinationRate !== null && (isNaN(maxHallucinationRate) || maxHallucinationRate < 0 || maxHallucinationRate > 1)) {
  console.error('[golden-set-runner] ERROR: --max-hallucination-rate must be a number between 0 and 1');
  process.exit(1);
}

const suiteFile = join(PROJECT_ROOT, 'test', 'chatbot', 'golden-set', `${suiteName}.jsonl`);

if (!existsSync(suiteFile)) {
  console.error(`[golden-set-runner] ERROR: suite file not found: ${suiteFile}`);
  process.exit(1);
}

// --- Load & parse JSONL ---
const rawLines = readFileSync(suiteFile, 'utf-8')
  .split('\n')
  .map(l => l.trim())
  .filter(l => l.length > 0);

const cases = [];
const schemaErrors = [];

for (let i = 0; i < rawLines.length; i++) {
  let obj;
  try {
    obj = JSON.parse(rawLines[i]);
  } catch (e) {
    schemaErrors.push(`line ${i + 1}: invalid JSON — ${e.message}`);
    continue;
  }

  let lineHasError = false;
  for (const field of REQUIRED_FIELDS) {
    if (obj[field] === undefined) {
      schemaErrors.push(`line ${i + 1} (${obj.id ?? '?'}): missing required field '${field}'`);
      lineHasError = true;
    }
  }

  if (obj.category && !VALID_CATEGORIES.has(obj.category)) {
    schemaErrors.push(`line ${i + 1} (${obj.id ?? '?'}): invalid category '${obj.category}'`);
    lineHasError = true;
  }

  if (!lineHasError) {
    cases.push(obj);
  }
}

if (schemaErrors.length > 0) {
  console.error('[golden-set-runner] Schema errors:');
  for (const err of schemaErrors) {
    console.error(`  - ${err}`);
  }
  process.exit(1);
}

// --- Category distribution ---
const dist = {};
for (const c of cases) {
  dist[c.category] = (dist[c.category] ?? 0) + 1;
}

console.log(`[golden-set-runner] Suite: ${suiteName}`);
console.log(`[golden-set-runner] File: ${suiteFile}`);
console.log(`[golden-set-runner] Loaded ${cases.length} cases`);
console.log('[golden-set-runner] Category distribution:');
for (const [cat, count] of Object.entries(dist)) {
  console.log(`  ${cat}: ${count}`);
}

if (dryRun) {
  if (maxHallucinationRate !== null) {
    const eligibleCount = cases.filter(
      c => Array.isArray(c.expected_citations) && c.expected_citations.length > 0 && !c.expect_refusal
    ).length;
    console.log(`[golden-set-runner] hallucination gate: max-hallucination-rate=${(maxHallucinationRate * 100).toFixed(1)}%`);
    console.log(`[golden-set-runner] hallucination eligible cases (have expected_citations): ${eligibleCount}`);
    console.log(`[golden-set-runner] hallucination regression gate: warn at +2%p, fail at +3%p vs baseline`);
  }
  console.log(`[golden-set-runner] Dry-run complete. ${cases.length} cases validated OK. No LLM calls made.`);
  process.exit(0);
}

// --- Live scoring (non-dry-run) ---
console.log(`[golden-set-runner] Target: ${targetUrl}`);
console.log(`[golden-set-runner] Starting live evaluation (concurrency=${CONCURRENCY})...`);

/**
 * Parse SSE stream text into { responseText, toolCallCount, citationPaths }.
 * Handles the named-event format: "event: {name}\ndata: {...}"
 * Assumption: each SSE event has at most one data: line (no multi-line data fields).
 */
function parseSseStream(streamText) {
  let responseText = '';
  let toolCallCount = 0;
  const citationPaths = new Set();
  let currentEventName = null;

  for (const line of streamText.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('event: ')) {
      currentEventName = trimmed.slice(7).trim();
    } else if (trimmed.startsWith('data: ')) {
      try {
        const evt = JSON.parse(trimmed.slice(6));
        if (currentEventName === 'tool_use_start') {
          toolCallCount++;
        } else if (currentEventName === 'token') {
          responseText += evt.content ?? '';
        } else if (currentEventName === 'citation') {
          if (evt.path) citationPaths.add(evt.path);
        }
      } catch { /* non-JSON data line */ }
      currentEventName = null;
    } else if (trimmed === '') {
      currentEventName = null;
    }
  }

  return { responseText, toolCallCount, citationPaths };
}

// Conservative hallucination heuristic: non-empty factual assertion without hedging qualifiers.
// Used only for cases with expected_citations where no citation path matched.
const HEDGING_PATTERN = /모르겠|확실하지 않|찾을 수 없|관련.*없|해당.*없|not sure|cannot find|no information|not found/i;
const FACTUAL_ASSERTION_PATTERN = /입니다|있습니다|합니다|했습니다|이며\b|이다\b|\bis\b|\bare\b|\bhas\b|\bwas\b/;

function looksLikeFactualAssertion(text) {
  if (text.length < 20) return false;
  if (HEDGING_PATTERN.test(text)) return false;
  return FACTUAL_ASSERTION_PATTERN.test(text);
}

async function scoreCase(c) {
  let responseText = '';
  let toolCallCount = 0;
  let citationPaths = new Set();
  let httpError = null;

  try {
    const body = JSON.stringify({ message: c.query, threadId: `golden-${c.id}` });
    const resp = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
      body,
      signal: AbortSignal.timeout(60_000),
    });

    if (!resp.ok) {
      httpError = `HTTP ${resp.status}`;
    } else {
      const text = await resp.text();
      ({ responseText, toolCallCount, citationPaths } = parseSseStream(text));
    }
  } catch (e) {
    httpError = e.message;
  }

  if (httpError) {
    return { id: c.id, ok: false, reason: `network error: ${httpError}`, hallucinated: false };
  }

  // Refusal check — empty response also fails when refusal is expected
  if (c.expect_refusal) {
    if (responseText.length === 0 || !REFUSAL_PATTERN.test(responseText)) {
      return { id: c.id, ok: false, reason: 'expected refusal but response was absent or non-refusal', hallucinated: false };
    }
  }

  // Tool call count check
  if (c.max_tool_calls !== undefined && toolCallCount > c.max_tool_calls) {
    return { id: c.id, ok: false, reason: `tool_calls=${toolCallCount} exceeds max=${c.max_tool_calls}`, hallucinated: false };
  }

  // Answer regex check
  if (c.expected_answer_regex) {
    const re = new RegExp(c.expected_answer_regex, 'i');
    if (!re.test(responseText)) {
      return { id: c.id, ok: false, reason: `answer regex /${c.expected_answer_regex}/ not matched`, hallucinated: false };
    }
  }

  // Hallucination check (conservative): citation absent + factual assertion.
  // expected_citations label missing → NOT eligible (not counted as hallucination).
  let hallucinated = false;
  if (!c.expect_refusal && Array.isArray(c.expected_citations) && c.expected_citations.length > 0) {
    const hasCitationMatch = c.expected_citations.some(ec => ec.path && citationPaths.has(ec.path));
    if (!hasCitationMatch && looksLikeFactualAssertion(responseText)) {
      hallucinated = true;
    }
  }

  return { id: c.id, ok: true, hallucinated };
}

// Run cases with bounded concurrency
const results = [];
for (let i = 0; i < cases.length; i += CONCURRENCY) {
  const batch = cases.slice(i, i + CONCURRENCY);
  const batchResults = await Promise.all(batch.map(c => scoreCase(c)));
  results.push(...batchResults);

  for (const r of batchResults) {
    if (args.verbose) {
      const mark = r.ok ? '✓' : '✗';
      const detail = r.ok ? '' : ` — ${r.reason}`;
      const c = cases.find(x => x.id === r.id);
      console.log(`  ${mark} ${r.id} [${c?.category ?? '?'}]${detail}`);
    }
  }
}

const passed   = results.filter(r => r.ok).length;
const failed   = results.filter(r => !r.ok).length;
const failures = results.filter(r => !r.ok);
const refusalMismatches = failures.filter(f => f.reason.startsWith('expected refusal')).length;
const total    = cases.length;
const passRate = total > 0 ? (passed / total * 100).toFixed(1) : '0.0';

console.log('\n[golden-set-runner] Results:');
console.log(`  total:              ${total}`);
console.log(`  passed:             ${passed}`);
console.log(`  failed:             ${failed}`);
console.log(`  refusal-mismatches: ${refusalMismatches}`);
console.log(`  pass-rate:          ${passRate}%`);

if (failures.length > 0) {
  console.log('\n[golden-set-runner] Failures:');
  for (const f of failures) {
    console.log(`  - ${f.id}: ${f.reason}`);
  }
}

if (failed > 0) {
  console.error('[golden-set-runner] CI gate: FAIL');
  process.exit(1);
}

// --- Hallucination rate gate ---
if (maxHallucinationRate !== null) {
  const eligibleCases = cases.filter(
    c => Array.isArray(c.expected_citations) && c.expected_citations.length > 0 && !c.expect_refusal
  );
  const hallucinatedCount = results.filter(r => r.ok && r.hallucinated).length;
  const eligibleTotal = eligibleCases.length;
  const hallucinationRate = eligibleTotal > 0 ? hallucinatedCount / eligibleTotal : 0;
  const hallucinationPct = (hallucinationRate * 100).toFixed(1);

  console.log('\n[golden-set-runner] Hallucination metrics:');
  console.log(`  eligible cases (have expected_citations): ${eligibleTotal}`);
  console.log(`  hallucinated:       ${hallucinatedCount}`);
  console.log(`  hallucination-rate: ${hallucinationPct}%`);
  console.log(`  threshold:          ${(maxHallucinationRate * 100).toFixed(1)}%`);

  // Regression gate: compare against stored baseline
  const baselineFile = join(PROJECT_ROOT, 'scripts', '.golden-set-baseline.json');
  if (existsSync(baselineFile)) {
    try {
      const baseline = JSON.parse(readFileSync(baselineFile, 'utf-8'));
      const baselineRate = baseline[suiteName]?.hallucination_rate ?? null;
      if (baselineRate !== null) {
        const delta = hallucinationRate - baselineRate;
        const deltaPct = (delta * 100).toFixed(1);
        const sign = delta >= 0 ? '+' : '';
        console.log(`  baseline:           ${(baselineRate * 100).toFixed(1)}% (delta: ${sign}${deltaPct}%p)`);
        if (delta > 0.03) {
          console.error(`[golden-set-runner] hallucination regression gate: FAIL (${sign}${deltaPct}%p > +3%p threshold)`);
          process.exit(1);
        } else if (delta > 0.02) {
          console.warn(`[golden-set-runner] hallucination regression gate: WARN (${sign}${deltaPct}%p > +2%p)`);
        }
      }
    } catch (e) {
      console.warn(`[golden-set-runner] WARNING: baseline parse failed — ${e.message}. Regression gate skipped.`);
    }
  }

  if (hallucinationRate > maxHallucinationRate) {
    console.error(`[golden-set-runner] hallucination gate: FAIL (${hallucinationPct}% > ${(maxHallucinationRate * 100).toFixed(1)}%)`);
    process.exit(1);
  }

  console.log(`[golden-set-runner] hallucination gate: PASS`);
}

console.log('[golden-set-runner] CI gate: PASS');
process.exit(0);
