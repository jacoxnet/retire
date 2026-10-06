<!-- Save / Load / Clear (manage_data.html + manage_data.js): export the plan as JSON,
     import a plan file, or reset to the defaults. -->
<script lang="ts">
  import { flash } from '../../app/flash.svelte';
  import type { PlanStore } from '../../plan/store.svelte';

  interface Props {
    store: PlanStore;
    /** Go to the Enter page (where the import / clear messages are shown). */
    onDone: () => void;
    /** Save a file (injectable for tests). */
    download?: (fileName: string, text: string) => void;
  }
  let { store, onDone, download = saveFile }: Props = $props();

  let fileInput: HTMLInputElement | undefined = $state();

  function saveFile(fileName: string, text: string) {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function save() {
    const name = String(store.plan.user_name || 'retirement').toLowerCase().replace(/\s+/g, '_');
    download(`${name}_plan.json`, store.exportText());
  }

  async function load(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      // The page's own check before submitting (a JSON-encoded plan string is unwrapped by the import).
      try {
        const raw = JSON.parse(text);
        if (raw === null || (typeof raw !== 'object' && typeof raw !== 'string')) {
          window.alert('Invalid JSON file format.');
          return;
        }
      } catch (err) {
        window.alert(`Error reading JSON file: ${err instanceof Error ? err.message : String(err)}`);
        return;
      }
      const outcome = store.importText(text);
      if (!outcome.loaded) {
        for (const m of outcome.errors) flash('error', m);
      } else if (outcome.errors.length) {
        for (const m of outcome.errors) flash('error', m);
        flash('warning', 'Plan loaded, but some values need to be corrected before running the simulation.');
      } else {
        flash('success', 'Plan loaded successfully!');
      }
      onDone();
    } finally {
      input.value = '';
    }
  }

  function clear() {
    if (!window.confirm('Are you sure you want to clear all data and reset to default values? This action cannot be undone.')) return;
    store.clear();
    flash('success', 'All simulation data has been cleared.');
    onDone();
  }
</script>

<div class="container main-content mt-4 mb-5">
  <div class="text-center mb-5">
    <h1 class="pageheading mb-2">Plan Data Management</h1>
    <p class="text-secondary lead fs-6">Export your retirement plan to a file, restore a previously saved plan, or reset all inputs.</p>
  </div>

  <div class="row g-4 justify-content-center">
    <div class="col-md-4">
      <div class="card p-4 h-100 shadow-sm border-0 text-center hover-shadow transition-all bg-white">
        <div class="card-body d-flex flex-column justify-content-between p-0">
          <div>
            <div class="p-3 bg-primary bg-opacity-10 rounded-circle d-inline-block mb-3"><i class="fa fa-download fa-2x text-primary"></i></div>
            <h4 class="fw-bold text-primary mb-2">Save Plan (JSON)</h4>
            <p class="text-muted small mb-4">Download your complete retirement plan inputs, accounts, spending, and income streams to a local <code>.json</code> file.</p>
          </div>
          <button type="button" class="btn btn-primary py-2 fw-semibold shadow-sm w-100" id="btnSaveJSON" onclick={save}>
            <i class="fa fa-download me-2"></i>Save Plan (.json)
          </button>
        </div>
      </div>
    </div>

    <div class="col-md-4">
      <div class="card p-4 h-100 shadow-sm border-0 text-center hover-shadow transition-all bg-white">
        <div class="card-body d-flex flex-column justify-content-between p-0">
          <div>
            <div class="p-3 bg-success bg-opacity-10 rounded-circle d-inline-block mb-3"><i class="fa fa-upload fa-2x text-success"></i></div>
            <h4 class="fw-bold text-success mb-2">Load Plan (JSON)</h4>
            <p class="text-muted small mb-4">Restore an existing retirement plan file from your computer to quickly inspect or update the simulation.</p>
          </div>
          <div>
            <input type="file" id="jsonFileInput" accept=".json" style="display: none;" bind:this={fileInput} onchange={load} />
            <button type="button" class="btn btn-success py-2 fw-semibold shadow-sm w-100" id="btnTriggerLoad" onclick={() => fileInput?.click()}>
              <i class="fa fa-upload me-2"></i>Load Plan (.json)
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="col-md-4">
      <div class="card p-4 h-100 shadow-sm border-0 text-center hover-shadow transition-all bg-white">
        <div class="card-body d-flex flex-column justify-content-between p-0">
          <div>
            <div class="p-3 bg-danger bg-opacity-10 rounded-circle d-inline-block mb-3"><i class="fa fa-trash-can fa-2x text-danger"></i></div>
            <h4 class="fw-bold text-danger mb-2">Clear Data</h4>
            <p class="text-muted small mb-4">Reset all current retirement parameters, accounts, income streams, and taxes back to default sample values.</p>
          </div>
          <button type="button" class="btn btn-outline-danger py-2 fw-semibold shadow-sm w-100" id="btnClearData" onclick={clear}>
            <i class="fa fa-trash me-2"></i>Clear Data
          </button>
        </div>
      </div>
    </div>
  </div>

  <div class="text-center mt-5">
    <button type="button" class="btn btn-outline-secondary" onclick={onDone}><i class="fa fa-pen-to-square me-1"></i> Return to Data Entry</button>
  </div>
</div>
