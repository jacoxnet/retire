// Earliest Retirement Age search engine: solves for the earliest retirement
// age(s) achieving the target success rate.
import { type ChunkRunner, localRunner, type McJob, randomSeed, splitRanges } from './mc';
import { get, type Dict } from './py';
import { getFloat, getInt } from '../plan/coerce';
import type { EarliestRetirementStrategy } from '../plan/types';

export interface EarliestRetirementResult {
  achieved_user_ret_age: number;
  achieved_spouse_ret_age?: number;
  achieved_success_rate: number;
  strategy: EarliestRetirementStrategy;
  searches: number;
  immediate: boolean;
  unreachable: boolean;
  frontier?: FrontierPoint[];
}

export interface FrontierPoint {
  user_ret_age: number;
  spouse_ret_age: number;
  success_rate: number;
  user_year: number;
  spouse_year: number;
  is_selected?: boolean;
}

export interface EarliestRetirementOptions {
  seed?: number;
  runner?: ChunkRunner;
  chunks?: number;
  onProgress?: (done: number, total: number) => void;
}

/**
 * Searches for the earliest retirement age(s) meeting the target success rate.
 */
export async function earliestRetirementSearch(
  plan: Dict,
  opts: EarliestRetirementOptions = {},
): Promise<EarliestRetirementResult> {
  const isMarried = Boolean(get(plan, 'is_married', false));
  const userAge = getInt(plan.user_age, 60);
  const spouseAge = isMarried ? getInt(plan.spouse_age, 60) : 60;
  const userDeath = getInt(plan.user_age_death, 90);
  const spouseDeath = isMarried ? getInt(plan.spouse_age_death, 90) : 90;
  const currentYear = getInt(plan.current_year, 2026);
  const targetRate = getFloat(plan.target_success_rate, 80.0) / 100.0;
  const strategy: EarliestRetirementStrategy = isMarried
    ? ((get(plan, 'earliest_retirement_strategy', 'simultaneous') as EarliestRetirementStrategy) || 'simultaneous')
    : 'simultaneous';

  const maxUserAge = Math.min(userDeath, 80);
  const maxSpouseAge = Math.min(spouseDeath, 80);

  const runs = getInt(plan.runs, 50000);
  const seed = opts.seed ?? randomSeed();
  const runner = opts.runner ?? localRunner;
  const ranges = splitRanges(runs, opts.chunks ?? 1);

  let searchCount = 0;
  const estimatedSearches = isMarried ? 20 : 6;
  const cache = new Map<string, number>();

  async function evaluateAges(uAge: number, sAge: number): Promise<number> {
    const key = `${uAge},${sAge}`;
    if (cache.has(key)) return cache.get(key)!;

    searchCount += 1;
    const testPlan: Dict = {
      ...plan,
      user_retirement_age: uAge,
      spouse_retirement_age: sAge,
    };
    const job: McJob = {
      plan: testPlan,
      seed,
      testSpending: null,
      stress: null,
      collect: { endings: false, trajCap: 0, spaghetti: 0 },
    };

    const doneBefore = (searchCount - 1) * runs;
    const chunks = await runner(
      job,
      ranges,
      opts.onProgress ? (d) => opts.onProgress!(doneBefore + d, estimatedSearches * runs) : undefined,
    );
    const rate = chunks.reduce((n, c) => n + c.successes, 0) / runs;
    cache.set(key, rate);
    return rate;
  }

  let solvedUser = userAge;
  let solvedSpouse = spouseAge;
  let solvedRate = 0;
  let immediate = false;
  let unreachable = false;

  if (!isMarried) {
    // Single user: binary search on user_retirement_age
    const rateAtCurrent = await evaluateAges(userAge, spouseAge);
    if (rateAtCurrent >= targetRate) {
      solvedUser = userAge;
      solvedRate = rateAtCurrent;
      immediate = true;
    } else {
      const rateAtMax = await evaluateAges(maxUserAge, spouseAge);
      if (rateAtMax < targetRate) {
        solvedUser = maxUserAge;
        solvedRate = rateAtMax;
        unreachable = true;
      } else {
        let low = userAge;
        let high = maxUserAge;
        solvedUser = maxUserAge;
        solvedRate = rateAtMax;
        while (low <= high) {
          const mid = Math.floor((low + high) / 2);
          const rate = await evaluateAges(mid, spouseAge);
          if (rate >= targetRate) {
            solvedUser = mid;
            solvedRate = rate;
            high = mid - 1;
          } else {
            low = mid + 1;
          }
        }
      }
    }
    return {
      achieved_user_ret_age: solvedUser,
      achieved_success_rate: solvedRate * 100.0,
      strategy,
      searches: searchCount,
      immediate,
      unreachable,
    };
  }

  // Married couple: solve according to selected strategy
  if (strategy === 'simultaneous') {
    // Both retire after k years from now
    const maxK = Math.max(0, Math.min(maxUserAge - userAge, maxSpouseAge - spouseAge));
    const rateAt0 = await evaluateAges(userAge, spouseAge);
    if (rateAt0 >= targetRate) {
      solvedUser = userAge;
      solvedSpouse = spouseAge;
      solvedRate = rateAt0;
      immediate = true;
    } else {
      const rateAtMax = await evaluateAges(userAge + maxK, spouseAge + maxK);
      if (rateAtMax < targetRate) {
        solvedUser = userAge + maxK;
        solvedSpouse = spouseAge + maxK;
        solvedRate = rateAtMax;
        unreachable = true;
      } else {
        let low = 0;
        let high = maxK;
        let bestK = maxK;
        solvedRate = rateAtMax;
        while (low <= high) {
          const mid = Math.floor((low + high) / 2);
          const rate = await evaluateAges(userAge + mid, spouseAge + mid);
          if (rate >= targetRate) {
            bestK = mid;
            solvedRate = rate;
            high = mid - 1;
          } else {
            low = mid + 1;
          }
        }
        solvedUser = userAge + bestK;
        solvedSpouse = spouseAge + bestK;
      }
    }
  } else if (strategy === 'same_age') {
    // Both retire at common age A
    const minA = Math.max(userAge, spouseAge);
    const maxA = Math.min(maxUserAge, maxSpouseAge);
    if (minA > maxA) {
      solvedUser = userAge;
      solvedSpouse = spouseAge;
      unreachable = true;
    } else {
      const rateAtMin = await evaluateAges(minA, minA);
      if (rateAtMin >= targetRate) {
        solvedUser = minA;
        solvedSpouse = minA;
        solvedRate = rateAtMin;
        immediate = userAge === minA && spouseAge === minA;
      } else {
        const rateAtMax = await evaluateAges(maxA, maxA);
        if (rateAtMax < targetRate) {
          solvedUser = maxA;
          solvedSpouse = maxA;
          solvedRate = rateAtMax;
          unreachable = true;
        } else {
          let low = minA;
          let high = maxA;
          let bestA = maxA;
          solvedRate = rateAtMax;
          while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            const rate = await evaluateAges(mid, mid);
            if (rate >= targetRate) {
              bestA = mid;
              solvedRate = rate;
              high = mid - 1;
            } else {
              low = mid + 1;
            }
          }
          solvedUser = bestA;
          solvedSpouse = bestA;
        }
      }
    }
  } else if (strategy === 'solve_user') {
    // Keep spouse retirement age fixed
    const fixedSpouse = Math.max(spouseAge, getInt(plan.spouse_retirement_age, spouseAge));
    solvedSpouse = fixedSpouse;
    const rateAtMin = await evaluateAges(userAge, fixedSpouse);
    if (rateAtMin >= targetRate) {
      solvedUser = userAge;
      solvedRate = rateAtMin;
      immediate = true;
    } else {
      const rateAtMax = await evaluateAges(maxUserAge, fixedSpouse);
      if (rateAtMax < targetRate) {
        solvedUser = maxUserAge;
        solvedRate = rateAtMax;
        unreachable = true;
      } else {
        let low = userAge;
        let high = maxUserAge;
        solvedUser = maxUserAge;
        solvedRate = rateAtMax;
        while (low <= high) {
          const mid = Math.floor((low + high) / 2);
          const rate = await evaluateAges(mid, fixedSpouse);
          if (rate >= targetRate) {
            solvedUser = mid;
            solvedRate = rate;
            high = mid - 1;
          } else {
            low = mid + 1;
          }
        }
      }
    }
  } else if (strategy === 'solve_spouse') {
    // Keep user retirement age fixed
    const fixedUser = Math.max(userAge, getInt(plan.user_retirement_age, userAge));
    solvedUser = fixedUser;
    const rateAtMin = await evaluateAges(fixedUser, spouseAge);
    if (rateAtMin >= targetRate) {
      solvedSpouse = spouseAge;
      solvedRate = rateAtMin;
      immediate = true;
    } else {
      const rateAtMax = await evaluateAges(fixedUser, maxSpouseAge);
      if (rateAtMax < targetRate) {
        solvedSpouse = maxSpouseAge;
        solvedRate = rateAtMax;
        unreachable = true;
      } else {
        let low = spouseAge;
        let high = maxSpouseAge;
        solvedSpouse = maxSpouseAge;
        solvedRate = rateAtMax;
        while (low <= high) {
          const mid = Math.floor((low + high) / 2);
          const rate = await evaluateAges(fixedUser, mid);
          if (rate >= targetRate) {
            solvedSpouse = mid;
            solvedRate = rate;
            high = mid - 1;
          } else {
            low = mid + 1;
          }
        }
      }
    }
  }

  // Compute Trade-Off Frontier for married couples (Option 2)
  const frontier: FrontierPoint[] = [];
  const candidateUserAges: number[] = [];
  const minFrontierUser = Math.max(userAge, solvedUser - 4);
  const maxFrontierUser = Math.min(maxUserAge, solvedUser + 4);

  for (let u = minFrontierUser; u <= maxFrontierUser; u++) {
    candidateUserAges.push(u);
  }
  if (!candidateUserAges.includes(solvedUser)) {
    candidateUserAges.push(solvedUser);
    candidateUserAges.sort((a, b) => a - b);
  }

  // Find minimal spouse age for each user age
  let prevSpouseLimit = maxSpouseAge;
  for (const u of candidateUserAges) {
    if (u === solvedUser && cache.has(`${solvedUser},${solvedSpouse}`)) {
      frontier.push({
        user_ret_age: solvedUser,
        spouse_ret_age: solvedSpouse,
        success_rate: (cache.get(`${solvedUser},${solvedSpouse}`) ?? solvedRate) * 100.0,
        user_year: currentYear + (solvedUser - userAge),
        spouse_year: currentYear + (solvedSpouse - spouseAge),
        is_selected: true,
      });
      prevSpouseLimit = solvedSpouse;
      continue;
    }

    // Binary search on spouse age within [spouseAge, prevSpouseLimit]
    let low = spouseAge;
    let high = prevSpouseLimit;
    let bestS: number | null = null;
    let bestSRate = 0;

    // Fast check lower bound
    const rateAtLow = await evaluateAges(u, low);
    if (rateAtLow >= targetRate) {
      bestS = low;
      bestSRate = rateAtLow;
    } else {
      // Check upper bound
      const rateAtHigh = await evaluateAges(u, high);
      if (rateAtHigh >= targetRate) {
        bestS = high;
        bestSRate = rateAtHigh;
        while (low <= high) {
          const mid = Math.floor((low + high) / 2);
          const rate = await evaluateAges(u, mid);
          if (rate >= targetRate) {
            bestS = mid;
            bestSRate = rate;
            high = mid - 1;
          } else {
            low = mid + 1;
          }
        }
      }
    }

    if (bestS !== null) {
      frontier.push({
        user_ret_age: u,
        spouse_ret_age: bestS,
        success_rate: bestSRate * 100.0,
        user_year: currentYear + (u - userAge),
        spouse_year: currentYear + (bestS - spouseAge),
        is_selected: u === solvedUser && bestS === solvedSpouse,
      });
      prevSpouseLimit = bestS;
    }
  }

  return {
    achieved_user_ret_age: solvedUser,
    achieved_spouse_ret_age: solvedSpouse,
    achieved_success_rate: solvedRate * 100.0,
    strategy,
    searches: searchCount,
    immediate,
    unreachable,
    frontier,
  };
}
