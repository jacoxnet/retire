import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [svelte()],
  // Svelte's browser build for tests that run in jsdom (rune stores, components),
  // so $effect behaves as it does in the app. Engine tests run in plain node.
  resolve: { conditions: ['browser'] },
  // how-to.md and style.css are still read from the Django app's ../static.
  server: { fs: { allow: ['..'] } },
  test: {
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
  },
});
