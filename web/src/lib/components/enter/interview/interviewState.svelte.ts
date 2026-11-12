// Reactive state and navigation for the guided retirement interview modal.
import type { Plan } from '../../../plan/types';

export interface QuestionMeta {
  id: string;
  stage: number;
  title: string;
  defaultDescription: string;
}

export const ALL_QUESTIONS: QuestionMeta[] = [
  // Stage 1
  { id: 'user_name_age', stage: 1, title: 'Your Name & Present Age', defaultDescription: 'Name: You, Present Age: 60' },
  { id: 'user_ret_age', stage: 1, title: 'Your Target Retirement Age', defaultDescription: 'Retirement Age: 65' },
  { id: 'user_death_age', stage: 1, title: 'Planning Horizon / Lifespan', defaultDescription: 'Plan through age 95' },
  { id: 'is_married', stage: 1, title: 'Planning Solo or as a Couple', defaultDescription: 'Single / Individual' },
  { id: 'spouse_name_age', stage: 1, title: "Spouse's Name & Age", defaultDescription: 'Name: Spouse, Present Age: 60' },
  { id: 'spouse_ret_death', stage: 1, title: "Spouse's Retirement Age & Lifespan", defaultDescription: 'Retire at 65, Plan through 95' },
  { id: 'state_tax_rate', stage: 1, title: 'State Income Tax Rate', defaultDescription: '0% State Tax, SS Exempt' },
  { id: 'life_insurance', stage: 1, title: 'Life Insurance Protection', defaultDescription: 'No life insurance policies' },

  // Stage 2
  { id: 'accounts_workplace', stage: 2, title: 'Workplace Retirement Plans (401k/403b/TSP)', defaultDescription: 'No workplace accounts added' },
  { id: 'accounts_ira', stage: 2, title: 'Individual Retirement Accounts (IRAs)', defaultDescription: 'No IRAs added' },
  { id: 'accounts_taxable', stage: 2, title: 'Taxable Investment & Brokerage Accounts', defaultDescription: 'No taxable accounts added' },
  { id: 'accounts_hsa', stage: 2, title: 'Health Savings Accounts (HSAs)', defaultDescription: 'No HSA added' },
  { id: 'accounts_inherited', stage: 2, title: 'Inherited Retirement Accounts', defaultDescription: 'No inherited accounts added' },

  // Stage 3
  { id: 'spending_start', stage: 3, title: 'Retirement Spending Start Age', defaultDescription: 'Starts at retirement' },
  { id: 'spending_desired', stage: 3, title: 'Desired Annual Retirement Spending', defaultDescription: '$60,000 / year (inflation-adjusted)' },
  { id: 'spending_survivor', stage: 3, title: 'Surviving Spouse Living Expenses', defaultDescription: '$50,000 / year' },
  { id: 'spending_milestones', stage: 3, title: 'Milestone & Irregular Expenses', defaultDescription: 'No milestone expenses added' },

  // Stage 4
  { id: 'income_user_ss', stage: 4, title: 'Your Social Security', defaultDescription: 'Claim at 67, $2,000 / month' },
  { id: 'income_spouse_ss', stage: 4, title: "Spouse's Social Security", defaultDescription: 'Claim at 67, $1,500 / month' },
  { id: 'income_streams', stage: 4, title: 'Pensions, Annuities & Other Income', defaultDescription: 'No extra income streams added' },

  // Stage 5
  { id: 'gateway_advanced', stage: 5, title: 'Accounts Beyond Retirement', defaultDescription: 'Keep plan focused on retirement readiness' },
  { id: 'nw_emergency', stage: 5, title: 'Emergency Fund', defaultDescription: 'No emergency fund recorded' },
  { id: 'nw_goals', stage: 5, title: 'Non-Retirement Savings Goals', defaultDescription: 'No goal sinking funds recorded' },
  { id: 'nw_cash', stage: 5, title: 'Daily Cash & Checking Buffer', defaultDescription: '$0 cash buffer' },
  { id: 'nw_other', stage: 5, title: 'Other Accounts', defaultDescription: 'No other accounts recorded' },
  { id: 'nw_real_estate', stage: 5, title: 'Real Estate & Home Equity', defaultDescription: 'No real estate recorded' },
  { id: 'nw_debts', stage: 5, title: 'Loans & Other Debts', defaultDescription: 'No loans/debts recorded' },

  // Stage 6
  { id: 'review_skipped', stage: 6, title: 'Review Skipped Questions', defaultDescription: 'Review and confirm' },
  { id: 'review_summary', stage: 6, title: 'Plan Summary & Launch', defaultDescription: 'Ready to calculate' },
];

