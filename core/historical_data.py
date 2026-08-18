"""
Historical market returns dataset (1926–2024) and stress-test crisis scenarios.
Data sources: Robert Shiller (Yale), Ibbotson SBBI, and Federal Reserve Economic Data (FRED).
"""

# Format: year: {'stocks': S&P 500 %, 'bonds': 10Y US Treasury %, 'cash': 3M T-Bill %, 'inflation': CPI-U %}
HISTORICAL_RETURNS = {
    1926: {'stocks': 11.62, 'bonds': 7.84, 'cash': 3.27, 'inflation': -1.49},
    1927: {'stocks': 37.49, 'bonds': 8.85, 'cash': 3.12, 'inflation': -2.08},
    1928: {'stocks': 43.61, 'bonds': 0.84, 'cash': 3.56, 'inflation': -0.97},
    1929: {'stocks': -8.42, 'bonds': 4.20, 'cash': 4.75, 'inflation': 0.00},
    1930: {'stocks': -24.90, 'bonds': 4.54, 'cash': 2.41, 'inflation': -2.34},
    1931: {'stocks': -43.34, 'bonds': -2.56, 'cash': 1.07, 'inflation': -9.00},
    1932: {'stocks': -8.19, 'bonds': 8.79, 'cash': 0.96, 'inflation': -10.30},
    1933: {'stocks': 53.99, 'bonds': 1.86, 'cash': 0.30, 'inflation': 0.80},
    1934: {'stocks': -1.44, 'bonds': 7.96, 'cash': 0.16, 'inflation': 1.50},
    1935: {'stocks': 47.67, 'bonds': 4.47, 'cash': 0.17, 'inflation': 3.00},
    1936: {'stocks': 33.92, 'bonds': 5.02, 'cash': 0.18, 'inflation': 1.40},
    1937: {'stocks': -35.03, 'bonds': 1.38, 'cash': 0.31, 'inflation': 3.10},
    1938: {'stocks': 31.12, 'bonds': 4.21, 'cash': 0.05, 'inflation': -2.80},
    1939: {'stocks': -0.41, 'bonds': 4.41, 'cash': 0.02, 'inflation': 0.00},
    1940: {'stocks': -9.78, 'bonds': 5.40, 'cash': 0.01, 'inflation': 0.70},
    1941: {'stocks': -11.59, 'bonds': -2.02, 'cash': 0.08, 'inflation': 9.70},
    1942: {'stocks': 20.34, 'bonds': 3.25, 'cash': 0.34, 'inflation': 9.30},
    1943: {'stocks': 25.90, 'bonds': 2.78, 'cash': 0.38, 'inflation': 3.00},
    1944: {'stocks': 19.75, 'bonds': 1.82, 'cash': 0.38, 'inflation': 2.30},
    1945: {'stocks': 36.44, 'bonds': 3.80, 'cash': 0.38, 'inflation': 2.20},
    1946: {'stocks': -8.07, 'bonds': 3.13, 'cash': 0.38, 'inflation': 18.10},
    1947: {'stocks': 5.71, 'bonds': -0.26, 'cash': 0.60, 'inflation': 8.80},
    1948: {'stocks': 5.50, 'bonds': 3.40, 'cash': 1.04, 'inflation': 3.00},
    1949: {'stocks': 18.79, 'bonds': 4.66, 'cash': 1.10, 'inflation': -2.10},
    1950: {'stocks': 31.71, 'bonds': 0.43, 'cash': 1.20, 'inflation': 5.80},
    1951: {'stocks': 24.02, 'bonds': -0.30, 'cash': 1.52, 'inflation': 5.90},
    1952: {'stocks': 18.37, 'bonds': 2.27, 'cash': 1.72, 'inflation': 0.90},
    1953: {'stocks': -0.99, 'bonds': 4.14, 'cash': 1.89, 'inflation': 0.60},
    1954: {'stocks': 52.62, 'bonds': 3.29, 'cash': 0.96, 'inflation': -0.50},
    1955: {'stocks': 31.56, 'bonds': -1.34, 'cash': 1.66, 'inflation': 0.40},
    1956: {'stocks': 6.56, 'bonds': -2.26, 'cash': 2.56, 'inflation': 3.00},
    1957: {'stocks': -10.78, 'bonds': 6.80, 'cash': 3.23, 'inflation': 2.90},
    1958: {'stocks': 43.36, 'bonds': -2.10, 'cash': 1.78, 'inflation': 1.80},
    1959: {'stocks': 11.96, 'bonds': -2.65, 'cash': 3.26, 'inflation': 1.70},
    1960: {'stocks': 0.47, 'bonds': 11.64, 'cash': 2.93, 'inflation': 1.40},
    1961: {'stocks': 26.89, 'bonds': 2.06, 'cash': 2.36, 'inflation': 0.70},
    1962: {'stocks': -8.73, 'bonds': 5.69, 'cash': 2.77, 'inflation': 1.30},
    1963: {'stocks': 22.80, 'bonds': 1.68, 'cash': 3.16, 'inflation': 1.60},
    1964: {'stocks': 16.48, 'bonds': 3.73, 'cash': 3.55, 'inflation': 1.00},
    1965: {'stocks': 12.45, 'bonds': 0.72, 'cash': 3.93, 'inflation': 1.90},
    1966: {'stocks': -10.06, 'bonds': 2.91, 'cash': 4.88, 'inflation': 3.50},
    1967: {'stocks': 23.98, 'bonds': -1.58, 'cash': 4.33, 'inflation': 3.00},
    1968: {'stocks': 11.06, 'bonds': 3.27, 'cash': 5.34, 'inflation': 4.70},
    1969: {'stocks': -8.50, 'bonds': -5.01, 'cash': 6.67, 'inflation': 6.20},
    1970: {'stocks': 4.01, 'bonds': 16.75, 'cash': 6.52, 'inflation': 5.60},
    1971: {'stocks': 14.31, 'bonds': 9.79, 'cash': 4.39, 'inflation': 3.30},
    1972: {'stocks': 18.98, 'bonds': 2.82, 'cash': 3.84, 'inflation': 3.40},
    1973: {'stocks': -14.66, 'bonds': 3.63, 'cash': 6.93, 'inflation': 8.71},
    1974: {'stocks': -26.47, 'bonds': 1.99, 'cash': 8.00, 'inflation': 12.34},
    1975: {'stocks': 37.20, 'bonds': 3.61, 'cash': 5.80, 'inflation': 6.94},
    1976: {'stocks': 23.84, 'bonds': 15.98, 'cash': 5.08, 'inflation': 4.86},
    1977: {'stocks': -7.18, 'bonds': 1.29, 'cash': 5.12, 'inflation': 6.70},
    1978: {'stocks': 6.56, 'bonds': -0.78, 'cash': 7.18, 'inflation': 9.02},
    1979: {'stocks': 18.44, 'bonds': 0.67, 'cash': 10.38, 'inflation': 13.29},
    1980: {'stocks': 32.42, 'bonds': -2.99, 'cash': 11.24, 'inflation': 12.52},
    1981: {'stocks': -4.91, 'bonds': 8.20, 'cash': 14.71, 'inflation': 8.92},
    1982: {'stocks': 21.55, 'bonds': 32.81, 'cash': 10.54, 'inflation': 3.83},
    1983: {'stocks': 22.56, 'bonds': 3.20, 'cash': 8.80, 'inflation': 3.79},
    1984: {'stocks': 6.27, 'bonds': 13.73, 'cash': 9.85, 'inflation': 3.95},
    1985: {'stocks': 31.73, 'bonds': 25.71, 'cash': 7.72, 'inflation': 3.80},
    1986: {'stocks': 18.67, 'bonds': 24.28, 'cash': 6.16, 'inflation': 1.10},
    1987: {'stocks': 5.25, 'bonds': -4.96, 'cash': 5.47, 'inflation': 4.40},
    1988: {'stocks': 16.61, 'bonds': 8.22, 'cash': 6.35, 'inflation': 4.40},
    1989: {'stocks': 31.69, 'bonds': 17.69, 'cash': 8.37, 'inflation': 4.60},
    1990: {'stocks': -3.10, 'bonds': 6.24, 'cash': 7.81, 'inflation': 6.10},
    1991: {'stocks': 30.47, 'bonds': 15.00, 'cash': 5.60, 'inflation': 3.10},
    1992: {'stocks': 7.62, 'bonds': 9.36, 'cash': 3.51, 'inflation': 2.90},
    1993: {'stocks': 10.08, 'bonds': 14.21, 'cash': 2.90, 'inflation': 2.70},
    1994: {'stocks': 1.32, 'bonds': -8.04, 'cash': 3.90, 'inflation': 2.70},
    1995: {'stocks': 37.58, 'bonds': 23.48, 'cash': 5.60, 'inflation': 2.50},
    1996: {'stocks': 22.96, 'bonds': 1.43, 'cash': 5.21, 'inflation': 3.30},
    1997: {'stocks': 33.36, 'bonds': 9.94, 'cash': 5.26, 'inflation': 1.70},
    1998: {'stocks': 28.58, 'bonds': 14.92, 'cash': 4.86, 'inflation': 1.60},
    1999: {'stocks': 21.04, 'bonds': -8.25, 'cash': 4.68, 'inflation': 2.70},
    2000: {'stocks': -9.10, 'bonds': 16.66, 'cash': 5.98, 'inflation': 3.39},
    2001: {'stocks': -11.89, 'bonds': 5.57, 'cash': 3.33, 'inflation': 1.55},
    2002: {'stocks': -22.10, 'bonds': 15.12, 'cash': 1.61, 'inflation': 2.38},
    2003: {'stocks': 28.68, 'bonds': 0.38, 'cash': 1.03, 'inflation': 1.88},
    2004: {'stocks': 10.88, 'bonds': 4.49, 'cash': 1.23, 'inflation': 3.26},
    2005: {'stocks': 4.91, 'bonds': 2.87, 'cash': 3.01, 'inflation': 3.42},
    2006: {'stocks': 15.79, 'bonds': 1.96, 'cash': 4.68, 'inflation': 2.54},
    2007: {'stocks': 5.49, 'bonds': 10.21, 'cash': 4.64, 'inflation': 4.08},
    2008: {'stocks': -37.00, 'bonds': 20.10, 'cash': 1.59, 'inflation': 0.09},
    2009: {'stocks': 26.46, 'bonds': -11.12, 'cash': 0.14, 'inflation': 2.72},
    2010: {'stocks': 15.06, 'bonds': 8.46, 'cash': 0.13, 'inflation': 1.50},
    2011: {'stocks': 2.11, 'bonds': 16.04, 'cash': 0.03, 'inflation': 2.96},
    2012: {'stocks': 16.00, 'bonds': 2.97, 'cash': 0.05, 'inflation': 1.74},
    2013: {'stocks': 32.39, 'bonds': -9.10, 'cash': 0.07, 'inflation': 1.50},
    2014: {'stocks': 13.69, 'bonds': 10.75, 'cash': 0.05, 'inflation': 0.76},
    2015: {'stocks': 1.38, 'bonds': 1.28, 'cash': 0.21, 'inflation': 0.73},
    2016: {'stocks': 11.96, 'bonds': 0.69, 'cash': 0.51, 'inflation': 2.07},
    2017: {'stocks': 21.83, 'bonds': 2.80, 'cash': 1.39, 'inflation': 2.11},
    2018: {'stocks': -4.38, 'bonds': -0.02, 'cash': 2.37, 'inflation': 1.91},
    2019: {'stocks': 31.49, 'bonds': 9.64, 'cash': 2.14, 'inflation': 2.29},
    2020: {'stocks': 18.40, 'bonds': 11.33, 'cash': 0.58, 'inflation': 1.36},
    2021: {'stocks': 28.71, 'bonds': -4.42, 'cash': 0.04, 'inflation': 7.04},
    2022: {'stocks': -18.11, 'bonds': -17.83, 'cash': 1.51, 'inflation': 6.45},
    2023: {'stocks': 26.29, 'bonds': 3.88, 'cash': 5.02, 'inflation': 3.35},
    2024: {'stocks': 25.02, 'bonds': 0.65, 'cash': 5.15, 'inflation': 2.90}
}

