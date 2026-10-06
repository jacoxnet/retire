# Convert the retire app from Django to a static, client-side app

## Context
Right now the retirement calculator is a Django app. The server holds each plan in the session (`SimulationData` JSONField and session keys). It parses and validates form POSTs in `core/forms.py` and `core/views.py`, runs the Monte Carlo, binary-search and stress-test engines in `core/runs.py` (numpy + Numba `prange`), and renders results through Django templates.

The goal is a site with only static files (GitHub Pages) where every calculation runs in the browser. That removes the server, keeps all user data on the user's machine, and costs nothing to host.

**Feasibility: yes.** Nothing here needs a server.
- The DB holds only the session plan, which can move to localStorage.
- The CPI data is a bundled JSON file (`core/data/cpi_u_historical.json`, 28 KB).
- The historical returns are constant tables.
- The plan is already exchanged as JSON.

The main risks:
1. Porting about 4.5k lines of numeric Python (`runs.py`, `forms.py`, parts of `views.py`) without changing results.
2. **Memory at 1M runs.** Today all return matrices and the trajectory matrix are materialized (`runs × years × 6`). At 1M runs that is gigabytes, which is not viable in a browser.
3. **FRED CPI refresh.** `fred.stlouisfed.org` CSV does not send CORS headers, so the browser cannot fetch it directly.

Decisions made: the engine is ported to **TypeScript** and runs in **Web Workers**. The UI is a **full Svelte 5 rewrite** using SvelteKit with `adapter-static`. Everything is built with **Vite** and deployed to **GitHub Pages**.

## Target architecture
```
web/                         (new; SvelteKit + adapter-static; Django stays runnable until cutover)
  src/
    routes/                  +page.svelte for / (Enter), /results, /manage; +layout.svelte = base.html nav/theme
    lib/
    engine/                  pure TS, no DOM, so it runs in workers and Vitest
      constants.ts           tax brackets, RMD table, correlation/Cholesky (runs.py top)
      tax.ts                 calculate_tax / preferential / taxable SS / rollover / RMD helpers
      inputs.ts              extract_sim_inputs, prepare_numba_inputs, resolve_age, income growth
      deterministic.ts       simulate_step, run_simulation_path, run_deterministic
      montecarlo.ts          njit_simulate_path kernel (single path, typed arrays)
      rng.ts                 seeded PRNG (xoshiro128**/PCG) + normal sampler + correlated draws
      stress.ts              run_historical_stress_test + historical_data tables
      cpi.ts                 calculate_cpi_inflation and related (cpi_service minus HTTP)
    plan/                    port of forms.py + views.py data logic
      defaults.ts            get_default_data
      types.ts               Plan / Account / IncomeSource / BalanceSheet ... interfaces
      validate.ts            plan_errors, validate_*, normalize_imported_plan, mode-change logic
      balanceSheet.ts        build/parse/sync balance sheet, rebalancing, marginal tax rate
      store.svelte.ts        reactive plan state ($state rune) persisted to localStorage; data_version + cached results
    workers/
      mcWorker.ts            runs a slice of paths; returns ending wealths, success count, per-year stats
      pool.ts                spreads runs over navigator.hardwareConcurrency workers; progress events
    components/
      enter/                 DemographicsTab, AccountsTab + AccountCard, SpendingTab + rows, IncomeTab + rows,
                             BalanceSheetTab, RebalanceTab, ModeToggle, RunButtons
      results/               ExecutiveSummary, InputsPanel, McResults, GoalSeekResults, ProjectionsTable,
                             CashFlowsTable, StressTest, charts/ (Chart.js wrappers)
      manage/                ImportExport, ClearData
      shared/                MoneyInput, PercentInput, AgeSelect, HelpPopover, InstructionsModal (marked)
  static/data/cpi_u_historical.json, favicon.png, how-to.md
tools/golden/dump_fixtures.py  runs the Python engine on saved plans and writes JSON fixtures
.github/workflows/deploy.yml   build + Pages deploy; scheduled job refreshes the CPI JSON from FRED
```

Key design points:
- **Strangler approach.** Build `web/` next to Django and keep the Python as the reference oracle. Delete Django only at the end.
- **Golden-fixture testing.** A Python script dumps inputs and outputs for every file in `saved json files/`. These cover `extract_sim_inputs`, `prepare_numba_inputs`, `det_rows`, and the MC kernel fed **fixed return matrices**. TS has to match each within 1e-9. End-to-end MC is compared statistically: success rate within the sampling error of N runs.
- **Streaming Monte Carlo.** Each worker gets `(seed, startRun, count)` and generates its returns path by path, so no `runs×years` return arrays exist.
  - The binary search reuses the same seeds on every iteration, which reproduces today's common-random-numbers behaviour without storing anything.
  - The mc_p10, p50 and p90 trajectory percentiles are exact up to a cap (for example 100k runs, Float32 per-year columns). Above the cap, per-year histograms or a quantile sketch take over.
  - The worker keeps the 500 spaghetti paths.
