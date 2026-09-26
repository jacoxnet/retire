"""Browser round-trip tests for the Enter page (Playwright + Chromium).

These catch JavaScript-side loss that the server-only tests in tests_navigation.py
cannot see: errors while enter.js rebuilds the page, controls that are not
serialized on submit, and values the page shows differently after a round trip.

Requires:  uv run playwright install chromium   (and network access for the CDN scripts)
Run with:  uv run python manage.py test core.tests_browser
"""
import copy
import os
import re
import unittest

from django.conf import settings
from django.contrib.sessions.backends.db import SessionStore
from django.contrib.staticfiles.testing import StaticLiveServerTestCase
from django.test import Client

from core.tests_navigation import DERIVED_KEYS, _diff, _rich_plan, server_round_trip

try:
    from playwright.sync_api import sync_playwright
except ImportError:  # pragma: no cover
    sync_playwright = None


TAB_IDS = ['demographics', 'assets', 'spending', 'income', 'balance-sheet', 'rebalance']

# Controls whose change restructures the page (re-orders accounts, hides whole
# sections) are exercised by dedicated tests instead of the generic sweep.
SWEEP_SKIP = {'is_married', 'planner_mode', 'account_type[]', 'account_owner[]'}

# Lowering present ages keeps every dependent age (retirement, start ages) valid.
DECREMENT_FIELDS = {'user_age', 'spouse_age'}

# Snapshot every user-facing control in a pane, in document order.
SNAPSHOT_JS = """
(pane) => Array.from(pane.querySelectorAll('input, select, textarea'))
  .filter(el => el.type !== 'hidden' && el.type !== 'button' && el.type !== 'submit')
  .map((el, i) => ({
      i,
      key: el.name || el.id || el.className,
      value: (el.type === 'checkbox' || el.type === 'radio') ? String(el.checked) : String(el.value),
      visible: !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length),
  }))
"""


def _norm(value):
    """Compare formatted numbers ($1,234 / 6.00% / 6) numerically."""
    stripped = re.sub(r'[$,%\s]', '', value)
    try:
        return round(float(stripped), 2)
    except ValueError:
        return value.strip()


