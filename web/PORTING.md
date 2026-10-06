# Porting progress log

Plan: `docs/static-conversion-plan.md`. Update this file at the end of every checkpoint/phase.

## Status
| Checkpoint | State | Notes |
|---|---|---|
| C0 Scaffold + oracle | done | see below |
| C1 Constants, tax, inputs | done | see below |
| C2 Deterministic engine | done | see below |
| C3 MC kernel | done | see below |
| C4 RNG, workers, orchestration | done | see below |
| **Phase C (engine)** | **complete** | |
| 4a Plan model I | done | see below |
| 4b Plan model II | done | see below |
| 5a App shell | next | SvelteKit layout, shared inputs, mode toggle, Demographics tab |

## How to run
- TS tests: `cd web && npm install && npm test` (~20 s; `npm run typecheck` for `tsc`).
- Benchmarks: `npm run bench` (single thread, Node; ~100 s) and `npm run bench:browser` (worker pool in headless Chromium via the Vite dev server; pass a Chromium path if not `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`). Results are committed in `bench/results-*.json`.
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

## C2 notes
- `web/src/lib/engine/deterministic.ts`: `simulateStep` (takes a `StepParams` object named after the Python keyword args), `runSimulationPath`, `runDeterministic(plan)` and `meanReturns(inputs)`. `runDeterministic` produces the rows for the projections and cash-flow tables, with Python's dict keys.
- The deterministic path is *not* the same as the numba-input path, and the port keeps the differences:
  - Inflation factors are `(1 + i)^t` here; `prepare_numba_inputs` uses the `inf_factors` ratio for other taxes.
  - Spouse SS activity here doesn't check `sp_entitled`.
  - `spouse_age_t` is `null` for single plans, which matters for `calculateIncomeBenefitMultiplier`.
  - Income amounts go through `float()` here.
- Milestone text uses Python's `f"{x:,.0f}"` (`fmtCommas0`: round half to even, comma grouping).
- Synthetic fixture plans (in the dumper's `SYNTHETIC`; overrides applied after import, `runs=2000`) cover what the saved plans don't:
  - `syn_shortfall` (early_suzie, 8× spending, retire at 40, HOH, non-medical HSA, 5% state tax on SS): shortfalls and early-withdrawal/HSA penalties.
  - `syn_life_ins` (sept27): permanent + term policies, community property, deposit to the survivor and a terminal estate payout.
  - `syn_spouse_first` (aug_13_v2): spouse dies at 70, `married_filing_jointly`, inactive term policy.
- All 11 plans: `det_rows` deep-equal within 1e-9 (the C1 measurement suggests bit-exact apart from pow ulps).
- Next (C3): port `njit_simulate_path` (`runs.py` ~1675–1850) over typed arrays and match `kernel.json` (3 variants × 11 plans, 16 fixed-return paths each), including trajectories and success flags.

## C3 notes
- `web/src/lib/engine/montecarlo.ts`:
  - `kernelParams(inputs, nb)` builds the per-plan constants once.
  - `simulatePath(p, returns, trajectory?)` runs one path (6 per-year return series) and returns a **reused** `{terminalEstate, success}` object.
  - `simulateAllPaths` mirrors `njit_simulate_all_paths` over row-major `runs × years` matrices; it's used by the tests and is handy for C4's fixed-seed checks.
- All 11 plans × 3 variants (regular, test_spending, custom_inflation) match `kernel.json` ending wealths, success flags and full trajectories within 1e-9.
- **Python bug found in C3, since fixed.** `njit_simulate_path` didn't reset `tot_div` on the `taxable_before <= 0` branch, so Numba carried the previous year's dividends into the cost basis. C3 reproduced this for parity. It is now fixed in `core/runs.py` and `montecarlo.ts`, and the fixtures are regenerated; see "Post-C4 fixes".
- Throughput (single thread, Node 22, this container): ~15k paths/s for a 63-year married plan. 1M paths ≈ 65 s on one core before RNG cost, so C4 needs the worker pool. Goal-seek (up to 25 iterations) at 1M runs will be slow; consider capping goal-seek runs or reusing a smaller CRN sample.
- Possible speedups if needed: `njitCalcFedTaxDual`, `njitSolveOrdinaryWithdrawal`, `njitExtraOrdinaryTaxes` and `njitSpousalRollover` allocate small tuples per call; switching them to out-buffers would cut GC pressure.
- Next (C4): seeded PRNG + correlated normal draws (`generate_correlated_returns`), worker pool, `generate_runs`, `binary_search`, stress test, streaming percentiles; statistical agreement with `mc.json` / `stress.json`.

## C4 notes
- `engine/rng.ts`: xoshiro128** + Box-Muller. Each path is seeded from `(seed, pathIndex)` via splitmix32, so results don't depend on how runs are split across workers or chunks (tested), and goal-seek reuses the same seed every iteration (common random numbers, like Python's reused matrices). `returnModels` + `generatePathReturns` port `generate_correlated_returns` one path at a time: Cholesky stock/bond/cash factors with allocation weights normalized to unit variance.
- `engine/mc.ts`: `McJob` (serializable), `prepareJob`, `runChunk`, `summarize`, `ChunkRunner`, `localRunner`, `splitRanges`, `generateRuns`, `binarySearch`, `percentileSorted` (numpy linear method).
  - Streaming: no `runs × years` arrays. Kept per job: every ending wealth (Float64, 8 MB at 1M, so ending percentiles are exact), Float32 trajectories for the first `trajCap` = 100k paths (`mc_p10/50/90` are exact up to 100k runs; above that they come from those 100k paths, error well under 1%), and Float64 trajectories for the first 500 paths (spaghetti).
  - Seeds: `opts.seed`, or random. Python is unseeded, so results are compared statistically.
