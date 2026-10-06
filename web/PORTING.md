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
| 5a App shell | done | see below |
| 5b Accounts tab | done | see below |
| 5c Spending + Income tabs | done | see below |
| 5d Balance Sheet + Rebalance tabs, Manage page | next | replaces the last two placeholders; `/manage/` |

## How to run
- TS tests: `cd web && npm install && npm test` (~20 s). `npm run typecheck` (`tsc`) and `npm run check` (`svelte-check`, which covers `.svelte` files) both run `svelte-kit sync` first.
- App: `npm run dev` (dev server), `npm run build` (static site in `web/build/`), `npm run preview` (serves the build). `BASE_PATH=/retire npm run build` builds for a GitHub Pages project site.
- Benchmarks: `npm run bench` (single thread, Node; ~100 s) and `npm run bench:browser` (worker pool in headless Chromium via the Vite dev server; pass a Chromium path if not `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`). Results are committed in `bench/results-*.json`.
- Regenerate fixtures: `uv run tools/golden/dump_fixtures.py` from the repo root (~90 s; deterministic, so a re-run should produce no git diff unless the Python engine changed).
- Django: `uv run manage.py test --keepdb`. In the cloud container `core.tests_browser` fails to launch Chromium (Playwright/browser version mismatch); that's environmental, not a regression.

## C0 notes
- `web/` started as plain Vite + TS + Vitest; SvelteKit/adapter-static was added in phase 5a. The engine lives in `web/src/lib/engine/`.
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

## 5a notes (app shell)
- **Tooling.** SvelteKit **3** with `adapter-static`. In Kit 3 the config lives in `vite.config.ts` (`sveltekit({ adapter, paths })`); there is no `svelte.config.js`, and `$lib` was removed (use relative imports, as the rest of `src/lib` does, or `#lib` subpath imports).
  - TypeScript is pinned to **6.x** because Kit 3 declares a peer dependency on `typescript@^6`; 7.x failed `npm install`.
  - `tsconfig.json` extends `$app/tsconfig` (generated by `svelte-kit sync`; the `prepare` script runs it after `npm install`).
  - `vitest.config.ts` still uses only the Svelte plugin, not SvelteKit. Components must not import `$app/*`; only the route files do, and they pass callbacks down.
  - `bench/browser-bench.mjs` now starts Vite with `configFile: false` so the SvelteKit plugin doesn't take over its server.
- **Routes** (`src/routes/`): `+layout.ts` sets `prerender = true`, `ssr = false`, `trailingSlash = 'always'`. Every page is an empty prerendered shell rendered in the browser, because the plan lives in localStorage. `/results/` and `/manage/` are placeholders. Links use `resolve()` from `$app/paths`, so a `BASE_PATH` works.
- **Shared assets.** `static/css/style.css` and `static/how-to.md` are imported from the Django app's `static/` folder (`../../static/...`), not copied, so the two apps can't drift. `server.fs.allow: ['..']` is set in both Vite configs. Bootstrap 5.3.8 CSS and Font Awesome 6.5.1 come from the same CDNs as `base.html`; **no Bootstrap JS**. Phase 7 moves these files into `web/`. `web/static/favicon.png` is a copy.
- **App state** (`src/lib/app/`):
  - `context.ts`: lazy singletons `planStore()` (with `startAutosave()`) and `uiPrefs()`.
  - `ui.svelte.ts`: `UiPrefs`, holding the theme and the planner mode. They use the Django app's localStorage keys `retire_theme` and `planner_mode`; neither is part of the plan.
  - `badges.ts`: `tabBadges(plan)`, the summary badges on the section tabs.
  - `format.ts`: `parseNumberText`, `formatMoney`, `formatPercent`, `formatBadgeMoney`.
  - `howTo.ts`: renders the bundled markdown with `marked`.
- **Layout** (`+layout.svelte`): navbar with the active link, theme toggle, and mobile collapse driven by Svelte state. The footer's "How to Use this App" opens `InstructionsModal`. The Django footer's "Leave Feedback" link had no handler, so it was dropped.
- **Shared components** (`components/shared/`):
  - `MoneyInput`: bound number, shown as whole dollars with commas once the field loses focus; an empty field counts as 0. `dollarSign` puts the `$` inside the field, as `.currency-input` does.
  - `PercentInput`: bound number, shown as `N%`.
  - `HelpPopover`: hover/focus, using Bootstrap's popover markup.
  - `InstructionsModal`.
  - `AgeSelect` is deferred to 5c, where the first age selector appears.
