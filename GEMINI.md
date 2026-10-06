# Project Guidelines for Gemini

## Testing & Verification Workflow

### 1. Fast Automated Testing First
- The app is the static SvelteKit site in `web/` (the Django app in `legacy/` is kept only as the reference engine for fixtures). Its Vitest suite (`cd web && npm test`) is deterministic and comprehensive; also run `npm run check` and `npm run build`.
- **Always verify logic, calculations, the plan model and page behaviour with Vitest tests** in `web/test/`, and browser flows with Playwright tests in `web/e2e/` (`npm run e2e`).
- When introducing new behavior or fixing bugs, add or update tests there.

### 2. Implementation Plan Verification Strategy
- When drafting an `implementation_plan.md`:
  - **Automated Tests**: Detail which Vitest (`npm test`) or Playwright (`npm run e2e`) tests will be run or added.
  - **Manual/UI Verification**: Keep UI verification minimal. Do NOT prescribe exhaustive interactive multi-step browser checklists. Acknowledge that the user typically has `npm run dev` running locally (`http://localhost:5173`) and can quickly inspect UI changes.

### 3. Strict Constraints on Browser Subagent (`browser_subagent`)
- **Avoid Long Interactive Sessions**: Never task `browser_subagent` with multi-step interactive data entry, cross-tab form filling marathons, or testing multiple permutations. Doing so incurs high reasoning latency per step and causes lengthy delays (30-90+ minutes).
- **Scope to Fast Smoke Tests Only**: If visual confirmation is necessary, limit `browser_subagent` to a quick, single-step visual smoke check (navigate to the URL, verify the page loads without console errors, capture one screenshot, and stop).
- **No Consecutive Subagent Loops**: Never chain multiple `browser_subagent` calls in sequence. If layout or interaction needs further verification, summarize the expected behavior for the user to confirm in their running dev server.
