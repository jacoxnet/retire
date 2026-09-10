# How to Use the Retirement Calculator

> **Disclaimer:** This tool is made available for educational, informational, and entertainment purposes only. It is not intended to provide, and must not be relied upon for, investment, financial, tax, or legal advice. All projections, simulations, and calculations are hypothetical in nature, reflect simplified mathematical models, and are not guarantees of future performance. Actual outcomes will vary, potentially significantly. Always consult with a qualified financial advisor, Certified Financial Planner (CFP®), CPA, and legal professional before making any financial decisions. This tool is made available "as is," without any warranty of any kind, express or implied, regarding accuracy, completeness, fitness for a particular purpose, or anything else.

## What this app does

- It projects whether your savings can support your retirement spending, using a
  **Monte Carlo** engine (thousands of randomized market paths), a **deterministic**
  year-by-year projection, and a **historical stress test**.
- Two modes:
  - **Regular Simulation** – you set a spending level; the app reports the
    **success rate** (share of runs that never run out of money).
  - **Maximum Spending Simulation** – you set a target success rate; the app
    solves for the **highest sustainable spending**.
- Your inputs live only in the current browser session. Use the
  **Save / Load / Clear Data** page to keep a plan for later.

## 1. Enter Data page

Five tabs. You can press **Run Simulation** from any tab.

### Demographics & Plan Details

- Present age, retirement age, and age at death for you (and spouse, if married).
- Filing status, current year, and when regular spending begins.
- **Spending:** desired annual amount in today's dollars, survivor spending after
  the first death, whether spending grows with inflation, and the inflation rate.
- **Simulation settings:** number of runs, and target success rate (Maximum
  Spending mode).
- **Life insurance:** death benefit, term vs. permanent, and term expiration age,
  for each spouse.
- **Social Security:** whether entitled, amount and frequency, and claiming age
  (62–70) for each spouse.
- **State tax:** flat state income-tax rate and whether Social Security is exempt.

### Accounts for Retirement

- Add one row per account. Choose a **type**: Pretax (IRA/401k), Roth, Taxable,
  or HSA, and an **owner** (you or spouse).
- Enter the current balance, contribution amount and frequency, contribution
  start age, end age (or "at retirement"), and an inflation-adjust toggle.
- Set an expected annual **return (mean)** and **volatility (std. dev.)** per
  account.
- Every account name must be unique.

### Additional Spending

- One-time or recurring expenses on top of regular spending (a car, college,
  travel, a mortgage payoff).
- Set the amount, the start and end ages, and how the amount changes over time.

### Social Security & Income Streams

- Other income such as pensions, annuities, rental income, or part-time work,
  each with a start/end, an adjustment rule, and an optional survivor-benefit
  percentage.
- **Other Taxes** captures recurring tax items the engine does not model
  automatically.

### Balance Sheet (optional)

- A spreadsheet-style view of assets across future dates; add columns for the
  dates you care about.
- It stays in sync with the Accounts tab automatically.

## 2. Simulation Results page

- **Monte Carlo Simulation** – success rate (or the solved spending), ending-wealth
  percentiles, and a summary of the inputs used. You can adjust key inputs here
  and re-run without returning to the Enter Data page.
- **Deterministic Projection** – year-by-year account balances using the average
  return for each account.
- **Deterministic Cash Flow** – year-by-year income, spending, taxes, and
  withdrawals.
- **Charts** – a spaghetti plot of the runs, wealth-trajectory bands, and more;
  click a chart to enlarge it.
- **Stress Test** – re-runs the plan with a historical crisis (2000 dot-com,
  2008, and others) inserted into the timeline and compares the result with the
  baseline.
- Use the **Simulation Mode** selector on this page to switch between Regular and
  Maximum Spending, then re-run.

## 3. Save / Load / Clear Data page

- **Save Plan (.json)** – downloads every input to a local file.
- **Load Plan (.json)** – restores a saved file; older files are migrated
  automatically.
- **Clear Data** – resets every input to the sample defaults.

## Key assumptions

- Amounts you enter are in today's dollars unless noted; the app inflates them
  internally.
- Each year, required minimum distributions are taken first. Any remaining
  shortfall is covered in this order: **taxable, then pre-tax, then Roth, then
  HSA**. Pre-tax withdrawals are grossed up for income tax and, before age 59½,
  a 10% early-withdrawal penalty.
- Pre-tax withdrawals are taxed as ordinary income; Roth withdrawals are
  tax-free; taxable-account income and gains are taxed as they occur.
- Surplus cash in a year is reinvested into your taxable account.
- Federal brackets, the standard deduction, and Social Security taxation are
  modeled; state tax is the flat rate you supply.
- A run "succeeds" if the portfolio never falls below zero before the last
  modeled year (life-insurance proceeds left as an estate do not count toward
  success).

## Tips

- Start in Regular mode with your best-guess spending. If the success rate is far
  from your comfort level, switch to Maximum Spending to see what is sustainable.
- Use 10,000 or more runs for stable numbers; drop the count for quick
  experiments.
- Save your plan before you Clear data or make large edits — session data is lost
  when the browser session ends.
- Check the Stress Test tab before trusting a high success rate.
