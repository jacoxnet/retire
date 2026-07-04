'''
Implements a monte-carlo simulation of a retirement plan with 
specified parameters
'''

import decimal
import numpy as np

def generate_random_sample(annual_return, return_std, inflation_rate, inflation_std, years, runs):
    rng = np.random.default_rng()
    # generate random returns for normal distributions for returns and inflation
    returns = rng.normal(annual_return, return_std, size=(runs, years))
    inflation = rng.normal(inflation_rate, inflation_std, size=(runs, years))
    return returns, inflation

def generate_runs(sim_input):
    
    returns, inflation = generate_random_sample(sim_input.annual_return / 100,
                                                sim_input.return_std / 100,
                                                sim_input.inflation_rate / 100,
                                                sim_input.inflation_std / 100,
                                                sim_input.years,
                                                sim_input.runs)
    the_runs = np.zeros((sim_input.runs, sim_input.years), dtype=float)
    for i in range(sim_input.runs):
        balance = sim_input.initial_wealth
        withdrawal = sim_input.annual_withdrawal
        for j in range(sim_input.years):
            # no earnings if balance is zero or negative
            earnings = balance * decimal.Decimal(returns[i][j]) if balance > 0 else 0
            # inflation is prior year otherwise none
            adj_inflation = decimal.Decimal(inflation[i][j - 1]) if j > 0 else 0
            withdrawal = withdrawal * (1 + adj_inflation)
            end_balance = balance + earnings - withdrawal
            # print(f"DEBUG: old balance={dollar_format(balance)}, returns={percent_format(returns[i][j])}, earnings={dollar_format(earnings)}, inflation={percent_format(adj_inflation)}, wdraw={dollar_format(withdrawal)}, new balance={dollar_format(end_balance)}")
            the_runs[i][j] = end_balance
            balance = end_balance
    return the_runs
