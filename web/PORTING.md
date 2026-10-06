# Porting progress log

Plan: `docs/static-conversion-plan.md`. Update this file at the end of every checkpoint/phase.

## Status
| Checkpoint | State | Notes |
|---|---|---|
| C0 Scaffold + oracle | done | see below |
| C1 Constants, tax, inputs | done | see below |
| C2 Deterministic engine | next | |
| C3 MC kernel | – | |
| C4 RNG, workers, orchestration | – | |

## How to run
- TS tests: `cd web && npm install && npm test` (`npm run typecheck` for `tsc`).
- Regenerate fixtures: `uv run tools/golden/dump_fixtures.py` from the repo root (~90 s; deterministic, so a re-run should produce no git diff unless the Python engine changed).
- Django: `uv run manage.py test --keepdb`. In the cloud container `core.tests_browser` fails to launch Chromium (Playwright/browser version mismatch); that's environmental, not a regression.

## C0 notes
- `web/` is plain Vite + TS + Vitest for now. SvelteKit/adapter-static gets added in phase 5a; the engine lives in `web/src/lib/engine/`.
- Python changes, kept minimal:
  - `core/runs.py`: `generate_runs`, `binary_search`, `run_historical_stress_test` take an optional `rng` (default unchanged: fresh `default_rng()`). The stress test passes its rng on to its fallback `generate_runs` call.
  - `core/views.py`: the plan-import normalization in `load_plan_view` moved verbatim into `import_plan_data(data) -> errors` so the dumper can call it. Phase 4a ports this function.
- Fixtures (`web/fixtures/`, ~2.7 MB):
  - `index.json`: plan list (name, years, runs) and generator settings.
  - `plans/<name>/`: `imported` (plan after import + import errors), `inputs` (`extract_sim_inputs`), `numba_inputs` (`prepare_numba_inputs`), `det_rows` (`run_deterministic`), `kernel` (16 seeded fixed return paths for the 6 buckets + kernel outputs for three variants: `regular`, `test_spending` = 0.8 × desired spending, `custom_inflation` = base + 3·sin(t)), `mc` (seeded `generate_runs`, and `binary_search` for goal-seeking plans; only 5 spaghetti paths kept), `stress` (seeded 2000_dotcom stress test).
  - `functions/`: `tax.json` (tax, preferential tax, fed tax dual, taxable SS for each filing status), `misc.json` (`get_rmd_start_age`, `infer_asset_allocation`, `resolve_age`, `get_historical_sequence`), `cpi.json` (`calculate_cpi_inflation`, `get_prior_month_str` on the bundled data), `constants.json` (RMD table, correlation + Cholesky, historical returns, crisis scenarios).
- Gotchas found:
  - Import fills missing balance-sheet dates from `date.today()`; the dumper freezes it to 2026-01-15. The TS port must take "today" as a parameter.
  - Some saved plans (`aug_*`, `early_suzie`) are JSON-encoded strings of the plan; the dumper unwraps one level. Django's Manage page would reject these files.
  - Non-finite floats would be written as `"NaN"`/`"Infinity"` strings (`test/fixtures.ts` decodes them). None occur in the current fixtures.
  - Python `json` writes shortest round-trip floats, so exact comparison against TS doubles is meaningful.
- Test helpers: `web/test/fixtures.ts` (`loadPlanFixture`, `loadFixture`, `fixtureIndex`, `close(a, b, tol=1e-9)`).

## C1 notes
- Engine modules in `web/src/lib/engine/`:
  - `py.ts`: Python-semantics helpers (`get` = `dict.get`, where a key present with `null` returns `null`; `pyInt`, `pyFloat`, `pyBool` truthiness; `pyMod`; `pyRound` = Python 3 `round` with ties to even).
  - `constants.ts`: brackets, standard deductions, RMD table, correlation and Cholesky, `getRmdStartAge`, `inferAssetAllocation`.
  - `tax.ts`: tax helpers plus `njitRmdTaxWithdraw`. That returns the 23-value tuple as a `Float64Array` (layout in `RTW`) and takes an optional reusable `out` buffer for the hot loop.
  - `inputs.ts`: `resolveAge`, income growth/multiplier, contributions, `getLifeInsuranceRouting`, `extractSimInputs`, `prepareNumbaInputs`.
  - `historicalData.ts`: generated once from `fixtures/functions/constants.json`, now hand-maintained.
  - `cpi.ts`: takes the CPI dataset as a parameter.
- Naming: functions are camelCase; dict-shaped outputs (`SimInputs`, `NumbaInputs`, routing, CPI result) keep Python's snake_case keys so they compare directly with fixtures and the templates' field names.
- `extractSimInputs` deep-copies the plan. Python mutates the plan's asset dicts by injecting `is_spouse`, `user_ret_age` and so on. The output matches, but the caller's plan is untouched.
- Accuracy: over 19k compared values (numba inputs for every plan, plus 600 `njit_rmd_tax_withdraw` cases), 99.6% are bit-identical and the max relative error is 3.5e-16 (`pow` ulp differences).
- Numba zero-initializes `shortfall` on the surplus branch of `njit_rmd_tax_withdraw`, where Python would raise; the TS port returns 0 there.
- New fixtures: `functions/rmd_tax_withdraw.json` (600 seeded cases; the last 200 are biased toward drained taxable/Roth and young ages to reach the penalty steps), `spousal_rollover.json`, `income.json`, plus an interpolation case in `cpi.json`.
- Gotcha: the root `.gitignore` (Python template) ignores every `lib/`; `web/.gitignore` re-includes `src/lib/`. Check `git status` shows new files under `src/lib`.
- Tests: `test/tax.test.ts`, `test/constants.test.ts` (also covers misc, CPI and `pyRound`), `test/inputs.test.ts`. `deepClose()` in `test/fixtures.ts` reports the path of the first mismatch.
- Next (C2): port `simulate_step` (`runs.py` ~751–1200), `run_simulation_path` (~1508), `run_deterministic` (~2466) and `get_life_insurance_routing` (done). Target: `det_rows.json` for every plan.
