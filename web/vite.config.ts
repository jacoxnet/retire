import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

// GitHub Pages serves a project site under /<repo>; the deploy workflow sets BASE_PATH.
const base = (process.env.BASE_PATH ?? '') as '' | `/${string}`;

export default defineConfig({
  plugins: [
    sveltekit({
      adapter: adapter({ pages: 'build', assets: 'build', strict: true }),
      paths: { base },
    }),
  ],
  server: {
    // The shared stylesheet and how-to guide still live in the Django app's static/
    // folder (imported from ../static) until Django is removed in phase 7.
    fs: { allow: ['..'] },
  },
});
