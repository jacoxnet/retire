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
2. **Accounts for Retirement:** Click **"+ Add Account"** to create an individual Account Card for each account you own:
   - Pre-Tax (Traditional 401(k), Traditional IRA, 403(b))
   - Roth (Roth IRA, Roth 401(k))
   - Taxable Brokerage or Savings
   - Health Savings Account (HSA)
   - Inherited Pre-Tax (Traditional IRA / 401(k))
   - Inherited Roth (Roth IRA / Roth 401(k))  
   Enter current balances, expected average return, and future contributions. *(Note: Contributions are legally prohibited to inherited accounts; you will instead configure their inherited withdrawal clock and IRS distribution rules.)*
3. **Spending:**
   - **Regular Retirement Spending:** Enter your baseline desired annual spending in retirement (in today’s dollars).
   - **Additional Spending:** Enter milestone or non-annual expenses (such as buying a car every 7 years, college tuition, or home renovations).  
     > **Important Note on Pre-Retirement Spending:** Additional Spending is intended for post-retirement expenses that do not occur every year. **It typically should NOT include pre-retirement spending items unless they are expected to be paid with funds drawn from your Accounts for Retirement.** Your everyday pre-retirement living expenses are assumed to be covered by your ongoing employment income.
4. **Social Security & Income Streams:** Specify claiming ages and benefit amounts for Social Security, plus any pensions, annuities, or rental income.

### 3. Run & Interpret Your Simulation
Click **Run Simulation** from any tab:
- **Regular Simulation:** Shows your **Success Rate**—the percentage of thousands of randomized market paths where your money lasted your entire lifetime.
- **Maximum Spending Simulation:** Solves for the **highest annual spending** your portfolio can sustain at your target confidence level (e.g., an 80% or 90% success rate).
- **Earliest Retirement Age Simulation:** Solves for the **earliest age and calendar year** you can retire at your target confidence level, including coordination strategies and an interactive trade-off explorer for married couples.
- **Projections & Cash Flows:** Review year-by-year account balances, income, living costs, taxes, and exact withdrawals from each account type.
- **Stress Test:** See how your plan would have survived historical crashes like the 2000 Dot-Com bust or the 2008 Financial Crisis.

### 4. Save Your Work
Your plan is saved automatically in this browser on this device (its local storage), so it is still here when you come back. It is not sent anywhere and is not available on other browsers or devices, and clearing your browser's site data removes it. To keep a copy or move it to another device, go to the **Save / Load / Clear Data** page and click **Save Plan (.json)** to download your plan file. You can load it again anytime.

---

## Part 2: Detailed Instructions

### What This App Does

- **Comprehensive Simulation Engine:** Uses three complementary methods to test your retirement plan:
  - **Monte Carlo Engine:** Simulates thousands of randomized market return sequences to measure how sequence-of-returns risk affects your portfolio.
  - **Deterministic Projections:** Models your year-by-year account growth and detailed cash flows using the average expected return you assign to each account.
  - **Historical Stress Testing:** Re-runs your retirement timeline by inserting the actual market conditions of historical financial crises (e.g., 2000 Dot-Com, 2008 Financial Crisis, 1970s Stagflation) starting at your retirement year.
- **Three Simulation Modes:**
  - **Regular Simulation:** You supply your desired annual spending; the app calculates your probability of success.
  - **Maximum Spending Simulation (Goal Seeking):** You specify a target success rate (e.g., 85%); the engine solves for the maximum sustainable annual spending.
  - **Earliest Retirement Age Simulation:** You specify a target success rate; the engine solves for the earliest age and calendar year you can retire. For married couples, multiple coordination strategies and an interactive trade-off frontier explorer are provided.
- **Data Privacy & Storage:** All calculations run in your browser; the site has no server, and your financial data never leaves your device. Use the **Save / Load / Clear Data** page to export your plan to a `.json` file for backup.

---

### Simple Mode vs. Advanced Mode

Toggle between modes at the top of the **Enter Data** page:

- **Advanced Mode (Default):** Designed for comprehensive financial planning. Includes:
  - Account volatility (standard deviation) customization (presets or user-specified).
  - Taxable account tax settings (dividend yields, qualified dividend splits, cost basis ratios, and community property state step-up elections).
  - The **Other Taxes** card for scheduling unmodeled taxes or surcharges (like IRMAA or NIIT).
  - The **Personal Balance Sheet** for tracking past and present net worth and sinking funds.
  - The **Portfolio Rebalancing** tool.
- **Simple Mode:** Hides advanced volatility inputs, detailed taxable account drawers, other taxes, balance sheet net worth tracking, and rebalancing. It provides a clean, 4-step wizard for fast modeling. (All account types, including Inherited IRAs, are supported in both modes.)

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