- `engine/crisis.ts` + `engine/stress.ts`: `runHistoricalStressTest(plan, {scenarioKey, assetAllocation, crisisTiming, regularMcResults, seed, runner})`. Crisis years override the generated returns per path, with per-year historical inflation through `prepareNumbaInputs(…, customInflationRates)`. When `regularMcResults` isn't passed, the regular run uses `seed + 1`.
- `workers/`: `protocol.ts` (messages and a pure `createHandler`), `mcWorker.ts` (entry), `pool.ts` (`McPool`: `runner` is a `ChunkRunner`, `chunks` = 4 × workers for load balancing, progress events, error propagation). Use it like: `generateRuns(plan, { runner: pool.runner, chunks: pool.chunks, onProgress })`. The pool runs one job at a time.
- Tests (`test/rng.test.ts`, `test/mc.test.ts`, `test/pool.test.ts`):
  - RNG moments, per-bucket mean/σ and the implied cross-bucket correlation.
  - Every plan agrees with `mc.json`: success rate within 3σ binomial; mean and median within 4 combined SEs.
  - Goal-seek for `aug_13_plan` within 5% of Python's spending.
  - Stress tests: scenario, crisis rows and labels exact; success rates within 3σ.
  - The pool (via an in-process fake worker) gives results identical to the local runner.
  - The tests can catch real errors: a +3% spending change moves success by 4–6 points, which the binomial check detects.
- Benchmarks (63-year married plan, this 4-core container):

  | runs | Node, 1 thread | Chromium, 4 workers |
  |---|---|---|
  | 10k | 1.1 s | 0.8 s |
  | 100k | 9.9 s | 2.6 s |
  | 1M | 85 s, peak RSS 133 MB | 16 s, main heap 47 MB |

- Open items for later phases:
  - Goal-seek at 1M runs would take ~25 × 16 s. Phase 6b should either cap goal-seek runs (e.g. 100k for the search, then a full `generateRuns` at the solved spending) or warn the user.
  - If more speed is needed, remove the small tuple allocations in `tax.ts`.

## Post-C4 fixes
- `tot_div` bug fixed in Python (`core/runs.py`, `njit_simulate_path`: `tot_div = 0.0` on the empty-taxable branch) and in TS (`montecarlo.ts`, reset every year). Fixtures were regenerated; only `kernel`/`mc`/`stress` changed, for the 9 plans whose taxable account empties.
  - Effect on Python results: up to 9 of 16 kernel paths changed per plan, by ≤ 0.3% ending wealth (9% on one near-depleted `syn_spouse_first` path). Headline success rates moved ≤ 0.1 points and medians ≤ 0.07%.
