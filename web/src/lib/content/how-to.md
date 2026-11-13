# How to Use the Retirement Calculator

> **Disclaimer:** This tool is made available for educational, informational, and entertainment purposes only. It is not intended to provide, and must not be relied upon for, investment, financial, tax, or legal advice. All projections, simulations, and calculations are hypothetical in nature, reflect simplified mathematical models, and are not guarantees of future performance. Actual outcomes will vary, potentially significantly. Always consult with a qualified financial advisor, Certified Financial Planner (CFP®), CPA, and legal professional before making any financial decisions. This tool is made available "as is," without any warranty of any kind, express or implied, regarding accuracy, completeness, fitness for a particular purpose, or anything else.

---

## Part 1: Basic Instructions (Quick Start)

The Retirement Calculator helps you answer one central question: **Will your savings and income support you throughout retirement without running out of money?**

### 1. Choose How to Enter Your Data
At the top of the **Enter Data** page, choose the method that best matches your comfort level:

- **Start Guided Walkthrough (Recommended for Beginners):** Click the **"Start Guided Walkthrough"** button in the banner at the top of the page. This opens a friendly, step-by-step interview wizard that asks plain-English questions across 6 stages (You & Household, Retirement Accounts, Spending, Income, Net Worth, and Review). You can skip questions at any time, jump between categories, and review your answers before launching your first simulation.
- **Direct Tab-by-Tab Data Entry:** If you prefer working directly with the forms, use the section tabs across the top:
  - **Simple Mode:** Click the mode toggle to hide advanced volatility settings, taxable account tax drawers, other taxes, and the optional balance sheet/rebalancing tabs for a streamlined form experience.
  - **Advanced Mode (Default):** Unlocks all tools, including account volatility controls, detailed tax-treatment drawers, custom tax surcharges (IRMAA/NIIT), historical net worth tracking on the Personal Balance Sheet, and Portfolio Rebalancing.

### 2. Enter Your Core Plan (Key Tabs)
1. **Demographics & Plan Details:** Enter your current age, planned retirement age, and expected lifespan (and spouse’s details if married). Set your tax filing status, state income tax rate, and expected inflation rate.
2. **Accounts for Retirement:** Click **"+ Add Account"** to create an individual Account Card for each account earmarked for retirement:
   - Pre-Tax (Traditional 401(k), Traditional IRA, 403(b))
   - Roth (Roth IRA, Roth 401(k))
   - Taxable Brokerage or Savings
   - Health Savings Account (HSA)
   - Inherited Pre-Tax (Traditional IRA / 401(k))
   - Inherited Roth (Roth IRA / Roth 401(k))  
   > **Important – Retirement Use Only:** Only enter accounts that are intended to fund your living expenses in retirement. Do **not** enter accounts you intend to spend prior to retirement (such as emergency savings, vacation funds, or short-term sinking funds); these belong on the **Personal Balance Sheet** tab. Also, do **not** enter defined-benefit pension plans here; enter those under **Social Security & Income Streams**.
3. **Spending:**
   - **Regular Retirement Spending:** Enter your baseline desired annual spending in retirement (in today’s dollars).
   - **Additional Spending:** Enter milestone or non-annual expenses (such as buying a car every 7 years, college tuition, or home renovations).  
     *(Note: Milestone spending before retirement should only be included if it will be drawn from your Accounts for Retirement; regular pre-retirement living expenses are assumed to be covered by ongoing job income.)*
4. **Social Security & Income Streams:** Specify claiming ages and benefit amounts for Social Security (or select "Not eligible"), plus any defined-benefit pensions, annuities, or rental income.

### 3. Run & Interpret Your Simulation
Use the green **Run Simulation** rocket button on the persistent **Plan Summary Bar** at the bottom of the screen:
- **Regular Simulation:** Computes your **Probability of Plan Success** displayed on an intuitive visual radial gauge, accompanied by a color-coded **Plan Assessment** (High Confidence, Solid Foundation, Moderate Risk, or Shortfall Risk) and ending wealth percentiles.
- **Maximum Spending Simulation (Goal Seeking):** Solves for the **highest annual spending** your portfolio can sustain at your target confidence level (e.g., an 80% or 90% success rate). Click **"Adopt into Plan"** to apply this spending directly to your plan and switch to a regular simulation.
- **Earliest Retirement Age Simulation:** Solves for the **earliest age and calendar year** you can retire at your target confidence level, including coordination strategies and an interactive trade-off explorer for married couples. Click **"Adopt into Plan"** to update your retirement age immediately.
- **Projections, Cash Flows & Charts (Dual Scenarios):** Review year-by-year account balances, income, living costs, taxes, and exact withdrawals from each account type. When running a solved simulation (Maximum Spending or Earliest Retirement), toggle between the **Solved Scenario** and the **Original Baseline Plan** to see how the solved numbers compare to your starting plan.
- **Stress Test:** See how your plan would have survived historical crashes like the 2000 Dot-Com bust or the 2008 Financial Crisis.
- **Print / Export Report:** Click the print button at the top of the Results page to generate a clean executive PDF report.