- **Enter page** (`components/enter/`):
  - `EnterPage`: mode bar, section tabs with badges, active-tab state, and the mobile section menu. Simple mode removes Balance Sheet and Rebalance; if one of them is open, it falls back to Accounts. Uses `planner-simple-mode` on the form, as Django does.
  - `ModeToggle`, `TabFooter` (Back / Next / Run Simulation).
  - `DemographicsTab`, a full port. Marking yourself married sets the filing status to joint, unmarking sets single (only on the user's toggle). The life-insurance label depends on marital status. The term-age field appears only for term policies. The policy status line works as before.
  - `PendingTab`: placeholder for tabs 2–6, keeping their navigation and Run buttons.
  - Moving to Accounts, or leaving a life-insurance amount field, adds the life-insurance taxable account when needed (`ensureTaxableAccountForLifeInsurance`).
- **Saving and running** (`plan/commit.ts`):
  - `commitEnterPlan(plan, today)` ports the `enter_view` POST rules onto the edited plan, in place. It covers the defaults for empty ints and floats, clearing spouse fields and spouse Social Security / life insurance when single, filing status and spending start consistent with marital status, life-insurance type checks, adding the taxable account, `syncAccountsToBalanceSheet`, `aggregateAccounts` and the marginal rate.
  - `demographicsFieldErrors` covers the client-side checks that `enter.js` ran before posting: blank name, and empty or non-numeric ages.
  - `prepareEnterPlan` runs those checks, then the commit, then `planErrors`.
  - The route runs it on Run Simulation and when navigating to Results; errors cancel the navigation and appear in the alert. Leaving for any other page commits without blocking. Django blocked the Manage link on errors too, but that would stop a user from loading a different plan.
  - Committing an unedited saved plan leaves its aggregates, accounts and marginal rate unchanged (tested for all 8 saved plans).
- Not yet handled, left for later phases:
  - Per-field `is-invalid` highlighting with inline messages. Errors only appear in the alert for now.
  - Syncing balance-sheet edits back to the accounts on save (`syncBalanceSheetToAccounts`); that belongs to the 5d tab.
  - `runs` and `target_success_rate` handling; that belongs to the Results card in 6b.
- Known display difference: Django's `floatformat:"-2"` shows `3.50`, where `PercentInput` shows `3.5%`.
- Tests:
  - `test/app/format.test.ts` covers formatting and badges.
  - `test/plan/commit.test.ts`.
  - `test/components/enter.test.ts` (jsdom + `@testing-library/svelte`, via `EnterHarness.svelte`): edit → reload keeps values; simple mode hides the advanced tabs and remembers the mode; the married toggle; the term-policy status; adding the taxable account; the live badge; Run is blocked by errors and proceeds when the plan is valid; the how-to modal.
  - A Playwright check against `vite preview` confirmed edit → reload in Chromium. The CDN stylesheets are blocked in the cloud container, so the screenshot shows the page without Bootstrap.
- Next (5b): Accounts tab. Read `enter.html` `#assets` (~lines 357–395) and the account-card code in `enter.js` (`addAccountCard`, around lines 600–1000). Replace the `assets` `PendingTab` in `EnterPage.svelte`.

## 5b notes (Accounts tab)
- `plan/accountCard.ts` (pure and tested):
  - `personLabels(plan)` ports `getPersonLabels`: names fall back to You/Spouse, and ages use `parseInt(...) || default`.
  - `cardAccount(data, people, priorNames, makeId)`: every field the card shows, filled with `addAccountCard`'s defaults. "cash" becomes taxable; the legacy `age` end type becomes `user_specified` / `spouse_specified`; default names are numbered ("… 2"); ids are generated. Unknown keys are kept.
  - `newAccount` (Add Account), `setAccountOwner` (moves the end-age choice with the owner), `volatilityChoice` / `VOLATILITY_PRESETS` (8 and 10 show as Moderate), `duplicateAccountNames`, `yearAtAge` (the "Year N" hints).
  - `applyMarriageToAccounts` ports `syncSpouseChoice`: unticking Married moves spouse-based end ages to "retirement" and ticking it again restores them, unless the user changed them meanwhile. The set-aside values live in a `WeakMap`, not in the plan.
  - `commitAccounts` ports `parse_account_rows`, applied to each card's view of the account. A single person's owner becomes "user" and spouse end ages become "retirement". Blank names become "User Roth Account" and the like. Cleared fields take the per-type defaults. Start ages are raised to the owner's present age.
  - `commitEnterPlan` now runs it first, then adds the life-insurance account, as `enter_view` does.
- **Viewing doesn't rewrite the plan.** Cards bind through getter/setter pairs that read the account with defaults filled in (`cardAccount`) and write only the edited field. Defaults reach the plan on commit (Run, or leaving the page), as they did in Django, where accounts only changed on a POST. Committing a saved plan keeps every engine aggregate and the marginal rate identical. Accounts gain the card fields and ids but keep every value, and a second commit changes nothing (tested on all 8 saved plans).
- **Deliberate differences from Django:**
  - Extra account keys such as `institution` are kept on save. Django drops them, and gets `institution` back from the balance sheet in `sync_balance_sheet_to_accounts`, which isn't run on save until 5d.
  - Typing an age on the Demographics tab doesn't raise contribution start ages live, as `updateSpouseDropdownOptions` did. The commit's `max(present age, start)` gives the same saved result.
  - An unmarried plan whose account ends at `first_death` keeps that value. Django hid and disabled that option, which made the browser skip the field in the POST.
- **Components** (`components/enter/`):
  - `AccountsTab`: duplicate-name notice, cards, Add Account, Back / Next.
  - `AccountCard`: all card fields. Owner select only when married ("or Joint" for taxable accounts). End-age-specified input with its year hint. Volatility select with a custom-std input (a local `customStd` flag, so choosing "User Specified" sticks even when the value matches a preset). Taxable drawer with the cost-basis estimate and community-property choice. HSA medical switch. Advanced-only fields keep the `advanced-only-field` class, which `style.css` hides in simple mode.
  - `TaxAssumptionsModal`: the `#tier1TaxAssumptionsModal` body, copied from `enter.html`.
  - `EnterPage` shows the page-level duplicate-name notice (`#globalDuplicateNotice`).
- **Demographics follow-ups from `updateSpouseDropdownOptions`:** "Single" is hidden from Filing Status while married, and the married toggle calls `applyMarriageToAccounts`.
- Tests:
  - `test/plan/accountCard.test.ts`.
  - `test/plan/commit.test.ts` (updated for account normalization).
  - `test/components/accounts.test.ts`: every saved plan's cards show the right name, type, owner, balances, frequency, inflation switch, end age, start age, return, volatility and drawers, and viewing doesn't change the plan. Also add/edit/delete with default-name numbering, the type drawers and basis estimate, the assumptions modal, owner → end-age swap and year hints, volatility presets/custom, duplicate notices, simple-mode classes, and setting aside / restoring spouse end ages.
  - A deliberately broken owner select fails the saved-plan test for every married plan.
  - Playwright against `vite preview` with `aug_13_plan` in localStorage: 5 cards, and an edited balance survives a reload.
- Next (5c): Spending tab (`enter.html` `#spending` ~396–498; `addSpendingRow` and other-tax rows in `enter.js` ~1024–1100 and ~1600–1730) and Income tab (`#income` ~499–636; SS toggles ~285–336; income-stream cards with adjustment periods ~1102–1600). `AgeSelect` belongs there. Remember `begin_spending_age_type` / `survivor_spending` from `updateSpouseDropdownOptions` and `toggleSpouseSection`.

## 5c notes (Spending and Income tabs)
- `plan/spouseChoice.ts`: `syncSpouseChoice(obj, key, married, singleValue)`, the generic `syncSpouseChoice` port. Set-aside values live in a `WeakMap` keyed by object and field. `singleChoice` is the commit-time equivalent. `applyMarriageToAccounts` now uses it.
- `plan/scheduleRows.ts` (pure and tested):
  - `CHOICES` + `pick`: each select's option values in page order. A value without an option shows (and submits) as the first option; legacy aliases `specified` → `user_specified` and `one-time` → `one_time`.
  - Views with the page's defaults: `spendingItemView`, `incomeView` (with `periods`), `periodView`, `otherTaxView`, `ssView`.
  - Income schedules: `incomeSchedule` is the card's starting schedule (its `adjustments`, else one period from the legacy flat fields, else one default period). `editableSchedule` writes that into `item.adjustments` before the first period edit.
  - Other helpers: `showsSurvivor`, the `new*` rows, `applyMarriageToSchedules` (spending start, item person, income start/end, period start/end, tax start/end/adjust-start), and `rowNameErrors`.
  - `commitSchedules(plan, married)` applies `parse_additional_spending` / `parse_income_sources` / `parse_other_taxes` and the `enter_view` Social Security rules to each row's view. Income keeps the flat `adjust_type` / `adjust_val` in step with period 1 and sets `adjust_start_age_*` to `start` / 65, as Django does; the engine ignores those fields when `adjustments` is present.
- `commit.ts`:
  - `demographicsFieldErrors` → `clientFieldErrors`, now with all of `handleCustomValidation`'s client-only checks: current year 2020–2100, inflation 0–50%, account name required, return −100…100%, std 0…100%, and the row name/description checks.
  - Calls `commitSchedules`.
- **Bug fixed from 5a.** Svelte writes a select's or checkbox's shown value back into the plan when the bound field is missing. So just viewing Demographics added `user_life_insurance_type`, `spouse_life_insurance_type` and `state_ss_exempt: false`.
  - The last one was a real error. Django shows a missing exemption as checked (the template's `is None`) and saves it as exempt, and 4 saved plans have no `state_ss_exempt`. Their first Run would have saved SS as state-taxable.
  - Fixed in two places: (a) those fields, plus filing status and `adjust_spending_inflation`, bind through getter/setter pairs carrying the template's display defaults, and (b) `commitEnterPlan` saves a missing `state_ss_exempt` as true, an unknown or legacy filing status as the select shows it (Joint, then the marriage rule), and `adjust_spending_inflation` as a bool.
  - The component tests now check that viewing each saved plan's Spending or Income tab (Demographics renders first) leaves the whole plan unchanged. **Rule for later tabs: never `bind:` a raw plan field that may be missing; bind a getter/setter over a view.**
- **Deliberate differences from Django:**
  - `is_social_security` on an income stream is kept on save. The page never submitted it, so Django reset it to false. `aug_5_smith_plan` enters Social Security this way, and Django's first save would quietly tax it as ordinary income.
  - Unknown row keys are kept, as with accounts.
  - The Income tab badge counts the user's SS plus every income stream. Django's badge counted SS plus `#incomeSourcesTable tbody tr`, a selector that matches nothing.
  - A single person's plan that still holds spouse-based choices gets them moved on Enter-page mount (`EnterPage` `onMount`), as Django's `updateSpouseDropdownOptions` did on page load. For almost every plan this changes nothing.
- **Components:**
  - `shared/AgeSelect` (select + specified-age input + "Year N" hint) with `app/ageOptions.ts` (option labels with names and ages, spouse options only when married).
  - `app/spendingStartText.ts` (the Other Income intro phrase).
  - `enter/SpendingTab`: spending start + specified age, desired / survivor spending, inflation switch, additional-spending table rows, Other Taxes card (`advanced-only-card`).
  - `enter/OtherTaxCard`.
  - `enter/IncomeTab`: Social Security for each person, as a snippet with the receiving → future → fields → claiming-age reveal logic; the income stream list.
  - `enter/IncomeCard`: fields, survivor box (married and ending at a death; title and hint name the survivor), adjustment periods (add; remove except period 1), subject-to-tax.
  - The Demographics married toggle also calls `applyMarriageToSchedules`.
- Tests:
  - `test/plan/scheduleRows.test.ts`.
  - `test/plan/commit.test.ts`, which now also checks `state_ss_exempt`, filing status and `is_social_security` on every saved plan. With the 5b `commit.ts` it fails, as it should.
  - `test/components/spendingIncome.test.ts`: both tabs of every saved plan display field by field and viewing doesn't change the plan. Also add/edit/remove spending items, the specified start age and its year, other-tax reveal rules, the SS question flow, an income stream's survivor box and periods, the intro phrase, unmarry/remarry, and row validation messages blocking Run until fixed.
  - Playwright against `vite preview` with `sept27`: 2 income cards, an added period survives a reload, Run reaches `/results/`.
- Next (5d): Balance Sheet tab (`enter.html` `#balance-sheet` ~638–789; `enter.js` balance-sheet engine from ~1790, plus `syncBsStateToAccountCards` / `syncAccountCardsToBsState` ~2455), Rebalance tab (`#rebalance` ~790–1060), and the Manage page (`templates/manage_data.html`, `static/js/manage_data.js`; `PlanStore.importText` / `exportText` / `clear` are ready). On save, Django also ran `parse_balance_sheet` + `sync_balance_sheet_to_accounts` before the account rules (see `enter_view`); add that to `commitEnterPlan` with the tab. 5d is the largest phase; split Balance Sheet / Rebalance+Manage if it runs long.
