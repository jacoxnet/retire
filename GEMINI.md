# Project Guidelines for Gemini

## Testing & Verification Workflow

### 1. Fast Automated Testing First
- The automated test suite (`python manage.py test --keepdb` or `uv run manage.py test --keepdb`) is extremely fast (running 150+ tests in under 5 seconds), deterministic, and comprehensive.
- **Always verify logic, calculations, views, templates, form validation, and session state using Django unit/integration tests.**
- When introducing new behavior or fixing bugs, add or update test cases in `core/tests.py` (or relevant test module).

### 2. Implementation Plan Verification Strategy
- When drafting an `implementation_plan.md`:
  - **Automated Tests**: Detail which `manage.py test` suites will be run or what unit tests will be added.
  - **Manual/UI Verification**: Keep UI verification minimal. Do NOT prescribe exhaustive interactive multi-step browser checklists. Acknowledge that the user typically has `manage.py runserver` running locally (`http://127.0.0.1:8000`) and can quickly inspect UI changes.

### 3. Strict Constraints on Browser Subagent (`browser_subagent`)
- **Avoid Long Interactive Sessions**: Never task `browser_subagent` with multi-step interactive data entry, cross-tab form filling marathons, or testing multiple permutations. Doing so incurs high reasoning latency per step and causes lengthy delays (30-90+ minutes).
- **Scope to Fast Smoke Tests Only**: If visual confirmation is necessary, limit `browser_subagent` to a quick, single-step visual smoke check (navigate to the URL, verify the page loads without console errors, capture one screenshot, and stop).
- **No Consecutive Subagent Loops**: Never chain multiple `browser_subagent` calls in sequence. If layout or interaction needs further verification, summarize the expected behavior for the user to confirm in their running dev server.