### 4. Save Your Work & Themes
- **Automatic Local Storage:** Your plan is saved automatically in this browser on this device (local storage), so your work remains when you return.
- **Save Plan (.json):** Because clearing browser data erases local storage, go to the **Save / Load / Clear Data** page and click **Save Plan (.json)** to download a complete backup copy or move it to another device.
- **Light / Dark Theme:** Toggle between light and dark modes anytime by clicking the moon/sun icon in the top navigation bar.

---

## Part 2: Detailed Instructions

### What This App Does

- **Comprehensive Simulation Engine:** Uses three complementary methods to test your retirement plan:
  - **Monte Carlo Engine:** Simulates thousands of randomized market return sequences to measure how sequence-of-returns risk affects your portfolio over your entire lifespan.
  - **Deterministic Projections:** Models your year-by-year account growth and detailed cash flows using the average expected return assigned to each account.
  - **Historical Stress Testing:** Re-runs your retirement timeline by inserting the actual market conditions of historical financial crises (e.g., 2000 Dot-Com, 2008 Financial Crisis, 1970s Stagflation) starting at your retirement year.
- **Three Simulation Modes:**
  - **Regular Simulation:** You supply your desired annual spending; the app calculates your probability of success and displays an assessment with ending wealth percentiles.
  - **Maximum Spending Simulation (Goal Seeking):** You specify a target success rate (e.g., 85%); the engine solves for the maximum sustainable annual spending.
  - **Earliest Retirement Age Simulation:** You specify a target success rate; the engine solves for the earliest age and calendar year you can retire. For married couples, multiple coordination strategies and an interactive trade-off frontier explorer are provided.
- **One-Click Plan Adoption ("Adopt into Plan"):** In both Maximum Spending and Earliest Retirement Age modes, an adoption card allows you to apply the solved value directly to your plan and switch back to Regular Simulation with a single click.
- **Dual-Scenario Analysis:** In solved modes, the Deterministic Projection, Deterministic Cash Flow, and Charts tabs feature a **Scenario Comparison Bar** allowing you to toggle between the **Solved Scenario** and your **Original Baseline Plan**.
- **Data Privacy & Storage:** All calculations run locally in your browser using fast background web workers; the site has no server, and your financial data never leaves your device. Use the **Save / Load / Clear Data** page to export your plan to a `.json` file for backup.

---

### Guided Walkthrough vs. Simple & Advanced Modes

The application offers two distinct ways to interact with your data:

#### The Guided Walkthrough (Interview Wizard)
Click **"Start Guided Walkthrough"** in the top banner of the Enter Data page. This opens a step-by-step interview organized into 6 stages:
1. **You & Household:** Names, current ages, target retirement ages, lifespans, marriage status, state tax rates, and life insurance policies.
2. **Retirement Accounts:** Workplace retirement plans (401(k), 403(b), TSP), IRAs (Traditional & Roth), taxable brokerage accounts, HSAs, and inherited accounts.
3. **Retirement Spending:** Spending start age, desired recurring annual spending, surviving spouse spending, and milestone / irregular expenses.
4. **Income & Social Security:** Social Security claiming ages and amounts (including an explicit "not eligible" option), plus defined-benefit pensions, annuities, and other income streams.
5. **Net Worth & Other Goals (Optional Gateway):** Allows tracking beyond retirement: emergency funds, non-retirement savings goals (sinking funds), daily cash/checking buffer, other non-retirement accounts, real estate/home equity, and debts.
6. **Review & Run:** Review skipped questions, inspect a concise summary of your plan, and launch the simulation immediately.

*Walkthrough features:*
- **Skip anytime:** Skip any question and return to it later via the **Skipped Questions** drawer.
- **Jump by stage:** Click any stage pill in the progress bar to navigate directly to that section.
- **Edit on the fly:** Edit any previously entered item without losing other progress.

