// Balance sheet build / parse / sync (core/forms.py). Ported in phase 4b; the
// functions here are placeholders so callers can be wired up now.
import type { Account, BalanceSheet } from './types';

/**
 * sync_accounts_to_balance_sheet: push account edits (names, balances, returns) into
 * the balance sheet's current period. TODO(4b): port. Currently returns it unchanged.
 */
export function syncAccountsToBalanceSheet(balanceSheet: BalanceSheet, _accounts: Account[], _currentYear = 2026): BalanceSheet {
  return balanceSheet;
}
