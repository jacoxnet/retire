// Apply the saved theme before the page paints. Loaded as a same-origin file in
// <head> because the Content-Security-Policy blocks inline scripts.
(function() {
    var savedTheme = localStorage.getItem('retire_theme') || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', savedTheme);
})();
