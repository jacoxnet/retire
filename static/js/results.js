const chartConfig = JSON.parse(document.getElementById('chart-config-json')?.textContent || '{}');
const inflationRate = chartConfig.inflation_rate ?? 2.5;
const startYear = chartConfig.start_year ?? 2026;
const userStartAge = chartConfig.user_start_age ?? 60;

    // Client-side Nominal / Real scaling
    
    // Cache the nominal values on load to calculate real values accurately
    document.addEventListener('DOMContentLoaded', function() {
        // Find all cells with dollar-amount class
        const elements = document.querySelectorAll('.dollar-amount');
        elements.forEach(el => {
            const nominalVal = parseFloat(el.getAttribute('data-nominal'));
            
            // Find parent tr to find year index
            let tr = el.closest('tr');
            let yearIndex = 0;
            if (tr) {
                // Determine year index based on index in tbody or a specific row attribute
                // Let's search if there's a year index
                const yearIndexCell = tr.querySelector('td'); // usually the first td holds the year
                const year = parseInt(yearIndexCell ? yearIndexCell.textContent : 2026);
                yearIndex = Math.max(0, year - startYear);
            }
            
            // Check if element belongs to Ending Assets (end of year balance)
            const isEndingAsset = el.classList.contains('is-ending-asset') || !!el.closest('.ending-assets-group');
            const exp = isEndingAsset ? (yearIndex + 1) : yearIndex;
            
            // Calculate real value
            const realVal = nominalVal / Math.pow(1.0 + inflationRate / 100.0, exp);
            el.setAttribute('data-real', realVal.toFixed(2));
        });
        
        // Make sure it starts in nominal mode
        setDollarMode('nominal');
    });

    const currencyFormatter = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0
    });

    function setDollarMode(mode) {
        currentDollarMode = mode;
        // Toggle checkboxes / radios state
        const projNom = document.getElementById('proj_nominal');
        const cfNom = document.getElementById('cf_nominal');
        const chartNom = document.getElementById('chart_nominal');
        const projReal = document.getElementById('proj_real');
        const cfReal = document.getElementById('cf_real');
        const chartReal = document.getElementById('chart_real');

        if (mode === 'nominal') {
            if (projNom) projNom.checked = true;
            if (cfNom) cfNom.checked = true;
            if (chartNom) chartNom.checked = true;
        } else {
            if (projReal) projReal.checked = true;
            if (cfReal) cfReal.checked = true;
            if (chartReal) chartReal.checked = true;
        }
        
        const elements = document.querySelectorAll('.dollar-amount');
        elements.forEach(el => {
            const val = parseFloat(el.getAttribute('data-' + mode));
            if (val < 0) {
                el.textContent = '-' + currencyFormatter.format(Math.abs(val));
            } else {
                el.textContent = currencyFormatter.format(val);
            }
        });

        if (typeof updateChartsDollarMode === 'function') {
            updateChartsDollarMode(mode);
        }
    }

    // Global Chart Instances & Data Caches
    let currentDollarMode = 'nominal';
    let chartInstances = {};
    let modalChartInstance = null;

    const detRowsData = JSON.parse(document.getElementById('det-rows-json')?.textContent || '[]');
    const mcP10Data = JSON.parse(document.getElementById('mc-p10-json')?.textContent || '[]');
    const mcP50Data = JSON.parse(document.getElementById('mc-p50-json')?.textContent || '[]');
    const mcP90Data = JSON.parse(document.getElementById('mc-p90-json')?.textContent || '[]');
    const mcSpaghettiPaths = JSON.parse(document.getElementById('mc-spaghetti-json')?.textContent || '[]');
    const planData = JSON.parse(document.getElementById('plan-data-json')?.textContent || '{}');


    function formatChartCurrency(val) {
        if (isNaN(val)) return '$0';
        const absVal = Math.abs(val);
        if (absVal >= 1e6) {
            return (val < 0 ? '-' : '') + '$' + (absVal / 1e6).toFixed(2) + 'M';
        } else if (absVal >= 1e3) {
            return (val < 0 ? '-' : '') + '$' + (absVal / 1e3).toFixed(0) + 'K';
        }
        return (val < 0 ? '-' : '') + '$' + absVal.toLocaleString('en-US', { maximumFractionDigits: 0 });
    }

    function scaleVal(val, t) {
        if (currentDollarMode === 'real') {
            return val / Math.pow(1.0 + inflationRate / 100.0, t);
        }
        return val;
    }

    // Item 3B: Visual Milestone Markers on Projections
    function getMilestonesList() {
        const list = [];
        if (!detRowsData || detRowsData.length === 0) return list;

        const isMarried = Boolean(planData.is_married ?? chartConfig.is_married);
        const userRetAge = parseInt(planData.user_retirement_age ?? chartConfig.user_retirement_age);
        const spouseRetAge = isMarried ? parseInt(planData.spouse_retirement_age ?? chartConfig.spouse_retirement_age) : null;
        const userDeathAge = parseInt(planData.user_age_death ?? chartConfig.user_age_death);
        const spouseDeathAge = isMarried ? parseInt(planData.spouse_age_death ?? chartConfig.spouse_age_death) : null;

        const ss = planData.social_security || {};
        const userSsEntitled = (ss.user_future_entitled ?? ss.user_entitled ?? true) && !ss.user_receiving;
        const userSsAge = userSsEntitled ? parseInt(ss.user_start_age || chartConfig.user_ss_start_age || 67) : null;

        const spouseSsEntitled = isMarried && (ss.spouse_future_entitled ?? ss.spouse_entitled ?? false) && !ss.spouse_receiving;
        const spouseSsAge = spouseSsEntitled ? parseInt(ss.spouse_start_age || chartConfig.spouse_ss_start_age || 67) : null;

        const registered = new Set();

        // 1. Scan detRowsData for any engine milestones
        detRowsData.forEach((row, t) => {
            const uAge = row.user_age;
            const spAge = row.spouse_age;
            const rowMilestones = row.milestones || [];

            rowMilestones.forEach(m => {
                const mLower = m.toLowerCase();
                if (mLower.includes('you retire')) {
                    if (!registered.has('retire')) {
                        registered.add('retire');
                        list.push({ t, age: uAge, label: `🏁 Retire (${uAge})`, color: '#2563eb', priority: 1 });
                    }
                } else if (mLower.includes('spouse retires')) {
                    if (!registered.has('sp_retire')) {
                        registered.add('sp_retire');
                        list.push({ t, age: spAge, label: `🏁 Spouse Retires (${spAge})`, color: '#7c3aed', priority: 2 });
                    }
                } else if (mLower.includes('you claim ss')) {
                    if (!registered.has('ss')) {
                        registered.add('ss');
                        list.push({ t, age: uAge, label: `🏛️ SS (${uAge})`, color: '#059669', priority: 3 });
                    }
                } else if (mLower.includes('spouse claims ss')) {
                    if (!registered.has('sp_ss')) {
                        registered.add('sp_ss');
                        list.push({ t, age: spAge, label: `🏛️ Spouse SS (${spAge})`, color: '#0d9488', priority: 4 });
                    }
                } else if (mLower.includes('your rmds start') || (mLower.includes('rmd') && mLower.includes('your'))) {
                    if (!registered.has('rmd')) {
                        registered.add('rmd');
                        list.push({ t, age: uAge, label: `📜 RMDs (${uAge})`, color: '#d97706', priority: 5 });
                    }
                } else if (mLower.includes('spouse rmds start') || (mLower.includes('rmd') && mLower.includes('spouse'))) {
                    if (!registered.has('sp_rmd')) {
                        registered.add('sp_rmd');
                        list.push({ t, age: spAge, label: `📜 Spouse RMDs (${spAge})`, color: '#ea580c', priority: 6 });
                    }
                } else if (mLower.includes('spouse final year')) {
                    if (!registered.has('sp_death')) {
                        registered.add('sp_death');
                        list.push({ t, age: spAge, label: `⌛ Spouse Final (${spAge})`, color: '#64748b', priority: 7 });
                    }
                } else if (mLower.includes('your final year')) {
                    if (!registered.has('death')) {
                        registered.add('death');
                        list.push({ t, age: uAge, label: `⌛ Final Year (${uAge})`, color: '#475569', priority: 8 });
                    }
                }
            });
        });

        // 2. Fallbacks from user plan parameters if any were not flagged in detRowsData:
        if (!registered.has('retire') && userRetAge) {
            const t = detRowsData.findIndex(r => r.user_age === userRetAge);
            if (t !== -1) {
                registered.add('retire');
                list.push({ t, age: userRetAge, label: `🏁 Retire (${userRetAge})`, color: '#2563eb', priority: 1 });
            }
        }
        if (isMarried && !registered.has('sp_retire') && spouseRetAge) {
            const t = detRowsData.findIndex(r => r.spouse_age === spouseRetAge);
            if (t !== -1) {
                registered.add('sp_retire');
                list.push({ t, age: spouseRetAge, label: `🏁 Spouse Retires (${spouseRetAge})`, color: '#7c3aed', priority: 2 });
            }
        }
        if (!registered.has('ss') && userSsAge) {
            const t = detRowsData.findIndex(r => r.user_age === userSsAge);
            if (t !== -1) {
                registered.add('ss');
                list.push({ t, age: userSsAge, label: `🏛️ SS (${userSsAge})`, color: '#059669', priority: 3 });
            }
        }
        if (isMarried && !registered.has('sp_ss') && spouseSsAge) {
            const t = detRowsData.findIndex(r => r.spouse_age === spouseSsAge);
            if (t !== -1) {
                registered.add('sp_ss');
                list.push({ t, age: spouseSsAge, label: `🏛️ Spouse SS (${spouseSsAge})`, color: '#0d9488', priority: 4 });
            }
        }
        if (isMarried && !registered.has('sp_death') && spouseDeathAge) {
            const t = detRowsData.findIndex(r => r.spouse_age === spouseDeathAge);
            if (t !== -1) {
                registered.add('sp_death');
                list.push({ t, age: spouseDeathAge, label: `⌛ Spouse Final (${spouseDeathAge})`, color: '#64748b', priority: 7 });
            }
        }
        if (!registered.has('death') && userDeathAge) {
            const t = detRowsData.findIndex(r => r.user_age === userDeathAge);
            if (t !== -1) {
                registered.add('death');
                list.push({ t, age: userDeathAge, label: `⌛ Final Year (${userDeathAge})`, color: '#475569', priority: 8 });
            }
        }

        // Sort chronologically by year index t, then by priority
        list.sort((a, b) => a.t - b.t || a.priority - b.priority);
        return list;
    }

    const milestonePlugin = {
        id: 'milestonePlugin',
        afterDraw: function(chart) {
            // Milestone markers with styled label pills should only be displayed on the larger charts
            // shown when the user clicks the expansion button (#modalChartCanvas)
            if (!chart.canvas || chart.canvas.id !== 'modalChartCanvas') return;
            if (!chart.chartArea) return;
            const { ctx, chartArea: { top, bottom, left, right }, scales: { x } } = chart;
            if (!x || !chart.data || !chart.data.labels) return;

            const milestones = getMilestonesList();
            if (milestones.length === 0) return;

            const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
            const rendered = [];

            // Calculate x positions and dimensions
            milestones.forEach(m => {
                if (m.t < 0 || m.t >= chart.data.labels.length) return;
                const xPos = x.getPixelForValue(m.t);
                if (xPos < left - 10 || xPos > right + 10) return;

                ctx.save();
                ctx.font = '600 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
                const textWidth = ctx.measureText(m.label).width;
                ctx.restore();

                const pillW = textWidth + 12;
                const pillH = 17;
                rendered.push({
                    ...m,
                    xPos,
                    pillW,
                    pillH
                });
            });

            // Assign vertical staggering levels to prevent horizontal pill badge overlap
            const levels = [];
            rendered.forEach(item => {
                let pillX = item.xPos - (item.pillW / 2);
                if (pillX < left + 2) pillX = left + 2;
                if (pillX + item.pillW > right - 2) pillX = right - item.pillW - 2;
                item.pillX = pillX;

                let assignedLevel = 0;
                while (true) {
                    const occupied = levels[assignedLevel] || [];
                    const collides = occupied.some(interval => {
                        return !(pillX + item.pillW + 6 <= interval[0] || pillX >= interval[1] + 6);
                    });
                    if (!collides) {
                        occupied.push([pillX, pillX + item.pillW]);
                        levels[assignedLevel] = occupied;
                        item.level = assignedLevel;
                        break;
                    }
                    assignedLevel++;
                }
            });

            // Pass 1: Draw vertical dashed marker lines from top to bottom
            rendered.forEach(item => {
                ctx.save();
                ctx.beginPath();
                ctx.setLineDash([4, 4]);
                ctx.strokeStyle = item.color;
                ctx.lineWidth = 1.5;
                ctx.moveTo(item.xPos, top);
                ctx.lineTo(item.xPos, bottom);
                ctx.stroke();
                ctx.restore();
            });

            // Pass 2: Draw styled label pills over the marker lines
            rendered.forEach(item => {
                ctx.save();
                const pillY = top + 2 + (item.level * 19);

                // Connector line if staggered down
                if (item.level > 0) {
                    ctx.beginPath();
                    ctx.strokeStyle = item.color;
                    ctx.lineWidth = 1;
                    ctx.setLineDash([2, 2]);
                    ctx.moveTo(item.xPos, top);
                    ctx.lineTo(item.xPos, pillY);
                    ctx.stroke();
                }

                // High contrast background & border
                ctx.fillStyle = isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)';
                ctx.strokeStyle = item.color;
                ctx.lineWidth = 1.5;
                ctx.setLineDash([]);

                ctx.shadowColor = isDark ? 'rgba(0, 0, 0, 0.6)' : 'rgba(0, 0, 0, 0.12)';
                ctx.shadowBlur = 4;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 1;

                ctx.beginPath();
                if (typeof ctx.roundRect === 'function') {
                    ctx.roundRect(item.pillX, pillY, item.pillW, item.pillH, 4);
                } else {
                    ctx.rect(item.pillX, pillY, item.pillW, item.pillH);
                }
                ctx.fill();
                ctx.stroke();

                ctx.shadowColor = 'transparent';
                ctx.font = '600 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
                ctx.fillStyle = item.color;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(item.label, item.pillX + (item.pillW / 2), pillY + (item.pillH / 2));

                ctx.restore();
            });
        }
    };

    function initAllCharts() {
        initSpaghettiChart();
        initTrajectoryChart();
        initAssetBreakdownChart();
        initIncomeSpendingChart();
        initTaxLiabilityChart();
    }

    // Chart 1: Spaghetti Chart of Monte Carlo Runs
    function initSpaghettiChart() {
        const canvas = document.getElementById('spaghettiChartCanvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        if (chartInstances.spaghetti) {
            chartInstances.spaghetti.destroy();
        }

        const pathCount = parseInt(document.getElementById('spaghettiPathCount')?.value || 100);
        const selectedPaths = mcSpaghettiPaths.slice(0, pathCount);
        const years = selectedPaths.length > 0 ? selectedPaths[0].length : 0;
        const labels = Array.from({ length: years }, (_, t) => `Age ${userStartAge + t} (${startYear + t})`);

        const datasets = selectedPaths.map((path, idx) => {
            const hue = (idx * 137.5) % 360;
            return {
                label: `Run ${idx + 1}`,
                data: path.map((val, t) => scaleVal(val, t)),
                borderColor: `hsla(${hue}, 75%, 48%, 0.4)`,
                borderWidth: 1.2,
                pointRadius: 0,
                tension: 0.1,
                fill: false
            };
        });

        chartInstances.spaghetti = new Chart(ctx, {
            type: 'line',
            data: { labels, datasets },
            options: getChartOptions('Portfolio Wealth ($)', false)
        });
    }

    function updateSpaghettiChart() {
        initSpaghettiChart();
    }

    // Chart 2: Monte Carlo Wealth Trajectory
    function initTrajectoryChart() {
        const canvas = document.getElementById('trajectoryChartCanvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        if (chartInstances.trajectory) {
            chartInstances.trajectory.destroy();
        }

        const years = mcP50Data.length;
        const labels = Array.from({ length: years }, (_, t) => `Age ${userStartAge + t} (${startYear + t})`);

        chartInstances.trajectory = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: '90th Percentile (Optimistic)',
                        data: mcP90Data.map((v, t) => scaleVal(v, t)),
                        borderColor: '#10b981',
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        borderWidth: 2.5,
                        pointRadius: 1,
                        tension: 0.2
                    },
                    {
                        label: '50th Percentile (Median)',
                        data: mcP50Data.map((v, t) => scaleVal(v, t)),
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        borderWidth: 3,
                        pointRadius: 1,
                        tension: 0.2
                    },
                    {
                        label: '10th Percentile (Pessimistic)',
                        data: mcP10Data.map((v, t) => scaleVal(v, t)),
                        borderColor: '#ef4444',
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        borderWidth: 2.5,
                        pointRadius: 1,
                        tension: 0.2
                    }
                ]
            },
            options: getChartOptions('Portfolio Wealth ($)', true)
        });
    }

    // Chart 3: Stacked Asset Class Breakdown
    function initAssetBreakdownChart() {
        const canvas = document.getElementById('assetBreakdownChartCanvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        if (chartInstances.assetBreakdown) {
            chartInstances.assetBreakdown.destroy();
        }

        const labels = detRowsData.map((r, t) => `Age ${r.user_age || (userStartAge + t)} (${r.year || (startYear + t)})`);

        chartInstances.assetBreakdown = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Pretax Assets (IRA/401k)',
                        data: detRowsData.map((r, t) => scaleVal(r.ending_assets.pretax || 0, t + 1)),
                        backgroundColor: 'rgba(230, 57, 70, 0.75)',
                        borderColor: '#e63946',
                        borderWidth: 1.5,
                        fill: 'origin',
                        pointRadius: 0,
                        tension: 0.2
                    },
                    {
                        label: 'Roth Assets (Roth IRA/401k)',
                        data: detRowsData.map((r, t) => scaleVal(r.ending_assets.roth || 0, t + 1)),
                        backgroundColor: 'rgba(255, 183, 3, 0.75)',
                        borderColor: '#ffb703',
                        borderWidth: 1.5,
                        fill: '-1',
                        pointRadius: 0,
                        tension: 0.2
                    },
                    {
                        label: 'Taxable Assets (Brokerage/Cash)',
                        data: detRowsData.map((r, t) => scaleVal(r.ending_assets.taxable || 0, t + 1)),
                        backgroundColor: 'rgba(33, 158, 188, 0.75)',
                        borderColor: '#219ebc',
                        borderWidth: 1.5,
                        fill: '-1',
                        pointRadius: 0,
                        tension: 0.2
                    },
                    {
                        label: 'HSA Assets (Health Savings)',
                        data: detRowsData.map((r, t) => scaleVal(r.ending_assets.hsa || 0, t + 1)),
                        backgroundColor: 'rgba(42, 157, 143, 0.75)',
                        borderColor: '#2a9d8f',
                        borderWidth: 1.5,
                        fill: '-1',
                        pointRadius: 0,
                        tension: 0.2
                    }
                ]
            },
            options: getChartOptions('Total Assets ($)', true, true)
        });
    }

    // Chart 4: Annual Income vs. Spending Sources
    function initIncomeSpendingChart() {
        const canvas = document.getElementById('incomeSpendingChartCanvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        if (chartInstances.incomeSpending) {
            chartInstances.incomeSpending.destroy();
        }

        const labels = detRowsData.map((r, t) => `Age ${r.user_age || (userStartAge + t)} (${r.year || (startYear + t)})`);

        const ssVals = [];
        const pensionVals = [];
        const withdrawalVals = [];
        const desiredSpendVals = [];
        const addSpendVals = [];
        const taxVals = [];

        const planData = JSON.parse(document.getElementById('plan-data-json')?.textContent || '{}');
        const ssNames = (planData.income_sources || []).filter(s => s.is_social_security).map(s => s.name.trim().toLowerCase());

        detRowsData.forEach((r, t) => {
            let ssSum = 0;
            let pensionSum = 0;
            const incBk = r.income_breakdown || {};
            Object.keys(incBk).forEach(name => {
                const amt = incBk[name] || 0;
                const cleanName = name.trim().toLowerCase();
                if (ssNames.includes(cleanName) || cleanName.includes('social security') || cleanName.includes('ss')) {
                    ssSum += amt;
                } else {
                    pensionSum += amt;
                }
            });

            ssVals.push(scaleVal(ssSum, t));
            pensionVals.push(scaleVal(pensionSum, t));
            withdrawalVals.push(scaleVal(r.withdrawals.total || 0, t));

            desiredSpendVals.push(scaleVal(r.desired_spending || 0, t));
            addSpendVals.push(scaleVal(r.additional_spending || 0, t));
            taxVals.push(scaleVal(r.taxes || 0, t));
        });

        chartInstances.incomeSpending = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    // Inflows Stack
                    { label: 'Social Security', data: ssVals, backgroundColor: '#06d6a0', stack: 'Inflows' },
                    { label: 'Pensions & Other Income', data: pensionVals, backgroundColor: '#118ab2', stack: 'Inflows' },
                    { label: 'Portfolio Withdrawals', data: withdrawalVals, backgroundColor: '#8338ec', stack: 'Inflows' },
                    // Outflows Stack
                    { label: 'Regular Spending', data: desiredSpendVals, backgroundColor: '#ff4d6d', stack: 'Outflows' },
                    { label: 'Additional Spending', data: addSpendVals, backgroundColor: '#ffb703', stack: 'Outflows' },
                    { label: 'Taxes & Penalties', data: taxVals, backgroundColor: '#c1121f', stack: 'Outflows' }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: { top: 25, right: 12 } },
                events: ['click', 'touchstart'],
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: true, position: 'top', labels: { boxWidth: 12, font: { size: 11 } } },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `${context.dataset.label}: ${formatChartCurrency(context.raw)}`;
                            }
                        }
                    }
                },
                scales: {
                    x: { stacked: true, grid: { display: false } },
                    y: {
                        stacked: true,
                        grace: '8%',
                        ticks: { callback: value => formatChartCurrency(value) },
                        title: { display: true, text: 'Annual Cash Flow ($)' }
                    }
                }
            }
        });
    }

    // Chart 5: Lifetime Tax Liability & "The Tax Bomb"
    function initTaxLiabilityChart() {
        const canvas = document.getElementById('taxLiabilityChartCanvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        if (chartInstances.taxLiability) {
            chartInstances.taxLiability.destroy();
        }

        const labels = detRowsData.map((r, t) => `Age ${r.user_age || (userStartAge + t)} (${r.year})`);
        const taxVals = detRowsData.map((r, t) => scaleVal(r.taxes || 0, t));

        const barColors = detRowsData.map(r => {
            const hasRmdMilestone = (r.milestones || []).some(m => m.toLowerCase().includes('rmd'));
            return hasRmdMilestone ? '#ffb703' : '#d90429';
        });

        chartInstances.taxLiability = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Taxes Paid',
                    data: taxVals,
                    backgroundColor: barColors,
                    borderColor: '#a0001c',
                    borderWidth: 1,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: { top: 25, right: 12 } },
                events: ['click', 'touchstart'],
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const idx = context.dataIndex;
                                const row = detRowsData[idx];
                                let label = `Taxes Paid: ${formatChartCurrency(context.raw)}`;
                                if (row && row.milestones && row.milestones.length > 0) {
                                    label += ` (${row.milestones.join(', ')})`;
                                }
                                return label;
                            }
                        }
                    }
                },
                scales: {
                    x: { grid: { display: false } },
                    y: {
                        grace: '8%',
                        ticks: { callback: value => formatChartCurrency(value) },
                        title: { display: true, text: 'Annual Tax Liability ($)' }
                    }
                }
            }
        });
    }

    function getChartOptions(yAxisTitle, showLegend = true, stacked = false) {
        return {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: { top: 25, right: 12 }
            },
            events: ['click', 'touchstart'],
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: showLegend, position: 'top', labels: { boxWidth: 12, font: { size: 11 } } },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${context.dataset.label}: ${formatChartCurrency(context.raw)}`;
                        }
                    }
                }
            },
            scales: {
                x: { grid: { display: false } },
                y: {
                    stacked: stacked,
                    grace: '8%',
                    ticks: { callback: value => formatChartCurrency(value) },
                    title: { display: true, text: yAxisTitle }
                }
            }
        };
    }

    function updateChartsDollarMode(mode) {
        currentDollarMode = mode;
        initAllCharts();
    }

    function expandChart(chartType, title) {
        const modalTitleEl = document.getElementById('chartModalLabel');
        if (modalTitleEl) modalTitleEl.textContent = title;

        const modalCanvas = document.getElementById('modalChartCanvas');
        if (!modalCanvas) return;
        const modalCtx = modalCanvas.getContext('2d');

        if (modalChartInstance) {
            modalChartInstance.destroy();
        }

        const sourceChart = chartInstances[chartType];
        if (!sourceChart) return;

        modalChartInstance = new Chart(modalCtx, {
            type: sourceChart.config.type,
            data: JSON.parse(JSON.stringify(sourceChart.config.data)),
            options: {
                ...sourceChart.config.options,
                maintainAspectRatio: false,
                events: ['click', 'touchstart'],
                plugins: {
                    ...sourceChart.config.options.plugins,
                    legend: {
                        ...sourceChart.config.options.plugins?.legend,
                        labels: { boxWidth: 14, font: { size: 13 } }
                    }
                }
            },
            plugins: [milestonePlugin]
        });

        const modalEl = document.getElementById('chartModal');
        if (modalEl) {
            if (!modalEl.dataset.resizeBound) {
                modalEl.dataset.resizeBound = 'true';
                modalEl.addEventListener('shown.bs.modal', function () {
                    if (modalChartInstance) {
                        modalChartInstance.resize();
                        modalChartInstance.update();
                    }
                });
            }
            const bsModal = bootstrap.Modal.getOrCreateInstance(modalEl);
            bsModal.show();
        }
    }

    // Item 2E: Stale Results Tracker (No Dimming on Results Card)
    function setupStaleResultsTracker() {
        const form = document.getElementById('resultsInputsForm');
        const banner = document.getElementById('staleResultsBanner');
        if (!form || !banner) return;

        const initialValues = {};
        const inputs = form.querySelectorAll('input, select');
        inputs.forEach(inp => {
            if (inp.type === 'radio') {
                if (inp.checked) initialValues[inp.name] = inp.value;
            } else if (inp.name) {
                initialValues[inp.name] = inp.value;
            }
        });

        function checkStale() {
            let isModified = false;
            inputs.forEach(inp => {
                if (inp.type === 'radio') {
                    if (inp.checked && initialValues[inp.name] !== inp.value) {
                        isModified = true;
                    }
                } else if (inp.name && inp.value !== initialValues[inp.name]) {
                    isModified = true;
                }
            });

            const submitBtns = form.querySelectorAll('button[type="submit"]');
            if (isModified) {
                banner.classList.remove('d-none');
                banner.classList.add('d-flex');
                submitBtns.forEach(b => b.classList.add('btn-rerun-highlight'));
            } else {
                banner.classList.add('d-none');
                banner.classList.remove('d-flex');
                submitBtns.forEach(b => b.classList.remove('btn-rerun-highlight'));
            }
        }

        form.addEventListener('input', checkStale);
        form.addEventListener('change', checkStale);
    }

    document.addEventListener('DOMContentLoaded', function() {
        const chartsTabBtn = document.getElementById('charts-tab');
        if (chartsTabBtn) {
            chartsTabBtn.addEventListener('shown.bs.tab', function () {
                initAllCharts();
            });
        }

        setTimeout(initAllCharts, 150);
        setupStaleResultsTracker();
    });

    // ==========================================
    // TAB 5: HISTORICAL STRESS TEST JAVASCRIPT
    // ==========================================
    let stressComparisonChartInstance = null;

    function formatStressCurrency(val) {
        if (val === null || val === undefined || isNaN(val)) return '$0';
        const num = Math.round(Number(val));
        const absNum = Math.abs(num);
        const sign = num < 0 ? '-' : '';
        return sign + '$' + absNum.toLocaleString('en-US');
    }

    function formatStressDeltaCurrency(val) {
        if (val === null || val === undefined || isNaN(val)) return '$0';
        const num = Math.round(Number(val));
        const sign = num > 0 ? '+' : (num < 0 ? '-' : '');
        const absNum = Math.abs(num);
        return sign + '$' + absNum.toLocaleString('en-US');
    }

    function formatStressDeltaPercent(val) {
        if (val === null || val === undefined || isNaN(val)) return '0.0%';
        const num = Number(val);
        const sign = num > 0 ? '+' : '';
        return sign + num.toFixed(1) + '%';
    }

    function updateStressComparisonView(data) {
        if (!data) return;

        const reg = data.regular_results || {};
        const stress = data.stress_results || {};
        const deltas = data.deltas || {};
        const scenario = data.scenario || {};

        // 1. Scenario Callout
        const badgeEl = document.getElementById('stressScenarioBadge');
        const titleEl = document.getElementById('stressScenarioTitle');
        const durEl = document.getElementById('stressScenarioDurationBadge');
        const textEl = document.getElementById('stressScenarioText');
        const timelineEl = document.getElementById('stressTimelineText');

        if (badgeEl) badgeEl.textContent = scenario.badge || scenario.key;
        if (titleEl) titleEl.textContent = scenario.name || scenario.short_name || 'Crisis Scenario';
        if (durEl) durEl.textContent = `${data.crisis_length || scenario.length || 10} Years Duration`;
        if (textEl) textEl.textContent = scenario.description || '';
        if (timelineEl) {
            timelineEl.textContent = `${data.crisis_start_year}–${data.crisis_end_year} (${data.crisis_length} years)`;
        }

        // 2. Key Highlights (Success Rates & Spending)
        const regSuccessEl = document.getElementById('cmpRegularSuccess');
        const stressSuccessEl = document.getElementById('cmpStressSuccess');
        const deltaSuccessEl = document.getElementById('cmpDeltaSuccess');
        const desiredSpendingEl = document.getElementById('cmpDesiredSpending');
        const stressBoxEl = document.getElementById('cmpStressSuccessBox');

        if (regSuccessEl) regSuccessEl.textContent = `${(reg.run_success || 0).toFixed(1)}%`;
        if (stressSuccessEl) stressSuccessEl.textContent = `${(stress.run_success || 0).toFixed(1)}%`;
        if (desiredSpendingEl) desiredSpendingEl.textContent = formatStressCurrency(data.desired_spending);

        if (deltaSuccessEl) {
            const dSuccess = deltas.delta_success || 0;
            deltaSuccessEl.textContent = `${formatStressDeltaPercent(dSuccess)} vs Regular Sim`;
            deltaSuccessEl.className = dSuccess >= 0 ? 'mt-1 small fw-bold text-success' : 'mt-1 small fw-bold text-danger';
        }

        if (stressBoxEl) {
            const sRate = stress.run_success || 0;
            stressBoxEl.className = sRate >= 80.0
                ? 'alert alert-success border h-100 py-3 mb-0'
                : (sRate >= 60.0 ? 'alert alert-warning border h-100 py-3 mb-0' : 'alert alert-danger border h-100 py-3 mb-0');
        }

        // 3. Ending Wealth Percentiles Comparison Table
        function setCell(id, text, isPositiveGood, deltaVal) {
            const el = document.getElementById(id);
            if (!el) return;
            el.textContent = text;
            if (deltaVal !== undefined) {
                el.className = 'text-end fw-bold ' + (deltaVal >= 0 ? 'text-success' : 'text-danger');
            }
        }

        setCell('cmpRegMean', formatStressCurrency(reg.run_mean));
        setCell('cmpStressMean', formatStressCurrency(stress.run_mean));
        setCell('cmpDeltaMean', formatStressDeltaCurrency(deltas.delta_mean), true, deltas.delta_mean);

        setCell('cmpRegMedian', formatStressCurrency(reg.run_median));
        setCell('cmpStressMedian', formatStressCurrency(stress.run_median));
        setCell('cmpDeltaMedian', formatStressDeltaCurrency(deltas.delta_median), true, deltas.delta_median);

        setCell('cmpRegP25', formatStressCurrency(reg.run_25));
        setCell('cmpStressP25', formatStressCurrency(stress.run_25));
        setCell('cmpDeltaP25', formatStressDeltaCurrency(deltas.delta_25), true, deltas.delta_25);

        setCell('cmpRegP10', formatStressCurrency(reg.run_10));
        setCell('cmpStressP10', formatStressCurrency(stress.run_10));
        setCell('cmpDeltaP10', formatStressDeltaCurrency(deltas.delta_10), true, deltas.delta_10);

        setCell('cmpRegMax', formatStressCurrency(reg.run_max));
        setCell('cmpStressMax', formatStressCurrency(stress.run_max));
        setCell('cmpDeltaMax', formatStressDeltaCurrency(deltas.delta_max), true, deltas.delta_max);

        setCell('cmpRegMin', formatStressCurrency(reg.run_min));
        setCell('cmpStressMin', formatStressCurrency(stress.run_min));
        setCell('cmpDeltaMin', formatStressDeltaCurrency(deltas.delta_min), true, deltas.delta_min);
    }

    function fetchStressTest() {
        const scenarioSelect = document.getElementById('stressScenarioSelect');
        const allocationSelect = document.getElementById('stressAllocationSelect');
        const timingSelect = document.getElementById('stressTimingSelect');

        const params = new URLSearchParams();
        params.append('scenario_key', scenarioSelect ? scenarioSelect.value : '2000_dotcom');
        params.append('asset_allocation', allocationSelect ? allocationSelect.value : 'matched');
        params.append('crisis_timing', timingSelect ? timingSelect.value : 'retirement');

        fetch('/api/stress_test/?' + params.toString())
            .then(res => res.json())
            .then(data => {
                updateStressComparisonView(data);
            })
            .catch(err => console.error('Error fetching stress test comparison data:', err));
    }

    // Attach listeners on load
    document.addEventListener('DOMContentLoaded', function() {
        // Initial data load
        const stressScript = document.getElementById('initial-stress-test-data');
        let initialStress = null;
        if (stressScript) {
            try {
                initialStress = JSON.parse(stressScript.textContent);
            } catch(e) {
                console.error(e);
            }
        }
        if (initialStress) {
            updateStressComparisonView(initialStress);
        }

        const scenarioSelect = document.getElementById('stressScenarioSelect');
        const allocationSelect = document.getElementById('stressAllocationSelect');
        const timingSelect = document.getElementById('stressTimingSelect');

        if (scenarioSelect) {
            scenarioSelect.addEventListener('change', function() {
                fetchStressTest();
            });
        }

        if (allocationSelect) {
            allocationSelect.addEventListener('change', function() {
                fetchStressTest();
            });
        }

        if (timingSelect) {
            timingSelect.addEventListener('change', function() {
                fetchStressTest();
            });
        }
    });

    // Save Plan (JSON)
    const btnExportJSON = document.getElementById('btnExportJSON');
    if (btnExportJSON) {
        btnExportJSON.addEventListener('click', function() {
            var rawScript = document.getElementById('plan-data-json');
            var dataBlock = rawScript ? JSON.parse(rawScript.textContent) : {};
            var jsonString = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(dataBlock, null, 4));
            var downloadAnchor = document.createElement('a');
            downloadAnchor.setAttribute("href", jsonString);
            downloadAnchor.setAttribute("download", (dataBlock.user_name || "retirement").toLowerCase().replace(/\s+/g, '_') + "_plan.json");
            document.body.appendChild(downloadAnchor);
            downloadAnchor.click();
        });
    }

    // Toggle target success rate field visibility in Results mode selector
    function toggleResultsModeFields() {
        const resultsGoalRadio = document.getElementById('results_sim_type_goal');
        const resultsTargetGroup = document.getElementById('results_target_success_group');
        if (resultsGoalRadio && resultsGoalRadio.checked) {
            if (resultsTargetGroup) resultsTargetGroup.style.display = 'block';
        } else if (resultsTargetGroup) {
            resultsTargetGroup.style.display = 'none';
        }
    }

    // Percentage Input Formatting & Parsing Utilities
    function parsePercent(val) {
        if (typeof val === 'number') return isNaN(val) ? 0 : val;
        if (!val) return 0;
        var cleaned = val.toString().replace(/[%,\s]/g, '').trim();
        var num = parseFloat(cleaned);
        return isNaN(num) ? 0 : num;
    }

    function formatPercent(val) {
        if (val === null || val === undefined || val === '') return '';
        var str = val.toString().replace(/[^0-9.-]/g, '');
        if (!str || str === '-') return str ? str + '%' : '';
        var parts = str.split('.');
        var intPart = parts[0] || '0';
        var decPart = parts.length > 1 ? parts.slice(1).join('') : null;
        var result = intPart;
        if (decPart !== null) {
            result += '.' + decPart;
        }
        return result + '%';
    }

    function formatPercentInput(el) {
        var rawValue = el.value;
        if (rawValue === '' || rawValue === null || rawValue === undefined) return;
        var selStart = el.selectionStart || 0;
        var digitsBeforeCursor = (rawValue.substring(0, selStart).match(/[0-9.-]/g) || []).length;
        var formatted = formatPercent(rawValue);
        el.value = formatted;
        if (typeof el.setSelectionRange === 'function' && document.activeElement === el) {
            var newPos = 0;
            var digitsFound = 0;
            for (var i = 0; i < formatted.length; i++) {
                if (/[0-9.-]/.test(formatted[i])) {
                    digitsFound++;
                }
                if (digitsFound >= digitsBeforeCursor) {
                    newPos = i + 1;
                    break;
                }
            }
            var pctIdx = formatted.indexOf('%');
            if (pctIdx !== -1 && newPos > pctIdx) {
                newPos = pctIdx;
            }
            el.setSelectionRange(newPos, newPos);
        }
    }

    function attachPercentInputListeners(el) {
        if (!el || el.dataset.percentBound === 'true') return;
        el.dataset.percentBound = 'true';
        if (el.value && !el.value.endsWith('%')) {
            el.value = formatPercent(el.value);
        }
        el.addEventListener('input', function() {
            formatPercentInput(this);
        });
        el.addEventListener('keydown', function(e) {
            if (e.key === 'Backspace') {
                var start = this.selectionStart;
                var end = this.selectionEnd;
                if (start === end && start > 0 && this.value[start - 1] === '%') {
                    e.preventDefault();
                    var val = this.value;
                    this.value = val.substring(0, start - 2) + val.substring(start - 1);
                    formatPercentInput(this);
                }
            }
        });
        el.addEventListener('blur', function() {
            if (this.value.trim() === '%' || this.value.trim() === '') {
                this.value = '';
            } else if (this.value) {
                this.value = formatPercent(this.value);
            }
        });
    }

    document.addEventListener('DOMContentLoaded', function() {
        // Toggle Target Success Rate field visibility in Results mode selector
        const resultsRegRadio = document.getElementById('results_sim_type_regular');
        const resultsGoalRadio = document.getElementById('results_sim_type_goal');

        if (resultsRegRadio && resultsGoalRadio) {
            resultsRegRadio.addEventListener('change', toggleResultsModeFields);
            resultsGoalRadio.addEventListener('change', toggleResultsModeFields);
            toggleResultsModeFields();
        }

        document.querySelectorAll('.percent-input').forEach(function(el) {
            attachPercentInputListeners(el);
            if (el.value) {
                el.value = formatPercent(el.value);
            }
        });

        // Sync Range Sliders and Number Inputs
        document.querySelectorAll('.range-sync').forEach(function(rangeEl) {
            rangeEl.addEventListener('input', function() {
                const numId = this.getAttribute('data-num');
                const numEl = document.getElementById(numId);
                if (numEl) {
                    numEl.value = this.value;
                }
            });
        });

        document.querySelectorAll('.num-sync').forEach(function(numEl) {
            numEl.addEventListener('input', function() {
                const rangeId = this.getAttribute('data-range');
                const rangeEl = document.getElementById(rangeId);
                if (rangeEl) {
                    rangeEl.value = this.value;
                }
            });
        });

        // Stepper - / + Buttons
        document.querySelectorAll('.btn-step').forEach(function(btn) {
            btn.addEventListener('click', function() {
                const targetId = this.getAttribute('data-target');
                const stepVal = parseFloat(this.getAttribute('data-step') || 1);
                const numEl = document.getElementById(targetId);
                if (numEl) {
                    let current = parseFloat(numEl.value) || 0;
                    let min = numEl.hasAttribute('min') ? parseFloat(numEl.getAttribute('min')) : -Infinity;
                    let max = numEl.hasAttribute('max') ? parseFloat(numEl.getAttribute('max')) : Infinity;
                    let stepDecimal = (stepVal.toString().split('.')[1] || '').length;
                    
                    let newVal = current + stepVal;
                    newVal = Math.min(max, Math.max(min, newVal));
                    numEl.value = newVal.toFixed(stepDecimal);
                    
                    // Sync slider
                    const rangeId = numEl.getAttribute('data-range');
                    const rangeEl = document.getElementById(rangeId);
                    if (rangeEl) {
                        rangeEl.value = numEl.value;
                    }
                }
            });
        });

        // Validate inputs on form submit
        const resultsForm = document.getElementById('resultsInputsForm');
        const resultsGoalRadioEl = document.getElementById('results_sim_type_goal');
        const resultsTargetInputEl = document.getElementById('results_target_success_rate');
        const resultsRunsInputEl = document.getElementById('input_runs');

        if (resultsForm) {
            resultsForm.addEventListener('submit', function(e) {
                let hasError = false;

                if (resultsRunsInputEl) {
                    const rVal = parseInt(resultsRunsInputEl.value, 10);
                    if (isNaN(rVal) || rVal < 1 || rVal > 100000) {
                        e.preventDefault();
                        resultsRunsInputEl.classList.add('is-invalid');
                        resultsRunsInputEl.focus();
                        hasError = true;
                    } else {
                        resultsRunsInputEl.classList.remove('is-invalid');
                    }
                }

                if (!hasError && resultsGoalRadioEl && resultsGoalRadioEl.checked && resultsTargetInputEl) {
                    const val = parsePercent(resultsTargetInputEl.value);
                    if (isNaN(val) || val < 1.0 || val > 99.0) {
                        e.preventDefault();
                        resultsTargetInputEl.classList.add('is-invalid');
                        resultsTargetInputEl.focus();
                        hasError = true;
                    } else {
                        resultsTargetInputEl.classList.remove('is-invalid');
                    }
                }

                if (hasError) {
                    return false;
                }
            });

            if (resultsRunsInputEl) {
                resultsRunsInputEl.addEventListener('input', function() {
                    this.classList.remove('is-invalid');
                });
            }

            if (resultsTargetInputEl) {
                resultsTargetInputEl.addEventListener('input', function() {
                    this.classList.remove('is-invalid');
                });
            }
        }
    });

// Deterministic Projection / Cash Flow tables: position hover tooltips with
// position: fixed so they are not clipped by the scrollable .table-container
// and appear in front of the sticky table header.
document.addEventListener('DOMContentLoaded', function() {
    const GAP = 8;
    const MARGIN = 4;
    let active = null;

    function place(trigger, tip) {
        tip.classList.add('tooltip-fixed');
        tip.classList.remove('tooltip-below');
        const r = trigger.getBoundingClientRect();
        const w = tip.offsetWidth;
        const h = tip.offsetHeight;
        const vw = document.documentElement.clientWidth;
        const vh = document.documentElement.clientHeight;

        let left = tip.classList.contains('tooltip-content-right-align')
            ? r.right - w
            : r.left + r.width / 2 - w / 2;
        left = Math.max(MARGIN, Math.min(left, vw - w - MARGIN));

        let top = r.top - h - GAP;
        if (top < MARGIN && r.bottom + GAP + h <= vh - MARGIN) {
            top = r.bottom + GAP;
            tip.classList.add('tooltip-below');
        }
        // setProperty with 'important' so .tooltip-content-right-align's
        // !important left/right rules don't override the computed position.
        tip.style.setProperty('left', left + 'px', 'important');
        tip.style.setProperty('right', 'auto', 'important');
        tip.style.top = top + 'px';
    }

    function reset(tip) {
        tip.classList.remove('tooltip-fixed', 'tooltip-below');
        tip.style.removeProperty('left');
        tip.style.removeProperty('right');
        tip.style.top = '';
    }

    document.querySelectorAll('#projection .tooltip-trigger, #cashflow .tooltip-trigger').forEach(trigger => {
        const tip = trigger.querySelector('.tooltip-content');
        if (!tip) return;
        trigger.addEventListener('mouseenter', () => {
            active = { trigger, tip };
            place(trigger, tip);
        });
        trigger.addEventListener('mouseleave', () => {
            if (active && active.tip === tip) active = null;
            reset(tip);
        });
    });

    const reposition = () => { if (active) place(active.trigger, active.tip); };
    window.addEventListener('scroll', reposition, { passive: true, capture: true });
    window.addEventListener('resize', reposition);
});
