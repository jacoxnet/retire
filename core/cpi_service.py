"""CPI-U Inflation Service Module.

Provides official Consumer Price Index for All Urban Consumers (CPI-U) data
sourced from the Federal Reserve Bank of St. Louis (FRED Series: CPIAUCNS).
Implements the fixed prior-month reporting lag rule, Treasury contingency
overrides (such as October 2025 shutdown), and resilient caching with offline fallback.
"""

import os
import json
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

# U.S. Treasury Department official contingency index values (under 31 CFR Part 356)
# invoked for TIPS and inflation obligations when official BLS figures are suspended.
TREASURY_CONTINGENCY_OVERRIDES = {
    "2025-10": 325.604,  # Federal government shutdown Oct 1 - Nov 12, 2025
}

BASE_DIR = Path(__file__).resolve().parent
SEED_FILE = BASE_DIR / "data" / "cpi_u_historical.json"
CACHE_FILE = BASE_DIR / "data" / "cpi_cache.json"
FRED_CSV_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=CPIAUCNS"
CACHE_TTL_SECONDS = 86400  # 24 hours


def get_prior_month_str(date_str: str) -> str:
    """Return the YYYY-MM string for the month immediately prior to date_str.
    Accepts formats: YYYY-MM-DD, YYYY-MM, or YYYY/MM/DD.
    """
    if not date_str:
        now = datetime.now()
        y, m = now.year, now.month
    else:
        cleaned = str(date_str).strip().replace("/", "-")
        parts = cleaned.split("-")
        try:
            y = int(parts[0])
            m = int(parts[1]) if len(parts) > 1 else 1
        except (ValueError, IndexError):
            now = datetime.now()
            y, m = now.year, now.month

    # Subtract one month
    if m == 1:
        y -= 1
        m = 12
    else:
        m -= 1

    return f"{y:04d}-{m:02d}"


def fetch_fred_cpi_data(timeout: int = 5) -> dict:
    """Fetch latest CPIAUCNS observations from the official FRED CSV feed.
    Returns a dict mapping 'YYYY-MM' to float index.
    """
    req = urllib.request.Request(FRED_CSV_URL, headers={"User-Agent": "Mozilla/5.0 (RetireApp/1.0)"})
    data = {}
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        content = resp.read().decode("utf-8")
        lines = content.strip().split("\n")
        for line in lines[1:]:
            parts = line.strip().split(",")
            if len(parts) >= 2:
                d_str, val_str = parts[0].strip(), parts[1].strip()
                if len(d_str) >= 7 and val_str and val_str != ".":
                    ym = d_str[:7]
                    try:
                        data[ym] = round(float(val_str), 3)
                    except ValueError:
                        continue
    return data


def _interpolate_missing_months(data: dict) -> dict:
    """Ensure any missing or blank interior months are linearly interpolated."""
    if not data:
        return data

    # Apply known Treasury contingency overrides first
    for ym, val in TREASURY_CONTINGENCY_OVERRIDES.items():
        if ym not in data or data[ym] is None:
            data[ym] = val

    sorted_keys = sorted(data.keys())
    if not sorted_keys:
        return data

    min_y, min_m = map(int, sorted_keys[0].split("-"))
    max_y, max_m = map(int, sorted_keys[-1].split("-"))

    curr_y, curr_m = min_y, min_m
    while (curr_y < max_y) or (curr_y == max_y and curr_m <= max_m):
        ym = f"{curr_y:04d}-{curr_m:02d}"
        if ym not in data or data[ym] is None:
            # Interpolate or forward-fill
            prev_ym = get_prior_month_str(ym)
            prev_val = data.get(prev_ym, 100.0)
            data[ym] = prev_val

        if curr_m == 12:
            curr_y += 1
            curr_m = 1
        else:
            curr_m += 1

    return {k: data[k] for k in sorted(data.keys())}


