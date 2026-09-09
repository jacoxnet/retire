        document.addEventListener('DOMContentLoaded', function() {
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