- New `test/crossEngine.test.ts`: the MC kernel at constant mean returns must reproduce `runDeterministic` year by year. That now holds bit-for-bit for 10 of 11 plans.
- **Other-tax inflation mismatch, since fixed.** `prepare_numba_inputs` used `inf_factors[t] / inf_factors[start_t]` with `start_t` clamped to the plan years. So it (a) ignored inflation from an adjustment start before the current age, and (b) deflated the tax below its base amount before an adjustment start that falls after the tax starts. `simulate_step` uses `(1+i)^years_since_adj` in both cases. Both `core/runs.py` and `inputs.ts` now use the `simulate_step` rule. With custom (stress-test) inflation, pre-plan years compound at the base rate and plan years at the per-year rates; this also covers `inflation_less_pct`.
  - Effect: `sept3testplan` (tax started at 36, user 38) now pays 8,034 instead of 7,500 in year 0 (+7.1% every year). Its MC success went from 61.07% to 59.94% and its median from 5.35M to 4.75M (same seed). `gemini_and_claude_plan` changed only at the ulp level.
  - `syn_spouse_first` now carries two other-tax items (a future adjustment start and a retroactive `inflation_less_pct`) to cover both cases, with and without custom inflation.
  - `crossEngine.test.ts` now requires all 11 plans to match exactly. The `it.fails` exception was removed when it tripped.
- Remaining (not a cross-engine mismatch, both engines share the function): `calculate_income_growth_factor` with legacy flat fields applies a past adjustment start retroactively without custom inflation, but only from the plan start with custom inflation (stress test). Multi-period `adjustments` never apply pre-plan years. Worth a look when the stress test UI is ported.

## 4a notes (plan model I)
- Python refactors (behaviour-preserving; every pre-existing fixture regenerated byte-identical, and the Django suite is unchanged):
  - `core/views.py`: `import_plan_data` is split, with stage 1 as `normalize_plan_fields(data)` (`normalize_imported_plan`, simulation-type sync, SS flag migration, income `adjustments` / survivor-% migration). The income migration moved ahead of the balance-sheet steps; it only touches `income_sources`.
  - `core/views.py`: `apply_mode_change(data, post) -> [(level, msg)]` extracted from `change_mode_view`.
- New fixtures: `plans/<saved>/normalized.json` (stage-1 import of each saved file), and in `functions/`: `plan_defaults.json`, `normalize.json` (12 hostile/edge inputs), `plan_errors.json` (58 plans, 40 distinct messages, both `plan_errors` and `death_age_errors`), `mode_change.json` (21 cases).
- `web/src/lib/plan/`:
  - `coerce.ts`: `getFloat`, `getInt`, `getBool` (form leniency: `$ % ,` stripped, non-finite → default; `getBool` is true only for `'on'`, `'true'`, `'True'`, `true` or `1`) and `pyStr`.
  - `types.ts`: the `Plan` model (snake_case keys, as stored and exported).
  - `defaults.ts`: `getDefaultData` (no balance sheet yet; 4b), `buildDefaultRebalancing`, `parseRebalancing`.
  - `normalize.ts`: kinds tables, `normalizeImportedPlan`, `normalizePlanFields`, `parsePlanJson`. That rejects NaN/Infinity with Django's message, requires an object, and **unwraps one level of JSON-string-encoded plans**, which Django rejects; four saved files are in that form.
  - `validate.ts`: all `validate_*`, `deathAgeErrors`, `planErrors`, with byte-identical messages.
  - `modeChange.ts`: `applyModeChange(plan, input)`, in place, returning `{level, message}[]`. Inputs are the raw field values, keeping the "apply only if the displayed rounded value changed" rule.
  - `balanceSheet.ts`: placeholder `syncAccountsToBalanceSheet` (identity) for 4b.
  - `store.svelte.ts`: `PlanStore` (runes).
    - State: `$state` `plan`, `dataVersion`, `cachedResults`, `cachedVersion`.
    - Storage: localStorage key `retire.plan.v1` (`{plan, dataVersion}`); cached results under `retire.results.v1`, best effort against the quota.
    - Methods: `load`, `save`, `markChanged`, `replace`, `clear`, `importText → {loaded, errors}` (stage 1, then a `completeImport` placeholder for 4b, then `planErrors`), `exportText`, `applyModeChange`, `setCachedResults`, and `startAutosave()` (an `$effect.root` that bumps the version and saves on any nested edit).
    - Storage is injectable (`memoryStorage()` for tests).
