# How to Use the Retirement Calculator

> **Disclaimer:** This tool is made available for educational, informational, and entertainment purposes only. It is not intended to provide, and must not be relied upon for, investment, financial, tax, or legal advice. All projections, simulations, and calculations are hypothetical in nature, reflect simplified mathematical models, and are not guarantees of future performance. Actual outcomes will vary, potentially significantly. Always consult with a qualified financial advisor, Certified Financial Planner (CFP®), CPA, and legal professional before making any financial decisions. This tool is made available "as is," without any warranty of any kind, express or implied, regarding accuracy, completeness, fitness for a particular purpose, or anything else.

---

## Part 1: Basic Instructions (Quick Start)

The Retirement Calculator helps you answer one central question: **Will your savings and income support you throughout retirement without running out of money?**

### 1. Choose Your Mode
At the top of the **Enter Data** page, select your planning mode:
- **Simple Mode:** A streamlined 4-step walkthrough focusing on essential timeline dates, accounts, basic spending, and income. Ideal for a fast, straightforward estimate.
- **Advanced Mode (Default):** Unlocks all tools, including account volatility controls, detailed tax-treatment drawers, custom tax surcharges (IRMAA/NIIT), historical net worth tracking on the Personal Balance Sheet, and Portfolio Rebalancing.

### 2. Enter Your Core Plan (Key Tabs)
1. **Demographics & Plan Details:** Enter your current age, retirement age, and expected lifespan (and spouse’s details if married). Set your tax filing status, state income tax rate, and expected inflation rate.
2. **Accounts for Retirement:** Click **"+ Add Account"** to create an individual Account Card for each account you own (401(k), Traditional IRA, Roth IRA, Taxable Brokerage, or HSA). Enter current balances, future contributions, and expected average return.
3. **Spending:**
   - **Regular Retirement Spending:** Enter your baseline desired annual spending in retirement (in today’s dollars).
   - **Additional Spending:** Enter milestone or non-annual expenses (such as buying a car every 7 years, college tuition, or home renovations).  
     > **Important Note on Pre-Retirement Spending:** Additional Spending is intended for post-retirement expenses that do not occur every year. **It typically should NOT include pre-retirement spending items unless they are expected to be paid with funds drawn from your Accounts for Retirement.** Your everyday pre-retirement living expenses are assumed to be covered by your ongoing employment income.
4. **Social Security & Income Streams:** Specify claiming ages and benefit amounts for Social Security, plus any pensions, annuities, or rental income.

### 3. Run & Interpret Your Simulation
Click **Run Simulation** from any tab:
- **Regular Simulation:** Shows your **Success Rate**—the percentage of thousands of randomized market paths where your money lasted your entire lifetime.
- **Maximum Spending Simulation:** Solves for the **highest annual spending** your portfolio can sustain at your target confidence level (e.g., an 80% or 90% success rate).
- **Projections & Cash Flows:** Review year-by-year account balances, income, living costs, taxes, and withdrawals.
- **Stress Test:** See how your plan would have survived historical crashes like the 2000 Dot-Com bust or the 2008 Financial Crisis.

### 4. Save Your Work
Your plan data lives in your current browser session. Before closing your browser, go to the **Save / Load / Clear Data** page and click **Save Plan (.json)** to download your plan file to your computer. You can reload it anytime.

---

## Part 2: Detailed Instructions

### What This App Does

- **Comprehensive Simulation Engine:** Uses three complementary methods to test your retirement plan:
  - **Monte Carlo Engine:** Simulates thousands of randomized market return sequences to measure how sequence-of-returns risk affects your portfolio.
  - **Deterministic Projections:** Models your year-by-year account growth and detailed cash flows using the average expected return you assign to each account.
  - **Historical Stress Testing:** Re-runs your retirement timeline by inserting the actual market conditions of historical financial crises (e.g., 2000 Dot-Com, 2008 Financial Crisis, 1970s Stagflation) starting at your retirement year.
- **Two Simulation Modes:**
  - **Regular Simulation:** You supply your desired annual spending; the app calculates your probability of success.
  - **Maximum Spending Simulation (Goal Seeking):** You specify a target success rate (e.g., 85%); the engine solves for the maximum sustainable annual spending.
- **Data Privacy & Storage:** All calculations occur within your browser session; no personal financial data is stored on remote servers. Use the **Save / Load / Clear Data** page to export your plan to a `.json` file for backup.

---