@unittest.skipIf(sync_playwright is None, 'playwright is not installed')
class EnterPageBrowserTests(StaticLiveServerTestCase):

    @classmethod
    def setUpClass(cls):
        # Playwright's sync API runs an event loop; Django's ORM refuses to run
        # inside one unless told it is safe (it is: everything is on one thread).
        os.environ['DJANGO_ALLOW_ASYNC_UNSAFE'] = 'true'
        super().setUpClass()
        cls._pw = sync_playwright().start()
        cls.browser = cls._pw.chromium.launch()

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls._pw.stop()
        super().tearDownClass()

    def setUp(self):
        plan = _rich_plan()
        plan['runs'] = 100
        self.raw_plan = plan
        # Seed with a plan the server has already saved once, so derived values are
        # current and any difference found below is caused by the browser side.
        self.plan = self._server_saved(plan)
        self.context = self.browser.new_context()
        self.page = self.context.new_page()
        self.js_errors = []
        self.csp_errors = []
        self.page.on('console', self._on_console)
        self.page.on('pageerror', lambda exc: self.js_errors.append(f'Uncaught: {exc}'))

    def _on_console(self, msg):
        if msg.type != 'error':
            return
        loc = msg.location or {}
        where = f"{loc.get('url', '')}:{loc.get('lineNumber', '')}"
        if 'Content Security Policy' in msg.text:
            self.csp_errors.append(f'{where} {msg.text[:90]}')
        else:
            self.js_errors.append(f'{where} {msg.text}')

    def tearDown(self):
        self.context.close()

    # -- helpers ---------------------------------------------------------------

    @staticmethod
    def _server_saved(data):
        client = Client()
        session = client.session
        session['server_run_id'] = settings.SERVER_RUN_ID
        session['simulation_data'] = copy.deepcopy(data)
        session.save()
        return server_round_trip(client)

    def _seed_browser_session(self, data):
        store = SessionStore()
        store['server_run_id'] = settings.SERVER_RUN_ID
        store['simulation_data'] = copy.deepcopy(data)
        store['data_version'] = 1
        store.create()
        self.session_key = store.session_key
        self.context.add_cookies([{
            'name': settings.SESSION_COOKIE_NAME, 'value': store.session_key, 'url': self.live_server_url,
        }])

    def _saved_data(self):
        return copy.deepcopy(SessionStore(session_key=self.session_key).load()['simulation_data'])

    def _open_enter(self):
        self.page.goto(self.live_server_url + '/')
        self.page.wait_for_selector('#enterDataForm')
        self.page.wait_for_load_state('networkidle')

    def _open_tab(self, tab_id):
        self.page.click(f'#{tab_id}-tab')
        self.page.wait_for_selector(f'#{tab_id}.tab-pane.active.show')

    def _leave_via_manage_data(self):
        """Navigate away the way a user does: the Save/Load nav link submits the form."""
        self.page.click('#manageDataNav')
        try:
            self.page.wait_for_url('**/manage_data/**', timeout=15000)
        except Exception:
            alerts = self.page.locator('.alert, .is-invalid').all_inner_texts()
            invalid = self.page.eval_on_selector_all('.is-invalid', 'els => els.map(e => e.name || e.id)')
            self.fail(f'Navigation was blocked by validation. Invalid fields: {invalid}; alerts: {alerts}')

    def _snapshot(self, tab_id):
        return self.page.eval_on_selector(f'#{tab_id}', SNAPSHOT_JS)

    def _mutate_visible_controls(self, tab_id):
        """Give every visible, enabled control in the tab a new valid value."""
        changed = 0
        for pass_selector in ('select, input[type=checkbox]', 'input:not([type=checkbox]), textarea'):
            changed += self._mutate_pass(tab_id, pass_selector)
        return changed

    def _mutate_pass(self, tab_id, pass_selector):
        handles = self.page.query_selector_all(', '.join(f'#{tab_id} {sel.strip()}' for sel in pass_selector.split(',')))
        changed = 0
        for el in handles:
            if not el.is_visible() or not el.is_enabled():
                continue
            name = el.get_attribute('name') or ''
            input_type = (el.get_attribute('type') or 'text').lower()
            if name in SWEEP_SKIP or input_type in ('hidden', 'radio', 'range', 'date', 'file', 'button', 'submit'):
                continue
            tag = el.evaluate('e => e.tagName').lower()
            if tag == 'select':
                options = el.evaluate(
                    "e => Array.from(e.options).filter(o => !o.disabled && o.style.display !== 'none').map(o => o.value)")
                current = el.input_value()
                others = [o for o in options if o != current]
                if not others:
                    continue
                el.select_option(others[0])
            elif input_type == 'checkbox':
                el.click()
            else:
                current = el.input_value()
                num = _norm(current) if current else None
                if isinstance(num, float):
                    step = -1 if name in DECREMENT_FIELDS else (2 if 'age' in name else 1)
                    new = str(int(num) + step) if num == int(num) else f'{num + 0.5:g}'
                elif current:
                    new = current + ' X'
                else:
                    continue
                el.fill(new)
                el.dispatch_event('change')
                el.evaluate('e => e.blur()')
            changed += 1
        return changed

    def _compare_snapshots(self, before, after, label):
        problems = []
        if len(before) != len(after):
            problems.append(f'control count {len(before)} -> {len(after)}')
        for b, a in zip(before, after):
            if not b['visible']:
                continue  # hidden controls may be normalized by the server (e.g. SS future entitlement)
            if b['key'] != a['key']:
                problems.append(f'#{b["i"]}: control changed identity {b["key"]!r} -> {a["key"]!r}')
            elif _norm(b['value']) != _norm(a['value']):
                problems.append(f'#{b["i"]} {b["key"]}: {b["value"]!r} -> {a["value"]!r}')
        self.assertEqual(problems, [], f'{label}:\n  ' + '\n  '.join(problems))

    def _assert_no_js_errors(self):
        errors = [e for e in self.js_errors if 'favicon' not in e]
        self.assertEqual(errors, [], 'JavaScript errors:\n  ' + '\n  '.join(errors))

    # -- tests -----------------------------------------------------------------

    def test_pages_have_no_csp_violations(self):
        """Blocked inline scripts silently skip work (e.g. re-applying the saved theme)."""
        self._seed_browser_session(self.plan)
        for path in ('/', '/results/', '/manage_data/'):
            self.page.goto(self.live_server_url + path)
            self.page.wait_for_load_state('networkidle')
        self.assertEqual(self.csp_errors, [], 'CSP violations:\n  ' + '\n  '.join(self.csp_errors))

    def test_theme_choice_persists_across_pages(self):
        self._seed_browser_session(self.plan)
        self.page.goto(self.live_server_url + '/manage_data/')
        self.page.evaluate("localStorage.setItem('retire_theme', 'dark')")
        self.page.goto(self.live_server_url + '/')
        self.assertEqual(self.page.evaluate("document.documentElement.getAttribute('data-theme')"), 'dark')

    def test_enter_page_loads_without_js_errors(self):
        """Rebuilding every row from saved data must not throw (see commit 479dc87)."""
        self._seed_browser_session(self.plan)
        self._open_enter()
        for tab_id in TAB_IDS:
            self._open_tab(tab_id)
        self._assert_no_js_errors()
        counts = self.page.evaluate("""() => ({
            accounts: document.querySelectorAll('#accountsContainer .account-card-col').length,
            income: document.querySelectorAll('#incomeStreamsContainer .income-stream-card').length,
        })""")
        self.assertEqual(counts['accounts'], len(self.plan['accounts']))
        self.assertEqual(counts['income'], len(self.plan['income_sources']))

    def test_untouched_navigation_matches_server_only_round_trip(self):
        """Leaving Enter without edits must save exactly what the no-JS round trip saves."""
        expected = self._server_saved(self.plan)

        self._seed_browser_session(self.plan)
        self._open_enter()
        self._leave_via_manage_data()
        actual = self._saved_data()
        self._assert_no_js_errors()

        diffs = list(_diff({k: v for k, v in expected.items() if k not in DERIVED_KEYS},
                           {k: v for k, v in actual.items() if k not in DERIVED_KEYS}))
        self.assertEqual(diffs, [], 'Browser round trip saved different data than the form shows:\n  '
                         + '\n  '.join(diffs))

    def _sweep_tab(self, tab_id):
        self._seed_browser_session(self.plan)
        self._open_enter()
        self._open_tab(tab_id)
        changed = self._mutate_visible_controls(tab_id)
        self.assertGreater(changed, 0, f'no editable controls found on {tab_id}')
        before = self._snapshot(tab_id)
        self._leave_via_manage_data()
        self._open_enter()
        self._open_tab(tab_id)
        after = self._snapshot(tab_id)
        self._assert_no_js_errors()
        self._compare_snapshots(before, after, f'{tab_id}: edited values not restored after navigating away and back')

    def test_sweep_demographics(self):
        self._sweep_tab('demographics')

    def test_sweep_assets(self):
        self._sweep_tab('assets')

    def test_sweep_spending(self):
        self._sweep_tab('spending')

    def test_sweep_income(self):
        self._sweep_tab('income')

    def test_sweep_balance_sheet(self):
        self._sweep_tab('balance-sheet')

    def test_sweep_rebalance(self):
        self._sweep_tab('rebalance')

    def test_marginal_tax_rate_override_persists(self):
        self._seed_browser_session(self.plan)
        self._open_enter()
        self._open_tab('balance-sheet')
        field = self.page.locator('#bsTaxRateOverrideInput')
        auto_rate = field.input_value()
        field.fill('31.5')
        field.press('Tab')
        self._leave_via_manage_data()
        saved_bs = self._saved_data()['balance_sheet']
        self._open_enter()
        self._open_tab('balance-sheet')
        shown = self.page.locator('#bsTaxRateOverrideInput').input_value()
        self._assert_no_js_errors()
        self.assertEqual((saved_bs.get('marginal_tax_rate_override'), shown), (31.5, '31.5'),
                         f'auto rate was {auto_rate}')

    def test_unmarrying_does_not_drop_account_end_age(self):
        """Unchecking Married disables spouse-only end-age options; the row must still submit."""
        plan = self.plan
        for acc in plan['accounts']:
            acc['owner'] = 'user'
        plan['accounts'][0]['contrib_end_age_type'] = 'first_death'
        self._seed_browser_session(plan)
        self._open_enter()
        self.page.uncheck('#is_married')
        self._leave_via_manage_data()
        saved = self._saved_data()
        self._assert_no_js_errors()
        end_types = [a['contrib_end_age_type'] for a in saved['accounts']]
        self.assertEqual(len(end_types), len(plan['accounts']))
        self.assertNotIn('first_death', end_types, 'disabled first_death option was kept')