export const STAGES = [
  { number: 1, name: 'You & Household', short: 'Household' },
  { number: 2, name: 'Retirement Accounts', short: 'Accounts' },
  { number: 3, name: 'Retirement Spending', short: 'Spending' },
  { number: 4, name: 'Income & Social Security', short: 'Income' },
  { number: 5, name: 'Net Worth & Other Goals', short: 'Net Worth' },
  { number: 6, name: 'Review & Run', short: 'Review' },
];

const STAGE_BY_ID = new Map(ALL_QUESTIONS.map((q) => [q.id, q.stage]));

export class InterviewState {
  currentQuestionId = $state<string>('user_name_age');
  optedInStage5 = $state<boolean>(false);
  skippedQuestions = $state<string[]>([]);
  answeredQuestions = $state<string[]>([]);
  completed = $state<boolean>(false);

  constructor(plan?: Plan) {
    if (plan?.balance_sheet) {
      const bs = plan.balance_sheet as any;
      const period = bs.current_period || (Array.isArray(bs.periods) ? bs.periods[bs.periods.length - 1] : undefined);
      const emgTarget = parseFloat(bs.categories?.emergency?.target_amount ?? bs.emergency_goal_amount ?? 0);
      const emgAccounts = bs.categories?.emergency?.accounts ?? [];
      const emgBal = emgAccounts.reduce(
        (sum: number, a: any) => {
          const val = (period && a.values?.[period] !== undefined) ? a.values[period] : (a.values ? Object.values(a.values)[0] : 0);
          return sum + (parseFloat(val) || 0);
        },
        0
      );
      const goals = bs.categories?.goals?.goal_groups ?? [];
      const hasGoals = goals.some(
        (g: any) =>
          g.is_configured === true ||
          parseFloat(g.target_amount || 0) > 0 ||
          (g.accounts ?? []).some((a: any) => {
            const val = (period && a.values?.[period] !== undefined) ? a.values[period] : (a.values ? Object.values(a.values)[0] : 0);
            return (parseFloat(val) || 0) > 0;
          }) ||
          g.target_auto_inflate === true
      );
      const debts = Array.isArray(bs.categories?.debts) ? bs.categories.debts : [];
      const hasDebts = debts.some((d: any) => {
        const val = (period && d.values?.[period] !== undefined) ? d.values[period] : (d.values ? Object.values(d.values)[0] : 0);
        return (parseFloat(val) || 0) > 0;
      });
      const otherAccounts = bs.categories?.other?.accounts ?? [];
      const hasOther = otherAccounts.some((a: any) => {
        const val = (period && a.values?.[period] !== undefined) ? a.values[period] : (a.values ? Object.values(a.values)[0] : 0);
        return (parseFloat(val) || 0) > 0;
      });
      if (emgTarget > 0 || emgBal > 0 || hasGoals || hasDebts || hasOther) {
        this.optedInStage5 = true;
      }
    }
  }

  /** Active questions given the plan's marital status and Stage 5 opt-in. */
  activeQuestionList(plan: Plan): string[] {
    const isMarried = !!plan.is_married;
    return ALL_QUESTIONS.filter((q) => {
      // Spouse questions only if married
      if ((q.id === 'spouse_name_age' || q.id === 'spouse_ret_death' || q.id === 'spending_survivor' || q.id === 'income_spouse_ss') && !isMarried) {
        return false;
      }
      // Stage 5 sub-questions only if user opted in at gateway
      if (['nw_emergency', 'nw_goals', 'nw_cash', 'nw_other', 'nw_real_estate', 'nw_debts'].includes(q.id) && !this.optedInStage5) {
        return false;
      }
      return true;
    }).map((q) => q.id);
  }

  currentStage(plan: Plan): number {
    const q = ALL_QUESTIONS.find((item) => item.id === this.currentQuestionId);
    return q?.stage ?? 1;
  }

  isSkipped(questionId: string): boolean {
    return this.skippedQuestions.includes(questionId);
  }

  markSkipped(questionId: string): void {
    if (!this.skippedQuestions.includes(questionId)) {
      this.skippedQuestions.push(questionId);
    }
    this.answeredQuestions = this.answeredQuestions.filter((id) => id !== questionId);
  }

  clearSkipped(questionId: string): void {
    this.skippedQuestions = this.skippedQuestions.filter((id) => id !== questionId);
  }

  isAnswered(questionId: string): boolean {
    return this.answeredQuestions.includes(questionId);
  }

