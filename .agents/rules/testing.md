# Testing & Verification Guidelines

## Fast Automated Testing First
- The automated test suite (`python manage.py test --keepdb` or `uv run manage.py test --keepdb`) runs over 150 tests in ~5 seconds.
- Verify calculations, models, forms, templates, views, and session logic with Django automated tests in `core/tests.py`.

## Implementation Planning
- Keep verification sections in implementation plans focused on automated unit/integration tests.
- Do not plan exhaustive multi-step interactive browser subagent sessions.

## Constraints on Browser Subagent
- Limit `browser_subagent` calls to single-step visual smoke tests (load page, take 1 screenshot, exit).
- Never run multi-step interactive data entry or chain multiple browser subagents back-to-back.
- Rely on the developer to verify interactive UI changes on their active local dev server (`http://127.0.0.1:8000`).