- **Full Svelte 5 rewrite of the UI.** Use SvelteKit with `adapter-static` and prerendering: you get routing and correct handling of the GitHub Pages base path, and the output is still static files.
  - Django's `{% if %}/{% for %}` blocks become Svelte `{#if}/{#each}`.
  - The imperative DOM code in `enter.js` and `results.js` becomes components bound to the plan store.
  - Keep Bootstrap 5 CSS, Font Awesome and `static/css/style.css` so the app looks the same.
  - Keep Chart.js, wrapped in small chart components.
  - Bootstrap's JS (tabs, modals, popovers) gets replaced by Svelte state or thin actions.
- **Typed state replaces form parsing.** Inputs bind straight to the typed plan store, so most of the `parse_*` / `get_float` string coercion in `forms.py` doesn't need porting. Validation and `normalize_imported_plan` do get ported, because imported JSON still needs checking.
- **The old JS is a behaviour spec, not code to reuse.** Port each tab by reading the matching section of `enter.html` and `enter.js` for its rules: which fields show in simple or advanced mode, defaults, cross-field updates, and the balance-sheet ↔ accounts sync.

## Phases
The work runs under two quota regimes:
- **Phase C** runs on the remaining Claude cloud credit (about $70–100 when it starts). That credit is spent in dollars, so the 5-hour window doesn't apply.
- **Phases 4a–7** run after the credit is used up. Each one fits **one 5-hour subscription window with headroom**.

The engine work goes in Phase C because it is pure TS checked against Python fixtures. It needs the most context (`runs.py` is about 2.8k lines) and gains most from a long, uninterrupted session. The UI work splits cleanly at component boundaries, which suits 5-hour windows. Every phase and checkpoint ends with a green test suite and a commit, and the Django app keeps working throughout.

### Phase C: cloud sprint, the whole engine (old phases 0–3b)
Work through these checkpoints in order, in one cloud session, and continue across context compaction. Each checkpoint ends with green tests, an update to `web/PORTING.md`, a commit, and a **push**. The cloud container is ephemeral, so anything not pushed can be lost.

| # | Was | Checkpoint | Main files | Done when |
|---|-----|-----------|-----------|-----------|
| C0 | 0 | **Scaffold + oracle.** Vite/TS/Vitest in `web/`. Write `tools/golden/dump_fixtures.py`, which adds an optional fixed-returns/seed hook to `runs.py` for dumping only. Generate fixtures from the saved plans. | `runs.py` (hook only), new tooling | `npm test` runs; fixtures committed |
| C1 | 1 | **Constants, tax, inputs.** Port the helpers in `runs.py` lines 1–750 plus `extract_sim_inputs` and `prepare_numba_inputs`, `historical_data.py`, and the calc parts of `cpi_service.py`. | `engine/constants,tax,inputs,stress(tables),cpi` | Fixture equality for inputs and tax functions |
| C2 | 2 | **Deterministic engine.** Port `simulate_step` (about 450 lines), `run_simulation_path`, `run_deterministic` and `get_life_insurance_routing`. | `engine/deterministic.ts` | `det_rows` match exactly for every saved plan |
| C3 | 3a | **MC kernel.** Port `njit_simulate_path` to TS over typed arrays. | `engine/montecarlo.ts` | Fixed-returns fixtures match exactly |
| C4 | 3b | **RNG, workers, orchestration.** Seeded correlated returns, worker pool, `generate_runs`, `binary_search`, stress test, streaming percentiles. Benchmark 10k, 100k and 1M runs. | `rng.ts`, `workers/*`, `stress.ts` | Statistical agreement with Python; 1M runs completes without blowing memory |

**Budget.** A rough estimate is $12–20 of API-rate tokens per checkpoint, so C0–C4 comes to about $60–90. That fits the credit but leaves little margin. C4 goes last because it is the first one to drop.

Operating rules for Phase C:
- **Before C0:** check that `uv sync` (which needs Numba wheels) and `npm install` both work through the container's proxy. If either fails, fix the environment's setup script first; don't spend credit on workarounds.
- **Check spend between checkpoints** in the claude.ai usage page or with `/cost`. Start the next checkpoint only if clearly more than about $20 of credit remains. Otherwise stop at the green boundary you just pushed.
- **Fallback.** Any checkpoint that isn't reached becomes a 5-hour phase with the same scope, done before 4a. C0–C3 each fit one window. C4 fits one window, or splits into C4a (RNG and worker pool) and C4b (binary search, stress test, percentiles and benchmark) if it runs long.
- `PORTING.md` is the source of truth for progress. If the session ends or compaction loses detail, a new session resumes from it.
- The cost rules below apply here too: no subagent fan-out, read only the Python section being ported, and no interactive browser sessions.