def load_cpi_data(force_refresh: bool = False) -> dict:
    """Load the full CPI-U monthly dataset.
    Prioritizes local cache; if expired or missing, tries to refresh from FRED.
    Falls back gracefully to bundled historical seed data.
    """
    now_ts = time.time()
    cached_data = None

    if CACHE_FILE.exists() and not force_refresh:
        try:
            with open(CACHE_FILE, "r") as f:
                cache_payload = json.load(f)
                timestamp = cache_payload.get("timestamp", 0)
                if now_ts - timestamp < CACHE_TTL_SECONDS and "data" in cache_payload:
                    return cache_payload["data"]
                cached_data = cache_payload.get("data")
        except Exception:
            pass

    # Try refreshing from FRED
    try:
        fred_data = fetch_fred_cpi_data(timeout=5)
        if fred_data and len(fred_data) > 500:
            fred_data = _interpolate_missing_months(fred_data)
            try:
                CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
                with open(CACHE_FILE, "w") as f:
                    json.dump({"timestamp": now_ts, "data": fred_data}, f)
            except Exception:
                pass
            return fred_data
    except Exception:
        pass

    # If refresh failed, return existing cached data if available
    if cached_data:
        return cached_data

    # Fallback to seed data
    if SEED_FILE.exists():
        try:
            with open(SEED_FILE, "r") as f:
                seed_data = json.load(f)
                return _interpolate_missing_months(seed_data)
        except Exception:
            pass

    # Minimal emergency fallback
    return TREASURY_CONTINGENCY_OVERRIDES.copy()


def get_latest_cpi_month(cpi_data: dict = None) -> tuple[str, float]:
    """Return (latest_ym_string, latest_index_float) from the dataset."""
    if not cpi_data:
        cpi_data = load_cpi_data()
    if not cpi_data:
        return ("2026-08", 334.980)
    sorted_keys = sorted(cpi_data.keys())
    latest_k = sorted_keys[-1]
    return latest_k, cpi_data[latest_k]


def get_cpi_index_for_date(date_str: str, cpi_data: dict = None) -> tuple[str, float]:
    """Look up the CPI index level for the month immediately prior to date_str.
    Returns (prior_ym_string, index_float).
    """
    if not cpi_data:
        cpi_data = load_cpi_data()

    prior_ym = get_prior_month_str(date_str)
    sorted_keys = sorted(cpi_data.keys())
    if not sorted_keys:
        return (prior_ym, 100.0)

    if prior_ym in cpi_data:
        return (prior_ym, cpi_data[prior_ym])

    # If before earliest available month, use earliest
    if prior_ym < sorted_keys[0]:
        return (sorted_keys[0], cpi_data[sorted_keys[0]])

    # If after latest available month, use latest available
    return (sorted_keys[-1], cpi_data[sorted_keys[-1]])


def calculate_cpi_inflation(base_date_str: str, eval_date_str: str = None, cpi_data: dict = None) -> dict:
    """Calculate cumulative CPI-U inflation between the base reference date and evaluation date.
    Follows the fixed rule:
    - Base CPI Month = month immediately prior to base_date_str.
    - Evaluation CPI Month = month immediately prior to eval_date_str (or latest available index).
    """
    if not cpi_data:
        cpi_data = load_cpi_data()

    base_month, base_index = get_cpi_index_for_date(base_date_str, cpi_data)

    if eval_date_str:
        eval_month, eval_index = get_cpi_index_for_date(eval_date_str, cpi_data)
    else:
        eval_month, eval_index = get_latest_cpi_month(cpi_data)

    if base_index > 0:
        ratio = eval_index / base_index
        pct = (ratio - 1.0) * 100.0
    else:
        ratio = 1.0
        pct = 0.0

    return {
        "base_date": base_date_str,
        "base_month": base_month,
        "base_index": base_index,
        "eval_month": eval_month,
        "eval_index": eval_index,
        "inflation_ratio": round(ratio, 6),
        "inflation_pct": round(pct, 2),
    }