#### Simple Mode vs. Advanced Mode (Direct Tab Entry)
When working directly with the page tabs, you can toggle between two view modes:
- **Simple Mode:** Hides advanced volatility inputs, detailed taxable account tax drawers, the "Other Taxes" card, and the optional **Balance Sheet** and **Rebalance** tabs. It presents a clean, focused form ideal for rapid modeling.
- **Advanced Mode (Default):** Reveals all planning capabilities:
  - Account volatility (standard deviation) customization (presets or custom percentages).
  - Taxable account tax settings (dividend yields, qualified dividend splits, cost basis ratios, and community property state step-up elections).
  - The **Other Taxes** card for scheduling unmodeled taxes or surcharges (like IRMAA or NIIT).
  - The **Personal Balance Sheet** tab for tracking past and present net worth, sinking funds, and non-retirement accounts.
  - The **Portfolio Rebalancing** tab for asset allocation analysis and trade planning.

---

### 1. Enter Data Page

#### Interface Controls: Sticky Plan Summary Bar & Tab Badges
- **Sticky Plan Summary & Run Bar:** Pinned to the bottom of the screen on the Enter Data page. It displays live summary metric chips for **Total Assets for Retirement** and **Desired Recurring Spending** and the primary green **Run Simulation** button. If duplicate account names exist, the button is disabled and an alert guides you to correct them.
- **Tab Badges:** Each tab header displays real-time status indicators (e.g., `Age 60→65`, `3 accts • $1.5M`, `$60k/yr`, `2 streams`) with green completion checks or warning badges to help you verify completeness at a glance.

#### Tab 1: Demographics & Plan Details

- **Timeline:** Enter your current age, planned retirement age, and age at death. If married, turn on the marriage switch to enter details for your spouse.
- **Life Insurance & Survivorship:** Enter lump-sum death benefits for term or permanent policies. If married, proceeds paid upon the first death are deposited into taxable savings in the year after death to help support ongoing retirement expenses. If there is no surviving spouse, proceeds flow to your estate/heirs and are reflected in ending wealth percentiles.
- **Basic Plan Details:**
  - **Tax Filing Status:** Single, Married Filing Jointly, or Head of Household.
  - **State Income Tax Rate:** Enter your state's estimated flat or effective tax rate (0% for states without income tax).
  - **Exempt Social Security from State Tax:** Check this box if your state does not tax Social Security benefits (most states exempt them).
  - **Current Year & Inflation:** Set the current calendar year and expected annual inflation rate.

#### Tab 2: Accounts for Retirement

- **Account Cards:** Manage accounts through individual **Account Cards**. Click **"+ Add Account"** to create a card for each retirement or investment account you own. Every account must have a unique name.
- **Retirement Use Only (Important Rule):** Only include accounts earmarked to fund living expenses in retirement.
  - Do **not** include emergency funds, short-term savings, or accounts you intend to spend prior to retirement. Those should be tracked on the **Balance Sheet** tab.
  - Do **not** enter defined-benefit pension plans or fixed commercial income annuities here; enter those under **Tab 4: Social Security & Income Streams**.
  - Accounts not held for retirement (e.g., personal non-retirement brokerage accounts, trust funds) belong on the **Balance Sheet** under **Other Accounts**.
- **Supported Account Types:**
  - **Pre-Tax (IRA / 401k / 403b):** Traditional tax-deferred accounts.
  - **Roth (Roth IRA / Roth 401k):** Tax-free growth and tax-free withdrawals for life.
  - **Taxable (Brokerage / Savings):** Standard non-retirement investment accounts earmarked for retirement.
  - **Health Savings Account (HSA):** Triple-tax-advantaged medical savings accounts.
  - **Inherited Pre-Tax (Traditional / 401k / 403b):** Tax-deferred accounts inherited from another individual.
  - **Inherited Roth (Roth IRA / Roth 401k / 403b):** Roth accounts inherited from another individual.
- **Standard Account Card Fields:**
  - **Owner:** You or your spouse.
  - **Present Balance:** Current market value.
  - **Future Contributions:** Dollar amount, frequency (Annual, Monthly, One-Time), contribution start age, contribution end age (or "at retirement"), and inflation adjustment toggle.
