# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 0. UI Conventions (Project-Specific)

**Never use browser-native dialogs (`alert`, `confirm`, `prompt`).** Use the project's in-app modal component for all confirmations, warnings, and prompts. Browser dialogs break the UI consistency, are not styleable, and block the event loop.

## 0-2. Code Review Loop (Project-Specific)

**Whenever you modify code (new code, bug fix, refactor — any change), you MUST submit the change to a strict, picky code reviewer subagent before declaring the work done.**

Workflow:

1. Make the code change.
2. Spawn a code-review subagent (`Agent` tool, `subagent_type: "superpowers:code-reviewer"` or equivalent picky reviewer agent) with this brief:
   - **Clean Code**: function separation (single responsibility), naming, length, duplication, abstraction level mixing.
   - **Tests**: are there tests covering this change? Do existing tests still pass? Are edge cases covered?
   - **Exception/Error paths**: what can throw? Is rejection handled? Are async errors swallowed? Are null/undefined paths defended at boundaries?
3. The reviewer returns findings classified by severity (Critical / High / Medium / Low).
4. If any Critical or High issue is reported, **fix it and re-submit for review**. Loop until the reviewer returns no Critical/High issues.
5. Medium/Low issues should be addressed when reasonable; record any deferred ones in the response to the user.

The reviewer must be picky: prefer false positives over missed issues. Do not skip the loop even for "trivial" changes — trivial changes have produced regressions in this project before.

## 0-1. Commit Conventions (Project-Specific)

**Never include co-author signatures in commit messages.** Do not append `Co-Authored-By:`, `Generated with Claude Code`, or any similar attribution trailer. Commit messages must contain only the substantive description of the change.

**Always run a commit-message review loop using a Haiku subagent before committing.** Workflow:

1. Draft the commit message based on staged changes.
2. Spawn a Haiku subagent (`Agent` tool with `model: "haiku"`) to evaluate the draft against these axes:
   - **Accuracy**: does it match the actual diff?
   - **Conventional Commits**: type/scope/subject form correct?
   - **Scope**: subject ≤72 chars, imperative mood, no trailing period?
   - **Body**: explains *why* (not just *what*); wraps at ~72 chars?
   - **Forbidden trailers**: zero `Co-Authored-By` / `Generated with` lines?
3. If the subagent flags any issue, revise and re-evaluate. Loop until the subagent returns a pass.
4. Only then run `git commit`.

This applies to every commit, including small fixes. Skipping the review loop is not acceptable.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.


### API Endpoint Testing
```bash
# Public endpoint
curl "http://localhost:3000/api/tree?path=/"

# Protected endpoint
curl -H "X-API-Key: your-api-key" -X DELETE "http://localhost:3000/api/entry?path=/test.md"

# Web routes (Step 9)
curl "http://localhost:3000/doc/guide/setup"        # Render (no .md)
curl "http://localhost:3000/doc/guide/setup.md"     # Download
```

### When Adding New Features
1. Create test case files in `test/` directory
2. Use Playwright for browser automation tests
3. Create manual test checklist in TEST*.md
4. Verify with both cURL and browser

## Production Deployment

Recommended: Use PM2 for process management
```bash
npm install -g pm2
pm2 start src/app.js --name DocLight
pm2 save
pm2 startup
```
