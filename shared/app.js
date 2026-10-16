(function() {
    const cfg = PAGE_CONFIGS[CURRENT_PAGE];
    const { etfData, fixedColors, storagePrefix, defaultParams, displayMax, hasHistoryTable, defaultWindowDays } = cfg;

    document.getElementById('currentDate').textContent = new Date().toLocaleDateString('zh-CN', {year:'numeric', month:'long', day:'numeric'});

    let params = loadParams(storagePrefix, defaultParams);

    function syncParamsToUI() {
        document.getElementById('setWindowDays').value = params.windowDays;
        document.getElementById('setAnnualDays').value = params.annualDays;
    }
    syncParamsToUI();

    window.saveParams = function() {
        params.windowDays = parseInt(document.getElementById('setWindowDays').value) || defaultWindowDays;
        params.annualDays = parseInt(document.getElementById('setAnnualDays').value) || 250;
        saveParamsFn(storagePrefix, params);
    };

    const chartCfg = { etfData, fixedColors, storagePrefix, displayMax };

    window.clearHistory = function() {
        clearHistory(storagePrefix,
            (hi) => drawRankChart({ ...chartCfg, _highlightIndex: hi }),
            hasHistoryTable ? () => renderHistoryTable(etfData, storagePrefix) : null
        );
    };

    async function initApp() {
        syncParamsToUI();
        try {
            const unified = await loadUnifiedData();
            const myPrices = extractMyPrices(etfData, unified.prices);
            const allDates = unified.dates;

            updateDataAsOf(unified, allDates);
            
            // 从文件同步历史数据到 localStorage
            const allHistory = await loadRankHistory();
            const historyKey = storagePrefix + 'rank_history';
            if (allHistory[historyKey] && allHistory[historyKey].length > 0) {
                localStorage.setItem(historyKey, JSON.stringify(allHistory[historyKey]));
            }
            
            await generateInitialHistory(
                { windowDays: params.windowDays, annualDays: params.annualDays },
                etfData, myPrices, allDates, storagePrefix
            );

            const results = computeRankings(etfData, myPrices, { windowDays: params.windowDays, annualDays: params.annualDays });
            renderResults(results, etfData);

            if (needsTodayUpdate(storagePrefix, allDates)) {
                updateHistory(storagePrefix, results, etfData, allDates);
            }

            await drawRankChart({ ...chartCfg, _highlightIndex: -1 });
            if (hasHistoryTable) await renderHistoryTable(etfData, storagePrefix);
            
            // 初始化合动量走势图
            await drawMomentumChart(etfData, storagePrefix, fixedColors, 'all');
            setupMomentumChartInteraction(etfData, storagePrefix, fixedColors);
            
            // 时间范围按钮事件
            document.querySelectorAll('.time-btn').forEach(btn => {
                btn.addEventListener('click', async function() {
                    document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active'));
                    this.classList.add('active');
                    const range = this.dataset.range;
                    await drawMomentumChart(etfData, storagePrefix, fixedColors, range);
                });
            });
        } catch (e) {
            alert('初始化失败: ' + e.message);
            console.error(e);
        }
    }

    window.calcMomentum = async function() {
        try {
            const unified = await loadUnifiedData();
            const myPrices = extractMyPrices(etfData, unified.prices);
            const allDates = unified.dates;

            updateDataAsOf(unified, allDates);

            const results = computeRankings(etfData, myPrices, { windowDays: params.windowDays, annualDays: params.annualDays });
            renderResults(results, etfData);

            updateHistory(storagePrefix, results, etfData, allDates);
            await drawRankChart({ ...chartCfg, _highlightIndex: -1 });
            if (hasHistoryTable) await renderHistoryTable(etfData, storagePrefix);
            await drawMomentumChart(etfData, storagePrefix, fixedColors, currentRange);
        } catch (e) {
            alert('加载数据失败: ' + e.message);
            console.error(e);
        }
    };

    setupChartInteraction(chartCfg);
    initApp();
})();