  /** Record that the user confirmed this question (Continue), removing it from the skipped list. */
  markAnswered(questionId: string): void {
    this.clearSkipped(questionId);
    if (!this.answeredQuestions.includes(questionId)) {
      this.answeredQuestions.push(questionId);
    }
  }

  /** True when every active question in the stage has been answered. */
  isStageAnswered(stageNum: number, plan: Plan): boolean {
    const ids = this.activeQuestionList(plan).filter((id) => STAGE_BY_ID.get(id) === stageNum);
    return ids.length > 0 && ids.every((id) => this.isAnswered(id));
  }

  goTo(questionId: string): void {
    this.currentQuestionId = questionId;
  }

  /**
   * Jump to the first question of a stage. Jumping forward marks every
   * unanswered question passed over (including the current one) as skipped
   * and applies its safe default, so it shows up in the review list.
   */
  jumpToStage(stageNum: number, plan: Plan): void {
    const list = this.activeQuestionList(plan);
    const targetIdx = list.findIndex((id) => STAGE_BY_ID.get(id) === stageNum);
    if (targetIdx < 0) return;
    const curIdx = list.indexOf(this.currentQuestionId);
    if (curIdx >= 0) {
      for (let i = curIdx; i < targetIdx; i++) {
        const id = list[i];
        if (!this.isAnswered(id)) {
          this.markSkipped(id);
          this.applySafeDefault(id, plan);
        }
      }
    }
    this.currentQuestionId = list[targetIdx];
  }

  next(plan: Plan): void {
    const list = this.activeQuestionList(plan);
    const idx = list.indexOf(this.currentQuestionId);
    if (idx >= 0 && idx < list.length - 1) {
      this.currentQuestionId = list[idx + 1];
    } else {
      this.completed = true;
    }
  }

  prev(plan: Plan): void {
    const list = this.activeQuestionList(plan);
    const idx = list.indexOf(this.currentQuestionId);
    if (idx > 0) {
      this.currentQuestionId = list[idx - 1];
    }
  }

  applyDefaultAndSkip(questionId: string, plan: Plan): void {
    this.markSkipped(questionId);
    this.applySafeDefault(questionId, plan);
    this.next(plan);
  }

  applySafeDefault(questionId: string, plan: Plan): void {
    switch (questionId) {
      case 'user_name_age':
        plan.user_name ||= 'You';
        plan.user_age ??= 60;
        break;
      case 'user_ret_age':
        plan.user_retirement_age ??= 65;
        break;
      case 'user_death_age':
        plan.user_age_death ??= 95;
        break;
      case 'is_married':
        plan.is_married ??= false;
        plan.filing_status ||= 'single';
        break;
      case 'spouse_name_age':
        plan.spouse_name ||= 'Spouse';
        plan.spouse_age ??= 60;
        break;
      case 'spouse_ret_death':
        plan.spouse_retirement_age ??= 65;
        plan.spouse_age_death ??= 95;
        break;
      case 'state_tax_rate':
        plan.state_tax_rate ??= 0.0;
        plan.state_ss_exempt ??= true;
        break;
      case 'life_insurance':
        plan.user_life_insurance_amount ??= 0;
        plan.spouse_life_insurance_amount ??= 0;
        plan.life_insurance_policies ??= [];
        break;
      case 'spending_start':
        plan.begin_spending_age_type ||= 'retirement';
        break;
      case 'spending_desired':
        plan.desired_spending ??= 60000;
        plan.adjust_spending_inflation = plan.adjust_spending_inflation ?? true;
        break;
      case 'spending_survivor':
        plan.survivor_spending ??= Math.round((plan.desired_spending ?? 60000) * 0.85);
        break;
      case 'income_user_ss':
        plan.social_security ??= {};
        plan.social_security.user_receiving ??= false;
        plan.social_security.user_future_entitled ??= true;
        plan.social_security.user_entitled ??= true;
        plan.social_security.user_start_age ??= 67;
        plan.social_security.user_amount = Number(plan.social_security.user_amount) || 2000;
        plan.social_security.user_freq ||= 'monthly';
        break;
      case 'income_spouse_ss':
        plan.social_security ??= {};
        plan.social_security.spouse_receiving ??= false;
        plan.social_security.spouse_future_entitled = true;
        plan.social_security.spouse_entitled = true;
        plan.social_security.spouse_start_age ??= 67;
        plan.social_security.spouse_amount = Number(plan.social_security.spouse_amount) || 1500;
        plan.social_security.spouse_freq ||= 'monthly';
        break;
      case 'gateway_advanced':
        this.optedInStage5 = false;
        break;
      default:
        break;
    }
  }
}

