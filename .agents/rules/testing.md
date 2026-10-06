# Testing & Verification Guidelines

## Fast Automated Testing First
- The app is the static site in `web/`. Its Vitest suite (`cd web && npm test`, ~40 s) covers the engine (against golden fixtures from the Python engine), the plan model, and the pages' components in jsdom. Run `npm run check` (types) and `npm run build` as well; the SSR build catches template errors the tests miss.
- Browser behaviour is covered by Playwright against the production build: `npm run e2e`.
- `legacy/` holds the old Django app, used only to regenerate fixtures (`cd legacy && uv run tools/golden/dump_fixtures.py`) and as a reference; `uv run manage.py test --keepdb` there.

## Implementation Planning
- Keep verification sections in implementation plans focused on automated tests (Vitest, then `npm run e2e`).
- Do not plan exhaustive multi-step interactive browser subagent sessions.

## Constraints on Browser Subagent
- Limit `browser_subagent` calls to single-step visual smoke tests (load page, take 1 screenshot, exit).
- Never run multi-step interactive data entry or chain multiple browser subagents back-to-back; add a Playwright test in `web/e2e/` instead.
- Rely on the developer to verify interactive UI changes on their local dev server (`cd web && npm run dev`, http://localhost:5173).