- **Account Cards:** Rather than typing into a spreadsheet table, you manage accounts through individual **Account Cards**. Click **"+ Add Account"** to create a card for each retirement or investment account you own. Every account must have a unique name.
- **Supported Account Types:**
  - **Pre-Tax (IRA / 401k / 403b):** Traditional tax-deferred accounts.
  - **Roth (Roth IRA / Roth 401k):** Tax-free growth and tax-free withdrawals for life.
  - **Taxable (Brokerage / Savings):** Standard non-retirement accounts.
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
  - *Inherited Account Categorization:* Inherited Pre-Tax accounts are grouped under Pre-Tax Retirement assets (and reduced by estimated deferred income tax), while Inherited Roth accounts are grouped under Roth Retirement assets.
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

- **Interactive Simulation Controls:** On the left-hand panel of the Results page, you can adjust spending, inflation, lifespans, asset return rates, and simulation mode, then instantly re-run simulations without returning to the data entry tabs.
- **Simulation Modes on the Results Page:**
  - **Regular Simulation:** Computes your **Success Rate**—the percentage of randomized market paths where your portfolio lasted your full lifetime.
  - **Maximum Spending Simulation (Goal Seeking):** Solves for the **highest sustainable annual spending** that achieves your specified target success rate (e.g., 85%).
  - **Earliest Retirement Age Simulation:** Solves for the **earliest age and calendar year** you can retire while sustaining your desired spending at your target confidence level.
    - *Single Planners:* Solves directly for your earliest retirement age.
    - *Married Couples:* Provides 4 coordination strategies:
      - **Retire Simultaneously (Same Year):** Solves for the earliest calendar year both spouses can retire together.
      - **Retire at the Same Age:** Solves for the earliest chronological age both spouses can retire.
      - **Solve for You:** Solves for your retirement age while keeping spouse's retirement age fixed.
      - **Solve for Spouse:** Solves for spouse's retirement age while keeping your retirement age fixed.
    - **Couple's Retirement Trade-Off Explorer:** An interactive slider and comparison table on the results card that lets couples explore the full trade-off frontier (e.g., seeing how working an additional year allows the spouse to retire earlier).
    - **Outcome Indicators:** Alerts you if you can *Retire Immediately!* (plan already satisfies target success today) or if the target rate is *Unreachable* even when working to maximum modeled ages.
- **Ending Wealth Percentiles (Nominal & Real):** Displays ending wealth statistics (Mean, Median, 25th percentile, 10th percentile, Max, Min) showing both **Nominal dollars** (future dollars) and **Real dollars** (purchasing power in today's dollars, adjusted for cumulative inflation) side-by-side.
- **Simulation Performance & Run Count:** Simulations default to **50,000 runs** for high statistical precision (adjustable up to 1,000,000 runs). Simulations execute in parallel across your computer's CPU cores, featuring a live progress bar and Cancel button. Results remain cached until you change inputs.
- **Deterministic Projection:** Provides a year-by-year table of projected balances for every individual account using its expected average return.
- **Deterministic Cash Flow:** Displays a year-by-year cash flow ledger showing total income, living expenses, taxes paid, and exact withdrawals taken from each account type. The ledger explicitly itemizes Inherited Pre-Tax RMDs (broken down by spouse when applicable), extra inherited withdrawals, regular pre-tax RMDs, and Inherited Roth distributions.
- **Charts:** Visualizes wealth trajectories over time, percentiles, and asset breakdowns. Click any chart to open a full-screen view or print it.
- **Stress Test:** Re-runs your plan under actual historical market crises (such as the 2000 Dot-Com crash, the 2008 Financial Crisis, or 1970s Stagflation) starting at your retirement date to test resilience. The "Regular Simulation" column is the same Monte Carlo run shown on the first tab, so the two can be compared directly.

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

- **Start in Regular Mode:** Enter your realistic spending expectations to check your baseline success rate.
- **Explore Alternative Modes:** Use **Maximum Spending Simulation** to find the spending level that matches your desired confidence level (e.g. 85%), or use **Earliest Retirement Age Simulation** to explore how soon you (and your spouse) can stop working.
- **Simulation Runs for Accuracy:** The engine defaults to 50,000 runs for high statistical precision. Lower run counts can be used for quick interactive experiments, and higher counts (up to 1,000,000) for exhaustive evaluations.
- **Export Your Data:** Download your plan (`.json`) from the Save / Load / Clear Data page before clearing your browser data or switching devices, and keep it as a backup.
- **Check the Stress Test:** Before finalizing your plan, inspect the Historical Stress Test tab to see how your portfolio behaves during historical market crises.
