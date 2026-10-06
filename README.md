# Retirement Calculator

A retirement planner that runs entirely in your browser: enter your accounts, spending, Social Security and other income, then see a Monte Carlo success rate (or the maximum spending that meets a target success rate), year-by-year deterministic projections and cash flows, charts, and historical crisis stress tests. It also tracks a personal balance sheet and plans portfolio rebalancing.

There is no server. The site is static files on GitHub Pages; the simulations run in Web Workers on your own machine, and your plan is kept in your browser's local storage. Use **Save / Load / Clear Data** to export or import a plan as a `.json` file.

## Repository layout

| Path | What it is |
|---|---|
| `web/` | The app: SvelteKit 3 (`adapter-static`) + TypeScript + Vite. |
| `web/src/lib/engine/` | The simulation engine (tax, RMDs, withdrawal order, deterministic projection, Monte Carlo kernel, seeded RNG, goal seek, stress test). Pure TS, no DOM. |
| `web/src/lib/plan/` | The plan model: defaults, import and validation, save rules, balance sheet, rebalancing, the localStorage-backed store. |
| `web/src/lib/workers/` | The Monte Carlo worker pool. |
| `web/src/lib/components/`, `web/src/routes/` | The Enter Data, Results and Save/Load/Clear pages. |
| `web/src/lib/data/cpi_u_historical.json` | The bundled CPI-U series, refreshed weekly from FRED by `.github/workflows/update-cpi.yml`. |
| `web/fixtures/` | Golden fixtures from the reference Python engine; the TS port is tested against them. |
| `web/e2e/` | Playwright browser tests against the production build. |
| `legacy/` | The original Django app, kept as the reference engine that generates the fixtures. Not deployed. See `legacy/README.md`. |
| `docs/static-conversion-plan.md`, `web/PORTING.md` | How the Django app was converted, phase by phase. |

## Development

Requires Node 22.18 or newer.

```sh
cd web
npm install
npm run dev          # http://localhost:5173
npm test             # unit, fixture and component tests (Vitest)
npm run check        # svelte-check / TypeScript
npm run build        # static site in web/build
npm run e2e          # builds, then runs the Playwright tests against vite preview
```

The first `npm run e2e` on a new machine needs `npx playwright install chromium`.

## Deployment

`.github/workflows/deploy.yml` builds `web/` with `BASE_PATH=/<repository name>` and publishes it to GitHub Pages on every push to `main`. In the repository's **Settings → Pages**, set **Source** to **GitHub Actions** once.

`.github/workflows/ci.yml` runs the checks, unit tests and browser tests on pushes and pull requests, plus the legacy Django tests.

## CPI data

The balance sheet's inflation-adjusted targets use the CPI-U series (FRED `CPIAUCNS`). Browsers can't fetch FRED directly (no CORS headers), so `.github/workflows/update-cpi.yml` runs `web/scripts/update-cpi.ts` every Monday, commits the file if FRED has new months, and redeploys. Run it by hand with `cd web && node scripts/update-cpi.ts`.
