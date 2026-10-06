<script lang="ts">
  import 'bootstrap/dist/css/bootstrap.min.css';
  import '@fortawesome/fontawesome-free/css/all.min.css';
  import '../styles/style.css';
  import { page } from '$app/state';
  import { resolve } from '$app/paths';
  import { uiPrefs } from '../lib/app/context';
  import InstructionsModal from '../lib/components/shared/InstructionsModal.svelte';

  let { children } = $props();
  const ui = uiPrefs();

  let navOpen = $state(false);
  let howToOpen = $state(false);

  const links = [
    { href: resolve('/'), label: 'Enter Data', id: 'enterNav' },
    { href: resolve('/results'), label: 'Simulation Results', id: 'viewResultsNav' },
    { href: resolve('/manage'), label: 'Save/Load/Clear Data', id: 'manageDataNav' },
  ];

  const trim = (p: string) => p.replace(/\/+$/, '');
  const isActive = (href: string) => trim(page.url.pathname) === trim(href);
</script>

<nav class="navbar navbar-expand-lg navbar-light fixed-top" id="mainNav">
  <div class="container">
    <a class="navbar-brand" href={resolve('/')}>
      <i class="fa-solid fa-chart-line text-primary me-2"></i>Retirement Calculator
    </a>
    <button
      class="navbar-toggler navbar-toggler-right"
      type="button"
      aria-controls="navbarResponsive"
      aria-expanded={navOpen}
      aria-label="Toggle navigation"
      onclick={() => (navOpen = !navOpen)}
    >
      <span class="fa fa-bars"></span>
    </button>
    <div class={['collapse navbar-collapse', navOpen && 'show']} id="navbarResponsive">
      <ul class="navbar-nav text-uppercase ms-auto">
        {#each links as link (link.id)}
          <li class="nav-item">
            <a class={['nav-link', isActive(link.href) && 'active']} id={link.id} href={link.href}
              onclick={() => (navOpen = false)}>{link.label}</a>
          </li>
        {/each}
      </ul>
      <div class="d-flex align-items-center ms-lg-3 mt-2 mt-lg-0">
        <button
          class="btn btn-sm btn-outline-secondary theme-toggle-btn"
          id="themeToggleBtn"
          type="button"
          title={ui.theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
          aria-label="Toggle Light/Dark Theme"
          onclick={() => ui.toggleTheme()}
        >
          <i class={['fa-solid theme-toggle-icon', ui.theme === 'dark' ? 'fa-sun text-warning' : 'fa-moon text-secondary']}
            id="themeToggleIcon"></i>
        </button>
      </div>
    </div>
  </div>
</nav>

<main class="main-content">
  {@render children()}
</main>

<footer class="footer">
  <a href="#howTo" id="howToLink" class="how-to-link"
    onclick={(e) => { e.preventDefault(); howToOpen = true; }}>How to Use this App</a>
</footer>

<InstructionsModal bind:open={howToOpen} />