- **Inherited Accounts (Inherited Pre-Tax & Inherited Roth):**
  - **Contributions Prohibited:** Under IRS rules, contributions cannot be made to inherited accounts. Contribution fields are replaced with inherited account parameters.
  - **Year of Death / Inherited:** Enter the year the original account owner passed away (or when the account was inherited). The card displays a dynamic clock indicating the number of years remaining on your distribution window.
  - **Beneficiary's RMD Rule:**
    - *10-Year Rule (Standard post-2019):* Established by the SECURE Act for most non-spouse individual designated beneficiaries inheriting after December 31, 2019. The account must be completely emptied by December 31 of the 10th year following the owner's death.
    - *Lifetime Stretch (Pre-2020 / Eligible Designated Beneficiary - EDB):* Select if the original owner died before 2020, or if the beneficiary is an Eligible Designated Beneficiary who is disabled or chronically ill, or not more than 10 years younger than the decedent. Annual RMDs are calculated across the beneficiary's single life expectancy (IRS Single Life Table I) using the non-recalculation method (subtracting 1.0 from the initial factor each subsequent year).
    - *Minor Child of Decedent (EDB):* Annual Single Life Table RMDs (non-recalculation method) until the child turns 21. The 10-year rule then applies, with annual RMDs continuing, and the account must be emptied by the end of the year the child turns 31.
    - *Surviving Spouse (EDB):* For a spouse who is the sole beneficiary and keeps the account as an inherited IRA. RMDs use the spouse's Single Life Table factor, recalculated at the spouse's age each year. If the decedent died before their RBD, enter the decedent's birth year: RMDs then need not start until the year the decedent would have reached RMD age (73 or 75), and the spouse may elect the Uniform Lifetime Table instead (the Single Life Table is used below age 72, which the Uniform table does not cover). A spouse may instead roll the account into their own IRA; enter a rolled-over account as a regular Pre-Tax or Roth account.
    - *5-Year Rule (Estate / Non-Designated):* Applies to non-designated beneficiaries (such as an estate, charity, or non-qualifying trust) when the owner died before their Required Beginning Date, or where specified by plan documents. The account must be fully emptied within 5 years.
  - **Decedent Reached Required Beginning Date (RBD) (Inherited Pre-Tax Only):**
    - Under IRS regulations, if the decedent reached their RBD prior to death, annual RMDs are mandatory during years 1–9 of the 10-year rule based on the beneficiary's single life expectancy, with the remaining balance distributed in Year 10.
    - If the decedent died *before* reaching their RBD, annual RMDs are *not* required during years 1–9; only the full liquidation by Year 10 is required.
    - For *Inherited Roth IRAs*, original Roth owners are treated as having died before RBD, so no annual RMDs are required during years 1–9 under the 10-year rule regardless of decedent age.
  - **10-Year Distribution Strategy:**
    - *Minimum Required Only (Balloon in Year 10):* Takes only required minimum distributions (if any) during years 1–9 and liquidates 100% of the remaining balance in Year 10. For pre-tax accounts, this delays taxable income but can create a significant tax spike in Year 10.
    - *Equalized / Ratable (1/Nth):* Distributes roughly equal proportions (1/10th, 1/9th, ..., 1/2, 1/1) of the remaining balance each year to smooth withdrawals and mitigate jumping into higher income tax brackets.
  - **Each Account Keeps Its Own Rules:** Several inherited accounts are modeled separately, each with its own death year, rule and closing deadline.
  - **Successor Beneficiary:** If the beneficiary dies first in a married plan, the surviving spouse inherits the account as successor beneficiary. Any annual RMDs continue on the original schedule, and the account must be emptied by the original deadline or by the end of the 10th year after the beneficiary's death, whichever comes first.
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
  - **Important Rule for Pre-Retirement Items:** Additional Spending is intended for post-retirement expenses that do not occur every year. **It typically should NOT include pre-retirement spending items unless they are expected to be paid with funds drawn from your Accounts for Retirement.** Everyday pre-retirement expenses should be excluded, as they are presumed to be paid out of ongoing job earnings.
- **Other Taxes (Advanced Mode):**
  - Enter recurring or one-time taxes and surcharges that the basic tax model does not compute automatically, such as Medicare IRMAA surcharges, the Net Investment Income Tax (NIIT), or local taxes.
  - Specify the amount, frequency, start age, end age, and inflation rule.

#### Tab 4: Social Security & Income Streams