### Phases 4a–7: one 5-hour window each

| # | Phase | Main files | Done when |
|---|-------|-----------|-----------|
| 4a | **Plan model I.** Plan types, `get_default_data`, `normalize_imported_plan`, `plan_errors` / `death_age_errors` / `validate_*`, `change_mode` logic, `store.svelte.ts` with localStorage. | `plan/*` | Saved-plan import fixtures reproduced; validation tests ported |
| 4b | **Plan model II.** Balance sheet build/parse/sync, `aggregate_accounts` / `flat_assets_to_accounts`, rebalancing, `calculate_marginal_tax_rate`. | `plan/balanceSheet.ts` etc. | Fixtures match; relevant `core/tests.py` cases ported to Vitest |
| 5a | **App shell.** SvelteKit layout (nav, theme toggle, instructions modal with `how-to.md`), shared input components, simple/advanced mode toggle, Demographics & Plan Details tab, Run buttons. | `routes/+layout`, `components/shared`, `enter/DemographicsTab` | Edit → reload keeps values; mode toggle hides advanced fields |
| 5b | **Accounts tab.** Account cards (add/remove, types, contributions, volatility, tax-treatment drawers). | `enter/AccountsTab`, `AccountCard` | Saved plans' accounts display and edit correctly |
| 5c | **Spending + Income tabs.** Regular and additional spending rows; Social Security, income streams, other taxes. | `enter/SpendingTab`, `IncomeTab` | Rows add/edit/remove; validation messages shown |
| 5d | **Balance Sheet + Rebalance tabs, Manage page.** Balance-sheet date columns and account sync, CPI adjustment, rebalancing; import/export/clear. | `enter/BalanceSheetTab`, `RebalanceTab`, `routes/manage` | Every saved plan imports, round-trips through export, and its data matches the Django Enter page |
| 6a | **Results display.** Executive summary, inputs panel, MC and goal-seek result cards, projection and cash-flow tables, charts. Driven from fixture results. | `components/results/*` | Renders each saved plan's fixture results the same as Django |
| 6b | **Results wiring.** Run the worker pool with a progress UI, cache results by data_version, interactive stress-test selector (replaces `/api/stress_test/`), results-page input edits and mode changes. | `routes/results`, `StressTest` | Full Enter → Results flow works in the browser |
| 7 | **Ship.** Port Playwright smoke tests to `vite preview`. GH Pages deploy workflow. Scheduled CPI-refresh action. Remove Django, or move it to `legacy/`. Update README and how-to. | `.github/workflows/*`, tests | Live on Pages; CI green |

That makes 9 window phases after Phase C, about 3–4 weeks at 2–3 phases per week, plus any C checkpoints that spill over. Phases 5b and 5d are the largest because the account and balance-sheet logic in `enter.js` (about 7.2k lines) is extensive. If either runs long, split it at a component boundary.

Ways to keep each window phase inside quota:
- Start each phase in a **fresh conversation**, pointing at this plan plus a short `web/PORTING.md` progress log updated at the end of every phase.
- Read only the Python section being ported in that phase. `runs.py` and `enter.js` are large, so avoid loading them whole.
- Rely on Vitest fixture tests and don't run interactive browser sessions, per `.agents/rules/testing.md`. Use one Playwright screenshot per UI phase at most.
- Don't fan work out to subagents. A single agent working through one file at a time is cheaper.
- If a phase runs long, stop at a green test boundary and commit; the next session picks up from `PORTING.md`.

## Verification
- **Engine (Phase C, C1–C4):** `npm test` in `web/` compares against the Python-generated fixtures (`tools/golden/dump_fixtures.py`, run with `uv run`). Deterministic and fixed-returns comparisons must be exact. MC success rates must agree within about 3σ of binomial sampling error.
- **Plan model (phase 4):** Vitest versions of the input-validation and form tests in `core/tests.py` and `core/tests_input_validation.py`, plus round-trips on every file in `saved json files/`.
- **UI (phases 5–6):**
  - Component tests with Vitest and `@testing-library/svelte`: mode visibility, row add/remove, store persistence, balance-sheet sync.
  - `npm run dev` for manual checks.
  - One Playwright smoke test per page against `vite preview`.
- **Ship (phase 7):** the GH Actions build passes, and the deployed Pages URL loads a saved plan and produces results matching the Django app for the same plan.
- **Throughout:** `uv run manage.py test --keepdb` stays green until Django is removed.
