# Legacy Django app

The original server-rendered version of the retirement calculator (Django + NumPy/Numba). The live app is the static site in `../web/`. This copy is kept because it is the **reference engine**: `tools/golden/dump_fixtures.py` runs it on the sample plans and writes the golden fixtures in `../web/fixtures/` that the TypeScript port is tested against.

```sh
cd legacy
uv run manage.py test --keepdb          # Django tests (core.tests_browser needs `uv run playwright install chromium`)
uv run manage.py runserver              # the old app, at http://127.0.0.1:8000
uv run tools/golden/dump_fixtures.py    # regenerate ../web/fixtures (deterministic; ~2 minutes)
```

The dumper reads the sample plans from `../web/fixtures/saved-plans/`; `saved json files/` here is the Django tests' own copy. If you change the Python engine, regenerate the fixtures and make the TypeScript match.