- Known JS/Python difference: JSON can't distinguish `95.0` from `95`. Python prints raw float inputs as `95.0` in messages and `str(42.0)` as `'42.0'`; TS prints `95` and `'42'`. After normalization these fields are ints, so real imports are unaffected; the test maps `(N.0)` → `(N)` for the raw-float grid cases.
- Testing setup: `svelte` 5 + `@sveltejs/vite-plugin-svelte` + `jsdom`. **Rune code only compiles for the client (so `$effect` runs) in a DOM environment**, so files testing stores or components start with `// @vitest-environment jsdom`; engine tests stay on node. `vitest.config.ts` uses the Svelte plugin with the `browser` resolve condition.
- Next (4b): port `build_default_balance_sheet` (then add it to `getDefaultData`), `parse_balance_sheet`, `sync_balance_sheet_to_accounts`, `sync_accounts_to_balance_sheet`, `aggregate_accounts`, `flat_assets_to_accounts`, `calculate_marginal_tax_rate` (+ `calculate_taxable_ss_forms`), then the rest of `import_plan_data` in `completeImport`. Target: `imported.json` for every plan, `get_default_data()` including the balance sheet (date frozen to 2026-01-15 in fixtures, so pass "today" in), and the mode-change cases that call the sync.

## 4b notes (plan model II)
- `web/src/lib/plan/`:
  - `accounts.ts`: `flatAssetsToAccounts`, `aggregateAccounts` (balance-weighted returns; contribution-weighted if all balances are 0; plain average if both are).
  - `marginal.ts`: `calculateMarginalTaxRate`, `calculateTaxableSsForms` (the engine's worksheet).
  - `balanceSheet.ts`: `buildDefaultBalanceSheet`, `parseBalanceSheet`, `syncBalanceSheetToAccounts`, `syncAccountsToBalanceSheet` (replaces the 4a placeholder).
  - `importPlan.ts`: `completeImport` (stage 2), `importPlanData` (the full Manage-page import), `ensurePlanBlocks` (adds a missing balance sheet / rebalancing, as `get_session_sim_data` does; the store applies it on load).
  - `pyutil.ts`: `get`, `or`, `title`, `pyEqual` (Python `==`, used where Python's `in` / `list.remove` compare dicts by value), and `todayIso`.
  - `getDefaultData(today)` now includes the balance sheet.
- **Dates:** every function that calls `date.today()` in Python takes a trailing `today` (YYYY-MM-DD, default: the local date). Tests pass the fixtures' frozen `2026-01-15`.
- New fixtures:
  - `functions/balance_sheet.json` (149 cases, about 1.9 MB): marginal-rate inputs, aggregation, flat-asset migration, build/parse, and both sync directions. They cover rename/retype/new/no-id/no-type accounts, category moves, unlinked duplicates, placeholder clean-up, cash→taxable, multi-period values and missing categories.
  - `functions/mode_change_sync.json`: return edits on every imported plan.
  - `plan_defaults.json` gains `default_data_full`.
  - Every saved plan's full import matches `imported.json`.
- Fixture-generator pitfalls fixed along the way:
  - `_case` now snapshots its arguments; callers mutate them afterwards.
  - Mode-change cases now round-trip the plan through JSON first. In memory, an imported plan's `*_assets.accounts` are the *same* dicts as `data['accounts']`, so in-place return edits also changed the aggregates. Django never sees that sharing, because the session is JSON between requests; neither does the browser store.
- **Python quirk kept for parity:** re-importing an exported legacy plan is not idempotent the first time. `early_suzie_plan` gains a zero-balance "Primary 401(k) / Traditional IRA" account, because its first import built a balance sheet with that placeholder marked `include_in_retirement`. It is stable from the second round trip on. Django does exactly the same; the store test asserts this.
- Ported `BalanceSheetTests` cases (direct-call ones): marginal rate (incl. pensions/SS and overrides), build/parse, both sync directions, bidirectional sync, default zero amounts, multi-column JSON import, rename without clobbering, cash→taxable, duplicate-name validation, case-insensitive linking both ways, unlinked-duplicate removal.
- Next (5a): SvelteKit + adapter-static app shell. The plan model is ready: `PlanStore` (`store.svelte.ts`) for state, `planErrors` for validation, `importPlanData` / `exportText` for Manage, `applyModeChange` for the Results card.