MIN_HISTORICAL_YEAR = 1926
MAX_HISTORICAL_YEAR = 2024

CRISIS_SCENARIOS = {
    '2000_dotcom': {
        'name': 'The Dot-Com Crash & "Lost Decade" (2000–2012)',
        'short_name': '2000 Dot-Com Crash',
        'start_year': 2000,
        'end_year': 2012,
        'length': 13,
        'description': 'Three consecutive down years for stocks (-9.1%, -11.9%, -22.1%) followed closely by the 2008 crash, representing the classic Sequence-of-Returns shock for early retirees.',
        'badge': 'Tech Bust + 2008 GFC'
    },
    '1973_stagflation': {
        'name': 'The 1970s Stagflation & Inflation Shock (1973–1982)',
        'short_name': '1973 Stagflation',
        'start_year': 1973,
        'end_year': 1982,
        'length': 10,
        'description': 'Severe equity market drawdown (-14.7%, -26.5%) combined with soaring double-digit inflation (up to 13.3%), putting tremendous strain on inflation-adjusted spending.',
        'badge': 'High Inflation + Drop'
    },
    '2008_gfc': {
        'name': 'The Great Financial Crisis (2007–2017)',
        'short_name': '2008 Global Financial Crisis',
        'start_year': 2007,
        'end_year': 2017,
        'length': 11,
        'description': 'A massive 37% stock market plunge in 2008 counterbalanced by strong Treasury bond gains (+20%), followed by an historic monetary stimulus and economic recovery.',
        'badge': 'Liquidity Panic'
    },
    '1929_depression': {
        'name': 'The Great Depression (1929–1941)',
        'short_name': '1929 Great Depression',
        'start_year': 1929,
        'end_year': 1941,
        'length': 13,
        'description': 'Four consecutive years of severe equity collapse with an overall drawdown exceeding 60%, followed by strong deflation and extreme economic volatility.',
        'badge': 'Historic Worst'
    },
    '2022_rate_spike': {
        'name': 'The 2022 Inflation & Rate Spike Shock (2022–2024)',
        'short_name': '2022 Inflation & Rate Spike',
        'start_year': 2022,
        'end_year': 2024,
        'length': 3,
        'description': 'A rare dual-collapse where both equities (-18.1%) and intermediate bonds (-17.8%) dropped simultaneously as inflation surged to 40-year highs.',
        'badge': 'Stocks & Bonds Both Fell'
    },
    '1966_bear': {
        'name': 'The 1966 Sideways Market & Creeping Inflation (1966–1981)',
        'short_name': '1966 Inflationary Bear',
        'start_year': 1966,
        'end_year': 1981,
        'length': 16,
        'description': 'The historically worst retirement cohort in Bill Bengen\'s 4% Rule research, characterized by persistent 15-year sideways equity returns eroded by climbing inflation.',
        'badge': 'Classic 4% Rule Stress'
    }
}

def get_historical_sequence(start_year, num_years):
    """
    Returns lists of stocks, bonds, cash, inflation of length num_years starting from start_year.
    If sequence exceeds MAX_HISTORICAL_YEAR, it wraps around from MIN_HISTORICAL_YEAR.
    """
    stocks = []
    bonds = []
    cash = []
    inflation = []
    
    curr = start_year
    for _ in range(num_years):
        if curr > MAX_HISTORICAL_YEAR:
            curr = MIN_HISTORICAL_YEAR
        data = HISTORICAL_RETURNS.get(curr, {'stocks': 7.0, 'bonds': 4.0, 'cash': 2.0, 'inflation': 2.5})
        stocks.append(data['stocks'])
        bonds.append(data['bonds'])
        cash.append(data['cash'])
        inflation.append(data['inflation'])
        curr += 1
        
    return {
        'stocks': stocks,
        'bonds': bonds,
        'cash': cash,
        'inflation': inflation
    }

def blend_return(stock_pct, bond_pct, cash_pct, s_ret, b_ret, c_ret):
    """Calculates weighted return given percentage allocations (0-100)."""
    return (stock_pct * s_ret + bond_pct * b_ret + cash_pct * c_ret) / 100.0