### Simple Mode vs. Advanced Mode

Toggle between modes at the top of the **Enter Data** page:

- **Advanced Mode (Default):** Designed for comprehensive financial planning. Includes:
  - Account volatility (standard deviation) customization.
  - Taxable account tax settings (dividend yields, qualified dividend splits, cost basis ratios, and community property state step-up elections).
  - The **Other Taxes** card for scheduling unmodeled taxes or surcharges (like IRMAA or NIIT).
  - The **Personal Balance Sheet** for tracking past and present net worth and sinking funds.
  - The **Portfolio Rebalancing** tool.
- **Simple Mode:** Hides advanced volatility inputs, detailed taxable account drawers, other taxes, balance sheet net worth tracking, and rebalancing. It provides a clean, 4-step wizard for fast modeling.

---

### 1. Enter Data Page

#### Tab 1: Demographics & Plan Details

- **Timeline:** Enter your current age, planned retirement age, and age at death. If married, turn on the marriage switch to enter details for your spouse.
- **Life Insurance & Survivorship:** Enter lump-sum death benefits for term or permanent policies. If married, proceeds paid upon the first death are deposited into taxable savings in the year after death to help support ongoing retirement expenses. If there is no surviving spouse, proceeds flow to your estate/heirs.
- **Basic Plan Details:**
  - **Tax Filing Status:** Single, Married Filing Jointly, or Head of Household.
  - **State Income Tax Rate:** Enter your state's estimated flat or effective tax rate (0% for states without income tax).
  - **Exempt Social Security from State Tax:** Check this box if your state does not tax Social Security benefits (most states exempt them).
  - **Current Year & Inflation:** Set the current calendar year and expected annual inflation rate.

#### Tab 2: Accounts for Retirement

- **Account Cards:** Rather than typing into a spreadsheet table, you manage accounts through individual **Account Cards**. Click **"+ Add Account"** to create a card for each 401(k), Traditional IRA, Roth IRA, Taxable Brokerage, or HSA account. Every account must have a unique name.
- **Card Fields:** Specify account owner (you or spouse), current balance, contribution amount and frequency, contribution start and end ages (or "at retirement"), and an inflation adjustment toggle.
- **Expected Return & Volatility:** Enter your expected average annual return. In Advanced Mode, choose a volatility (standard deviation) preset—Low (4.5%), Moderate (9.5%), High (16.0%)—or specify a custom percentage.
- **Taxable Account Tax Treatment (Advanced Mode):** For taxable brokerage accounts, expand the tax drawer to inspect or adjust the app's default tax assumptions:
  - Dividend yield (default 2.0%) and qualified dividend share (default 85%).
  - Interest yield (default 0.0% for equity accounts; cash accounts default to 100% ordinary interest).
  - Annual capital gains distribution rate (default 0.5%).
  - Initial cost basis ratio (default 70% of balance, meaning 30% is unrealized capital gain).
  - Community property state election (governing spousal basis step-up upon the first death).
- **HSA Medical Switch:** For HSAs, toggle whether funds are reserved for qualified medical expenses (withdrawn completely tax-free).

#### Tab 3: Spending

