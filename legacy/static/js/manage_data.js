document.addEventListener('DOMContentLoaded', function() {
    // 1. Save Plan (JSON)
    const btnSaveJSON = document.getElementById('btnSaveJSON');
    if (btnSaveJSON) {
        btnSaveJSON.addEventListener('click', function() {
            const planScript = document.getElementById('current-plan-json');
            let planData = {};
            if (planScript) {
                try {
                    planData = JSON.parse(planScript.textContent);
                } catch (e) {
                    console.error('Error parsing plan data JSON:', e);
                }
            }
            const userName = (planData.user_name || 'retirement').toLowerCase().replace(/\s+/g, '_');
            const fileName = `${userName}_plan.json`;
            const jsonStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(planData, null, 4));
            
            const downloadAnchor = document.createElement('a');
            downloadAnchor.setAttribute("href", jsonStr);
            downloadAnchor.setAttribute("download", fileName);
            document.body.appendChild(downloadAnchor);
            downloadAnchor.click();
            downloadAnchor.remove();
        });
    }

    // 2. Load Plan (JSON)
    const btnTriggerLoad = document.getElementById('btnTriggerLoad');
    const jsonFileInput = document.getElementById('jsonFileInput');
    const loadPlanForm = document.getElementById('loadPlanForm');
    const loadPlanInput = document.getElementById('loadPlanInput');

    if (btnTriggerLoad && jsonFileInput) {
        btnTriggerLoad.addEventListener('click', function() {
            jsonFileInput.click();
        });

        jsonFileInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = function(event) {
                try {
                    const raw = JSON.parse(event.target.result);
                    if (typeof raw !== 'object' || raw === null) {
                        alert('Invalid JSON file format.');
                        return;
                    }
                    loadPlanInput.value = JSON.stringify(raw);
                    loadPlanForm.submit();
                } catch (err) {
                    alert('Error reading JSON file: ' + err.message);
                } finally {
                    jsonFileInput.value = '';
                }
            };
            reader.readAsText(file);
        });
    }
});
