// @vitest-environment jsdom
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { takeFlash } from '../../src/lib/app/flash.svelte';
import ManagePage from '../../src/lib/components/manage/ManagePage.svelte';
import { getDefaultData } from '../../src/lib/plan/defaults';
import { memoryStorage, PlanStore } from '../../src/lib/plan/store.svelte';
import { FIXTURES_DIR, fixtureIndex, loadPlanFixture } from '../fixtures';

const SAVED_DIR = join(FIXTURES_DIR, '..', '..', 'saved json files');
const savedFiles = readdirSync(SAVED_DIR).filter((f) => f.endsWith('.json')).sort();

beforeEach(() => {
  // Imports date missing balance-sheet columns "today"; the fixtures froze it.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-01-15T12:00:00'));
  window.alert = vi.fn();
  window.confirm = () => true;
  takeFlash();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function setup() {
  const store = new PlanStore(memoryStorage());
  const onDone = vi.fn();
  const download = vi.fn();
  render(ManagePage, { store, onDone, download });
  return { store, onDone, download };
}

async function upload(text: string, name = 'plan.json') {
  const input = document.getElementById('jsonFileInput') as HTMLInputElement;
  const file = new File([text], name, { type: 'application/json' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  await fireEvent.change(input);
  await vi.waitFor(() => expect(input.value).toBe(''));
}

const fixtureFor = (file: string) => fixtureIndex().plans.find((p) => p.source === file);

describe('Load Plan', () => {
  it.each(savedFiles)('imports %s as Django did', async (file) => {
    const { store, onDone } = setup();
    await upload(readFileSync(join(SAVED_DIR, file), 'utf8'), file);
    await vi.waitFor(() => expect(onDone).toHaveBeenCalled());
    const fx = fixtureFor(file);
    if (fx) {
      const { plan, import_errors } = loadPlanFixture<{ plan: unknown; import_errors: string[] }>(fx.name, 'imported');
      expect(JSON.parse(store.exportText())).toEqual(plan);
      const messages = takeFlash();
      expect(messages.at(-1)?.text).toBe(import_errors.length
        ? 'Plan loaded, but some values need to be corrected before running the simulation.'
        : 'Plan loaded successfully!');
    }
  });

  it.each(savedFiles)('round-trips %s through Save and Load', async (file) => {
    const { store, download } = setup();
    await upload(readFileSync(join(SAVED_DIR, file), 'utf8'), file);
    // A legacy plan's first re-import can add a placeholder account (a Django quirk, see 4b);
    // from then on export and import are exact.
    await fireEvent.click(document.getElementById('btnSaveJSON')!);
    await upload(download.mock.calls[0][1]);
    await fireEvent.click(document.getElementById('btnSaveJSON')!);
    const once = download.mock.calls[1][1];
    await upload(once);
    await fireEvent.click(document.getElementById('btnSaveJSON')!);
    expect(download.mock.calls[2][1]).toBe(once);
    expect(store.plan).toBeTruthy();
  });

  it('names the file after the user', async () => {
    const { store, download } = setup();
    store.plan.user_name = 'Pat  Smith';
    await fireEvent.click(document.getElementById('btnSaveJSON')!);
    expect(download.mock.calls[0][0]).toBe('pat_smith_plan.json');
    expect(JSON.parse(download.mock.calls[0][1]).user_name).toBe('Pat  Smith');
  });

  it('rejects files that are not plans', async () => {
    const { store, onDone } = setup();
    const before = store.exportText();
    await upload('not json');
    expect(window.alert).toHaveBeenCalledWith(expect.stringMatching(/^Error reading JSON file: /));
    await upload('42');
    expect(window.alert).toHaveBeenCalledWith('Invalid JSON file format.');
    expect(onDone).not.toHaveBeenCalled();
    // An array passes the page's check; the server then refused it and showed the Enter page.
    await upload('[1, 2]');
    await vi.waitFor(() => expect(onDone).toHaveBeenCalledOnce());
    expect(takeFlash()).toEqual([{ level: 'error', text: 'Error loading plan: Invalid JSON format' }]);
    expect(store.exportText()).toBe(before);
  });

  it('loads a plan with problems and says what to fix', async () => {
    const { store, onDone } = setup();
    const plan = { ...getDefaultData('2026-01-15'), user_age: 70, user_retirement_age: 65 };
    await upload(JSON.stringify(plan));
    await vi.waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(store.plan.user_age).toBe(70);
    expect(takeFlash()).toEqual([
      { level: 'error', text: 'Your Retirement Age must be between Your Present Age (70) and 120.' },
      { level: 'warning', text: 'Plan loaded, but some values need to be corrected before running the simulation.' },
    ]);
  });
});

describe('Clear Data', () => {
  it('resets to the defaults after confirming', async () => {
    const { store, onDone } = setup();
    store.plan.user_name = 'Someone';
    window.confirm = () => false;
    await fireEvent.click(document.getElementById('btnClearData')!);
    expect(store.plan.user_name).toBe('Someone');
    window.confirm = () => true;
    const v = store.dataVersion;
    await fireEvent.click(document.getElementById('btnClearData')!);
    expect(store.plan.user_name).toBe(getDefaultData('2026-01-15').user_name);
    expect(store.dataVersion).toBe(v + 1);
    expect(onDone).toHaveBeenCalledOnce();
    expect(takeFlash()).toEqual([{ level: 'success', text: 'All simulation data has been cleared.' }]);
  });
});