- **Social Security:** For both you and your spouse:
  - Indicate whether you are currently receiving benefits.
  - If not receiving, specify whether you will become entitled in the future or are **not eligible** for benefits.
  - If entitled, set your planned claiming age (62–70), initial benefit amount, and payment frequency (Monthly or Annual).
- **Other Income Streams & Benefits:** Enter non-portfolio income received after retirement spending begins:
  - Defined-benefit pensions, commercial annuities, rental income, consulting work, or a spouse's continuing job income.
  - Configure payment amount, frequency, start age, end age, and survivor continuation percentage.
  - **Adjustment Schedule:** Customize how payments change over time (e.g., inflation-adjusted via COLA or fixed annual percentage adjustments).

#### Tab 5: Personal Balance Sheet (Optional – Advanced Mode)

- **Historical Net Worth Tracker:** The Personal Balance Sheet is **not** a future projection. It tracks your **past and present** financial history across recorded calendar dates (snapshots at quarter-ends, year-ends, or specific dates you record).
- **Accounts Not Held for Retirement ("Other Accounts"):**
  - Use the **Other Accounts** category to track assets that are not intended to fund retirement living expenses and are not dedicated to specific savings goals (such as non-retirement brokerages or personal trust funds).
  - These accounts are included in your Gross and Liquid Net Worth, but are **excluded from retirement assets** modeled in the simulation engine.
- **Net Worth Metrics:** Displays a clear hierarchy of financial strength:
  - **Gross Net Worth:** All assets minus total debts.
  - **Liquid Net Worth:** Cash, taxable brokerage, and other non-retirement accounts (excluding real estate equity).
  - **Liquid Net Worth (Net of Deferred Tax & Sinking Funds):** Liquid assets reduced by estimated deferred income tax on pre-tax balances and earmarked savings goal funds.
  - **Retirement Savings (Net of Deferred Tax):** Value of dedicated retirement accounts only, net of estimated deferred income tax.
  - **Home Equity & Total Debts.**
- **Savings Goals (Sinking Funds) & Emergency Funds:**
  - Create dedicated goals (Emergency Reserve, Vacation Fund, New Vehicle), assign target dollar amounts, and link multiple accounts to each goal.
  - **CPI-U Auto-Inflation:** Toggle whether your target amount automatically adjusts over time based on historical U.S. Consumer Price Index (CPI-U) data.
  - **Goal Funding Status Modal:** Click on any goal or target amount to inspect funding percentage, dollar shortage/surplus, and an itemized breakdown of contributing accounts.

#### Tab 6: Portfolio Rebalance (Optional – Advanced Mode)

- **What It Does:** Analyzes your actual investment portfolio against your target asset allocation and generates a practical rebalancing trade plan using data from your latest balance sheet snapshot.
- **4-Step Process:**
  1. **Choose Accounts:** Select which investment accounts to include (debts and real estate equity are excluded automatically).
  2. **Set Target Allocation & Tolerance:**
     - **Custom Investment Classes:** Click **"+Add Investment Class"** to add custom asset classes (e.g. Gold, Collectibles, Large Cap Value, REITs, Crypto) with custom names, target percentages, and color tags. Existing classes can be edited, re-weighted, or deleted.
     - **Corridor & Tolerance:** Set your relative tolerance corridor (e.g., ±10%).
     - **Rebalancing Strategy:** Choose between *Full Rebalance (Return to 100% Target)* or *Minimal-Trade (Return to Boundary)*.
     - **Smart Cash Flow (Optional):** Enter cash you plan to deposit or withdraw; the engine prioritizes deploying cash to underweight classes first, reducing required sales.
  3. **Enter Current Holdings:** Specify how each included account is currently divided across your asset classes (with convenient 1-click single-fund presets).
  4. **Diagnosis & Action Plan:** Review portfolio drift, comparison charts, and a step-by-step checklist of recommended buy and sell trades.

---

### 2. Simulation Results Page

- **Quick Subpage Navigation:** When in Advanced Mode, the header of the Results page includes direct tabs for **Balance Sheet (optional)** and **Rebalance (optional)**, letting you navigate without having to return to Enter Data.
- **Print / Export Executive Report:** Click **"Print / Export Report"** in the top action bar to view a publication-ready executive summary (clean header, key result badges, high-resolution charts, and tabular breakdowns) formatted for printing or PDF export.
- **Interactive Simulation Controls & Stale Inputs Alert:** 
  - On the left panel, adjust spending, inflation, lifespans, asset return rates, and simulation mode, then instantly re-run.
  - If inputs are modified, a yellow **Inputs Modified** banner notifies you that displayed results reflect previous parameters and provides an **"Update & Re-Run Now"** button.
