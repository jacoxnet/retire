'''
Implements a monte-carlo simulation of a retirement plan with 
specified parameters
'''

import numpy as np

TOLERANCE = 0.01

# generates random returns and inflation
def generate_random_sample(annual_return, return_std, inflation_rate, inflation_std, years, runs):
    rng = np.random.default_rng()
    # generate random returns for normal distributions for returns and inflation
    returns = rng.normal(annual_return, return_std, size=(runs, years))
    inflation = rng.normal(inflation_rate, inflation_std, size=(runs, years))
    return returns, inflation

# performs simulation runs. Called from either regular sim or goal-seeking
# you can specify a different annual_withdrawal for goal-seeking calls
# this is called after generating the random sample
def do_sim_run(sim_input, returns, inflation, tested_withdrawal=None):
    if tested_withdrawal is None:
        tested_withdrawal = sim_input.annual_withdrawal
    the_runs = np.zeros((sim_input.runs, sim_input.years), dtype=float)
    for i in range(sim_input.runs):
        balance = sim_input.initial_wealth
        withdrawal = tested_withdrawal
        for j in range(sim_input.years):
            # no earnings if balance is zero or negative
            earnings = balance * returns[i][j] if balance > 0 else 0
            # inflation is prior year otherwise none
            adj_inflation = inflation[i][j - 1] if j > 0 else 0
            withdrawal = withdrawal * (1 + adj_inflation)
            end_balance = balance + earnings - withdrawal
            # print(f"DEBUG: old balance={dollar_format(balance)}, returns={percent_format(returns[i][j])}, earnings={dollar_format(earnings)}, inflation={percent_format(adj_inflation)}, wdraw={dollar_format(withdrawal)}, new balance={dollar_format(end_balance)}")
            the_runs[i][j] = end_balance
            balance = end_balance
    return the_runs

# Generate regular sim returns.
def generate_runs(sim_input):
    # generate random sample once to use with all runs
    returns, inflation = generate_random_sample(sim_input.annual_return / 100,
                                                sim_input.return_std / 100,
                                                sim_input.inflation_rate / 100,
                                                sim_input.inflation_std / 100,
                                                sim_input.years,
                                                sim_input.runs)
    return do_sim_run(sim_input, returns, inflation)

# Perform goal-seeking simulation using binary search
def binary_search(sim_input):
    # generate random sample once to use with all runs/withdrawals
    returns, inflation = generate_random_sample(sim_input.annual_return / 100,
                                                sim_input.return_std / 100,
                                                sim_input.inflation_rate / 100,
                                                sim_input.inflation_std / 100,
                                                sim_input.years,
                                                sim_input.runs)
    lower_limit = 0
    upper_limit = sim_input.initial_wealth / 10
    srate = sim_input.target_success_rate / 100
    searches = 1
    while upper_limit - lower_limit > TOLERANCE:
        mid = (upper_limit + lower_limit) / 2
        the_runs = do_sim_run(sim_input, returns, inflation, mid)
        success_rate = np.count_nonzero(the_runs[:, -1] >= 0) / sim_input.runs
        print(f"DEBUG: testing={mid}, success_rate={success_rate}")
        if abs(success_rate - srate) < TOLERANCE:
            break
        if success_rate < srate:
            upper_limit = mid
        else:
            lower_limit = mid
        searches += 1
    print(f"DEBUG: searches={searches}")
    return mid, success_rate * 100, searches