- **Regular Retirement Spending:**
  - **Start Age for Spending:** Choose when retirement living expenses begin (at your retirement age, spouse's retirement age, or a specific age you enter).
  - **Desired Annual Spending:** Enter your target annual living expenses in today’s dollars.
  - **Survivor Spending:** If married, specify desired annual spending after the death of the first spouse.
  - **Inflation Adjustment:** Toggle whether annual spending grows each year with inflation.
- **Additional Spending:**
  - Enter milestone or periodic expenses that occur outside your regular baseline spending (e.g., buying a car every 7 years, college tuition, weddings, major travel, or a mortgage payoff).
  - For each item, set the amount, start age, repeat interval in years (`0` indicates a one-time expense), and inflation toggle.
  - **Important Rule for Pre-Retirement Items:** Additional Spending is intended for post-retirement expenses that do not occur every year. **It typically should NOT include pre-retirement spending items unless they are expected to be paid with funds drawn from your Accounts for Retirement.** Everyday pre-retirement expenses should be excluded, as they are presumed to be paid out of your ongoing job earnings.
- **Other Taxes (Advanced Mode):**
  - Enter recurring or one-time taxes and surcharges that the basic tax model does not compute automatically, such as Medicare IRMAA surcharges, the Net Investment Income Tax (NIIT), or local taxes.
  - Specify the amount, frequency, start age, end age, and inflation rule.

#### Tab 4: Social Security & Income Streams

- **Social Security:** For both you and your spouse, specify whether you are currently receiving benefits or will be entitled in the future. If entitled in the future, set your planned claiming age (62–70) and benefit amount.
- **Other Income Streams & Benefits:** Enter non-portfolio income received after retirement spending begins (pensions, annuities, rental income, or consulting work). Define the start/end ages, annual adjustment method (fixed percent or inflation-adjusted), and survivor benefit percentage.

#### Tab 5: Personal Balance Sheet (Optional – Advanced Mode)

- **Historical Net Worth Tracker:** The Personal Balance Sheet is **not** a future projection. It tracks your **past and present** financial history across recorded calendar dates (snapshots at quarter-ends, year-ends, or specific dates you record).
- **Net Worth Metrics:** Displays Gross Net Worth, Liquid Net Worth, Retirement Savings (net of estimated deferred income tax), Home Equity, and Total Debts.
- **Savings Goals (Sinking Funds):**
  - Create dedicated goals (such as an Emergency Reserve, Vacation Fund, or New Car Fund), assign target dollar amounts, and link specific accounts to each goal.
  - **CPI-U Auto-Inflation:** Toggle whether your target amount automatically adjusts over time based on historical U.S. Consumer Price Index (CPI-U) data.
  - **Goal Funding Status Modal:** Click on any goal or target amount to open the Goal Funding Status modal. This pop-up displays:
    - Base target and CPI-adjusted target.
    - Current total balance funded across all linked accounts.
    - Remaining dollar shortage (in red) or surplus (in green).
    - Percentage funded with a visual progress bar.
    - An itemized list of all accounts contributing to that goal and their current balances.

#### Tab 6: Portfolio Rebalance (Optional – Advanced Mode)

- **What It Does:** Analyzes your investment portfolio against your target asset allocation and provides a practical rebalancing plan using data from your latest balance sheet snapshot.
- **4-Step Process:**
  1. **Choose Accounts:** Select which investment accounts to include (debts and real estate equity are excluded automatically).
  2. **Set Target Allocation & Tolerance:** Define target percentages across asset classes (U.S. Equities, International Equities, Bonds, Cash, etc.) and set your relative tolerance corridor (e.g., ±10%). Choose your rebalancing strategy:
     - *Full Rebalance (Return to Target):* Generates trades to return all asset classes exactly to 100% of their target.
     - *Minimal-Trade (Return to Boundary):* Trades only the minimum amount necessary to bring out-of-range asset classes just back within your tolerance boundary.
     - *Smart Cash Flow (Optional):* Enter new cash you plan to deposit or withdraw; the tool deploys cash to underweight classes first, reducing the need to sell existing assets.
  3. **Enter Current Holdings:** Specify how each included account is currently divided across your asset classes (with convenient 1-click single-fund presets).
  4. **Diagnosis & Action Plan:** Review your portfolio drift, comparison charts, and a step-by-step checklist of recommended buy and sell trades.

---

### 2. Simulation Results Page

- **Monte Carlo Simulation:** Displays your overall success rate (or solved maximum spending in goal-seeking mode), ending wealth percentiles (nominal and inflation-adjusted), and legacy/estate totals. You can adjust key inputs on the left-hand panel and re-run simulations instantly.
- **Deterministic Projection:** Provides a year-by-year table of projected balances for every individual account using its expected average return.
- **Deterministic Cash Flow:** Displays a year-by-year cash flow ledger showing total income, living expenses, taxes paid, and exact withdrawals taken from each account type.
- **Charts:** Visualizes wealth trajectories over time, percentiles, and asset breakdowns. Click any chart to open a full-screen view or print it.
- **Stress Test:** Re-runs your plan under actual historical market crises (such as the 2000 Dot-Com crash, the 2008 Financial Crisis, or 1970s Stagflation) starting at your retirement date to test resilience.

---

### 3. Save / Load / Clear Data Page

- **Save Plan (.json):** Downloads a complete copy of your inputs, accounts, balance sheet, and rebalancing settings to a `.json` file on your computer.
- **Load Plan (.json):** Restores a previously saved plan file. Older plan files are migrated automatically.
- **Clear Data:** Resets all inputs back to standard sample defaults.

---

### How Taxes & Capital Gains Are Estimated

The calculator incorporates a realistic tax model to estimate how taxes impact your retirement cash flow:

1. **Federal & State Income Tax:**
   - Automatically applies progressive federal income tax brackets and standard deductions (including senior age additions).
   - Models the IRS formula for provisional income taxation of Social Security benefits (determining whether 0%, 50%, or up to 85% of your benefit is taxable).
   - Applies your state income tax rate, respecting your choice on whether Social Security is state-exempt.
2. **Taxable Account Taxes (During Accumulation & Retirement):**
   - In taxable brokerage accounts, taxes are incurred each year on investment distributions—even if you do not withdraw cash.
   - **Default Assumptions:** By default, the engine models a 2.0% dividend yield (85% qualified at lower capital gains rates, 15% ordinary), 0.5% annual capital gains distributions, and 0.0% interest yield for equity accounts.
   - **Cost Basis & Reinvestment:** The initial default cost basis is assumed to be 70% of the balance (meaning 30% is unrealized capital gain). Reinvested annual distributions and new contributions increase your cost basis dollar-for-dollar over time, preventing double taxation. When taxable funds are sold, capital gains tax is incurred only on the gain portion.
   - **Spousal Step-Up in Basis at First Death:** For married couples, federal tax rules (IRC § 1014) grant a cost basis step-up upon the first spouse's death:
     - *Common Law States (Default):* A 50% basis step-up is applied to joint taxable assets.
     - *Community Property States:* If selected, a 100% full basis step-up is applied, resetting the cost basis to full market value and eliminating prior unrealized gains.
3. **Other Taxes & Surcharges:**
   - Taxes or surcharges not calculated automatically by the standard brackets (such as the Net Investment Income Tax / NIIT or Medicare Part B/D IRMAA surcharges) can be scheduled on the Spending tab under **Other Taxes**.

---

### Order of Account Withdrawals (Cash Flow Waterfall)

Each modeled year, the app balances inflows and outflows in the following specific order:

1. **Required Minimum Distributions (RMDs) Taken First:** RMDs are calculated according to IRS rules (SECURE 2.0 Uniform Lifetime Table, beginning at age 73 or 75 depending on birth year) based on the prior year-end pre-tax balance and are taken first.
2. **Cash Inflows vs. Outflows:** Income streams (Social Security, pensions, annuities) and RMDs are pooled to cover living expenses, regular taxes, and other taxes.
3. **Handling Surpluses:** If total income and RMDs exceed spending and taxes, the extra cash is reinvested into your taxable accounts (increasing both balance and cost basis).
4. **Handling Shortfalls (Withdrawal Waterfall):** When income and RMDs do not fully cover spending and taxes, the deficit is withdrawn from accounts in an order designed to minimize taxes and early-withdrawal penalties:
   - **1. Taxable Accounts First:** Withdrawn first. The engine calculates the portion that is return of basis (tax-free) vs. realized capital gain (taxed at capital gains rates), grossing up the withdrawal to cover the resulting taxes.
   - **2. Pre-Tax Accounts (Penalty-Free):** If the account owner is age 59½ or older, additional withdrawals are drawn from Traditional IRAs/401(k)s, grossed up for ordinary income taxes.
   - **3. Roth Accounts:** Roth accounts are drawn next, completely tax-free.
   - **4. HSA Accounts:** HSAs designated for qualified medical expenses are drawn tax-free. Non-medical HSA withdrawals for owners age 65 or older are drawn as ordinary income with no penalty.
   - **5. Penalized Pre-Tax Accounts:** If the account owner is under age 59½, pre-tax withdrawals are deferred until after Roth and penalty-free accounts because they incur an additional 10% early-withdrawal penalty.
   - **6. Penalized Non-Medical HSA Accounts:** Non-medical HSA withdrawals under age 65 are drawn last due to the steep 20% early-withdrawal penalty.

---

### Helpful Tips

- **Start in Regular Mode:** Enter your realistic spending expectations to check your baseline success rate. If your success rate is far above or below your target, switch to **Maximum Spending Simulation** on the Results page to find the spending level that matches your preferred confidence level.
- **Simulation Runs for Accuracy:** Use 5,000 to 10,000 runs for final evaluations. Lower run counts can be used for quick interactive experiments.
- **Export Your Data:** Always download your plan (`.json`) from the Save / Load / Clear Data page before closing your browser or clearing data.
- **Check the Stress Test:** Before finalizing your plan, inspect the Historical Stress Test tab to see how your portfolio behaves during historical market crises.
