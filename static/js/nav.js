        document.addEventListener('DOMContentLoaded', function() {
            // "How to Use this App" footer link -> modal populated from static/how-to.md
            const howToLink = document.getElementById('howToLink');
            const howToModal = document.getElementById('howToModal');
            const howToBody = document.getElementById('howToBody');
            const howToClose = document.getElementById('howToClose');
            let howToLoaded = false;

            function openHowTo(e) {
                if (e) e.preventDefault();
                if (!howToModal) return;
                howToModal.style.display = 'block';
                howToModal.setAttribute('aria-hidden', 'false');
                if (howToLoaded) return;

                const url = howToLink ? howToLink.getAttribute('data-md-url') : null;
                if (!url) return;
                fetch(url)
                    .then(function(resp) {
                        if (!resp.ok) throw new Error('HTTP ' + resp.status);
                        return resp.text();
                    })
                    .then(function(md) {
                        if (window.marked && typeof window.marked.parse === 'function') {
                            howToBody.innerHTML = window.marked.parse(md);
                        } else {
                            const pre = document.createElement('pre');
                            pre.textContent = md;
                            howToBody.innerHTML = '';
                            howToBody.appendChild(pre);
                        }
                        howToLoaded = true;
                    })
                    .catch(function(err) {
                        howToBody.innerHTML = '<p>Sorry, the guide could not be loaded (' +
                            err.message + ').</p>';
                    });
            }

            function closeHowTo() {
                if (!howToModal) return;
                howToModal.style.display = 'none';
                howToModal.setAttribute('aria-hidden', 'true');
            }

            if (howToLink) howToLink.addEventListener('click', openHowTo);
            if (howToClose) {
                howToClose.addEventListener('click', closeHowTo);
                howToClose.addEventListener('keydown', function(e) {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); closeHowTo(); }
                });
            }
            if (howToModal) {
                howToModal.addEventListener('click', function(e) {
                    if (e.target === howToModal) closeHowTo();
                });
            }
            document.addEventListener('keydown', function(e) {
                if (e.key === 'Escape' && howToModal && howToModal.style.display === 'block') {
                    closeHowTo();
                }
            });

            const viewResultsNav = document.getElementById('viewResultsNav');
            if (viewResultsNav) {
                viewResultsNav.addEventListener('click', function(e) {
                    const simForm = document.getElementById('simulationForm');
                    if (simForm) {
                        e.preventDefault();
                        if (typeof simForm.requestSubmit === 'function') {
                            simForm.requestSubmit();
                        } else {
                            simForm.submit();
                        }
                    }
                });
            }
        });