- **Monte Carlo Results Card:**
  - **Probability of Plan Success Radial Gauge:** An intuitive visual gauge displaying your success rate from 0% to 100%.
  - **Dynamic Plan Assessment:** Categorizes your plan into four color-coded tiers with strategic commentary:
    - *High Confidence Plan* (≥ 85%, Green): Your retirement portfolio is well-funded to sustain planned spending across diverse market conditions.
    - *Solid Foundation* (75%–84%, Blue): Reliable foundation; modest cushion adjustments could further strengthen it.
    - *Moderate Risk* (60%–74%, Amber): Experiences shortfalls in severe downturns; minor spending or timing adjustments recommended.
    - *Shortfall Risk* (< 60%, Red): High probability of outliving assets under historical market scenarios; revision recommended.
  - **"Adopt into Plan" Action:** When running **Maximum Spending** or **Earliest Retirement Age**, a dedicated card appears on the results panel (e.g., *"Adopt Solved Spending ($X/yr) into the Plan?"*). Clicking **"Adopt into Plan"** saves the solved value directly into your plan and automatically switches back to Regular Simulation, immediately re-running with the updated baseline.
  - **Earliest Retirement Age Coordination:** Solves for single individuals or couples using 4 coordination strategies (*Retire Simultaneously*, *Retire at Same Age*, *Solve for You*, *Solve for Spouse*). Couples can explore the trade-off frontier using an interactive trade-off slider.
  - **Ending Wealth Percentiles:** Displays Mean, Median, 25th, 10th, Max, and Min ending wealth showing both **Nominal dollars** and **Real dollars** (purchasing power in today's dollars) side-by-side.
- **Scenario Comparison (Solved Scenario vs. Original Baseline):** When in a solved mode, a **Scenario Comparison Bar** appears above the **Deterministic Projection**, **Deterministic Cash Flow**, and **Charts** tabs. Toggle between:
  - **Solved Scenario:** Displays account balances, cash flows, and growth curves resulting from the solved maximum spending or earliest retirement age.
  - **Original Baseline Plan:** Displays balances and cash flows under your original input spending or retirement age.
- **Deterministic Projection:** Year-by-year table of projected balances for every individual account.
- **Deterministic Cash Flow:** Year-by-year cash flow ledger showing total income, living expenses, taxes paid, and exact withdrawals taken from each account type (itemizing inherited pre-tax RMDs, inherited Roth distributions, and regular RMDs).
- **Charts:** Visualizes wealth trajectories over time, percentiles, and asset breakdowns. Click any chart to open a full-screen view or print it.
- **Historical Stress Test:** Re-runs your plan under actual historical crises (2000 Dot-Com crash, 2008 Financial Crisis, 1970s Stagflation) starting at your retirement date. The stress test automatically incorporates the active simulation mode and solved parameters.

---

### 3. Save / Load / Clear Data Page

- **Save Plan (.json):** Downloads a complete copy of your inputs, accounts, balance sheet, and rebalancing settings to a `.json` file on your computer.
- **Load Plan (.json):** Restores a previously saved plan file. Older plan files are migrated automatically.
- **Clear Data:** Resets all inputs back to standard sample defaults after confirmation.

---

### How Taxes & Capital Gains Are Estimated

The calculator incorporates a realistic tax model to estimate how taxes impact your retirement cash flow:

1. **Federal & State Income Tax:**
   - Automatically applies progressive federal income tax brackets and standard deductions (including senior age additions).
   - Models the IRS formula for provisional income taxation of Social Security benefits (determining whether 0%, 50%, or up to 85% of your benefit is taxable).
   - Applies your state income tax rate, respecting your choice on whether Social Security is state-exempt.
   - **Inherited Accounts Tax Treatment:**
     - Distributions from **Inherited Pre-Tax accounts** are treated as ordinary income and subject to standard federal and state tax brackets.
     - Distributions from **Inherited Roth accounts** are 100% tax-free.
     - **Penalty Exemption:** Under IRC § 72(t)(2)(A)(ii), withdrawals from inherited retirement accounts are exempt from the 10% early withdrawal penalty, regardless of the beneficiary's age.
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

1. **Required Minimum Distributions (RMDs) and Inherited Distributions Taken First:** RMDs are calculated according to IRS rules (SECURE 2.0 Uniform Lifetime Table, beginning at age 73 or 75 depending on birth year) based on the prior year-end pre-tax balance. Inherited Pre-Tax RMDs (based on the IRS Single Life Expectancy Table non-recalculation method) and scheduled Inherited Roth distributions are also taken first.
2. **Cash Inflows vs. Outflows:** Income streams (Social Security, pensions, annuities), regular RMDs, and inherited IRA distributions are pooled to cover living expenses, regular taxes, and other taxes.
3. **Handling Surpluses:** If total income, RMDs, and inherited distributions exceed spending and taxes, the extra cash is reinvested into your taxable accounts (increasing both balance and cost basis). Inherited IRAs cannot accept contributions.
4. **Handling Shortfalls (Withdrawal Waterfall):** When income and mandatory distributions do not fully cover spending and taxes, the deficit is withdrawn from accounts in an order designed to minimize taxes, honor account expiration rules, and avoid early-withdrawal penalties:
   - **1. Taxable Accounts First:** Withdrawn first. The engine calculates the portion that is return of basis (tax-free) vs. realized capital gain (taxed at capital gains rates), grossing up the withdrawal to cover the resulting taxes.
   - **2. Inherited Pre-Tax IRAs:** Withdrawn next. Under IRC § 72(t)(2)(A)(ii), inherited accounts are exempt from the 10% early withdrawal penalty regardless of beneficiary age. Withdrawing from inherited pre-tax IRAs before your own pre-tax accounts helps empty the account within the statutory 10-year rule while preserving your own pre-tax tax-deferred compounding.
   - **3. Pre-Tax Accounts (Penalty-Free):** If the account owner is age 59½ or older, additional withdrawals are drawn from Traditional IRAs/401(k)s, grossed up for ordinary income taxes.
   - **4. Inherited Roth IRAs:** Inherited Roth withdrawals are tax-free and drawn before own Roth IRAs, drawing down the 10-year expiring tax shelter to preserve lifetime tax exemption in your own Roth accounts.
   - **5. Own Roth Accounts:** Lifetime Roth accounts are drawn next, completely tax-free.
   - **6. HSA Accounts:** HSAs designated for qualified medical expenses are drawn tax-free. Non-medical HSA withdrawals for owners age 65 or older are drawn as ordinary income with no penalty.
   - **7. Penalized Pre-Tax Accounts:** If the account owner is under age 59½, pre-tax withdrawals from own accounts are deferred until after Roth and penalty-free accounts because they incur an additional 10% early-withdrawal penalty.
   - **8. Penalized Non-Medical HSA Accounts:** Non-medical HSA withdrawals under age 65 are drawn last due to the steep 20% early-withdrawal penalty.

---

### Helpful Tips

- **Start with the Guided Walkthrough:** If you are new to the calculator, click **"Start Guided Walkthrough"** at the top of the Enter Data page for an approachable 5–10 minute guided setup.
- **Check Your Baseline in Regular Mode:** Enter your realistic spending expectations to check your initial Probability of Plan Success and inspect your Plan Assessment tier.
- **Explore Alternative Modes:** Use **Maximum Spending Simulation** to find the spending level that matches your desired confidence level (e.g. 85%), or use **Earliest Retirement Age Simulation** to explore how soon you (and your spouse) can stop working. Click **"Adopt into Plan"** to lock in those results.
- **Inspect Solved vs. Baseline Projections:** When using solved modes, toggle between **Solved Scenario** and **Original Baseline Plan** on the Projection, Cash Flow, and Charts tabs to see the tangible impact of the solved changes.
- **Simulation Runs for Accuracy:** The engine defaults to 50,000 runs for high statistical precision. Lower run counts can be used for quick interactive experiments, and higher counts (up to 1,000,000) for exhaustive evaluations.
- **Keep Retirement Accounts Separate:** Only put retirement accounts on Tab 2. Track emergency funds, sinking funds, and other non-retirement assets on Tab 5 (Personal Balance Sheet).
- **Export Your Data:** Download your plan (`.json`) from the Save / Load / Clear Data page before clearing your browser data or switching devices, and keep it as a backup.
- **Check the Stress Test:** Before finalizing your plan, inspect the Historical Stress Test tab to see how your portfolio behaves during historical market crises.
