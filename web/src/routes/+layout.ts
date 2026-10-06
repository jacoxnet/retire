// Everything runs in the browser: the plan lives in localStorage, so pages are
// prerendered as empty shells and rendered client-side.
export const prerender = true;
export const ssr = false;
export const trailingSlash = 'always';
