const DATA_FILE = 'data/prices.json';
const RANK_HISTORY_FILE = 'data/rank_history.json';

async function loadUnifiedData() {
    const timestamp = new Date().getTime();
    const response = await fetch(DATA_FILE + '?t=' + timestamp);
    if (!response.ok) throw new Error('加载数据失败，请确认 data/prices.json 存在');
    return await response.json();
}

async function loadRankHistory() {
    try {
        const timestamp = new Date().getTime();
        const response = await fetch(RANK_HISTORY_FILE + '?t=' + timestamp);
        if (!response.ok) return {};
        return await response.json();
    } catch (e) {
        return {};
    }
}

function calcScore(prices, windowDays, annualDays) {
    if (!prices || prices.length < windowDays) return { score: 0, r2: 0, annualReturn: 0 };
    const recent = prices.slice(-windowDays);
    const y = recent.map(p => Math.log(p));
    const x = Array.from({ length: y.length }, (_, i) => i);

    const n = y.length;
    const xMean = x.reduce((s, v) => s + v, 0) / n;
    const yMean = y.reduce((s, v) => s + v, 0) / n;
    let SS_xy = 0, SS_xx = 0, SS_yy = 0;
    for (let i = 0; i < n; i++) {
        SS_xy += (x[i] - xMean) * (y[i] - yMean);
        SS_xx += (x[i] - xMean) ** 2;
        SS_yy += (y[i] - yMean) ** 2;
    }
    if (SS_xx === 0 || SS_yy === 0) return { score: 0, r2: 0, annualReturn: 0 };
    const slope = SS_xy / SS_xx;
    const intercept = yMean - slope * xMean;

    const annualizedReturn = Math.exp(slope * annualDays) - 1;

    const yPred = x.map(xi => intercept + slope * xi);
    let SS_res = 0;
    for (let i = 0; i < n; i++) SS_res += (y[i] - yPred[i]) ** 2;
    const r2 = 1 - SS_res / SS_yy;

    const score = annualizedReturn * r2;
    return { score, r2, annualReturn: annualizedReturn };
}

function computeRankings(etfData, pricesDict, cfg) {
    const { windowDays, annualDays } = cfg;
    const results = etfData.map(etf => {
        const prices = pricesDict[etf.code] || [];
        const { score, r2, annualReturn } = calcScore(prices, windowDays, annualDays);
        return { ...etf, score, r2, annualReturn };
    });
    results.sort((a, b) => b.score - a.score);
    return results;
}

async function generateInitialHistory(cfg, etfData, pricesDict, dates, storagePrefix) {
    // 从文件加载历史数据
    const allHistory = await loadRankHistory();
    const historyKey = storagePrefix + 'rank_history';
    
    if (allHistory[historyKey] && allHistory[historyKey].length >= 5) {
        // 已有足够数据，跳过生成
        return;
    }

    const { windowDays, annualDays } = cfg;
    const totalDays = dates.length;
    const startIndex = windowDays - 1;
    const snapshots = [];

    for (let i = startIndex; i < totalDays; i++) {
        const slicedPrices = {};
        for (let code in pricesDict) {
            slicedPrices[code] = pricesDict[code].slice(0, i + 1);
        }
        const results = computeRankings(etfData, slicedPrices, { windowDays, annualDays });
        snapshots.push({
            time: dates[i].slice(5),
            rankings: results.map((r, idx) => ({
                rank: idx + 1, code: r.code, name: r.name, score: r.score
            }))
        });
    }
    snapshots.sort((a, b) => a.time.localeCompare(b.time));
    const trimmed = snapshots.slice(-60);
    
    // 保存到文件（需要后端支持，暂时用 localStorage 作为 fallback）
    try {
        const allHistory = await loadRankHistory();
        allHistory[historyKey] = trimmed;
        // 注意：这里无法直接写入文件，需要后端 API
        // 暂时只更新内存，实际写入由 Python 脚本完成
    } catch (e) {
        console.warn('Failed to save rank history:', e);
    }
    
    // 同时保存到 localStorage 作为缓存
    localStorage.setItem(historyKey, JSON.stringify(trimmed));
}

function clearHistory(storagePrefix, drawChartFn, renderHistoryFn) {
    if (!confirm('确定清空所有历史记录？')) return;
    localStorage.setItem(storagePrefix + 'rank_history', JSON.stringify([]));
    if (drawChartFn) drawChartFn(-1);
    if (renderHistoryFn) renderHistoryFn();
}

function loadParams(storagePrefix, defaultParams) {
    let params = { ...defaultParams };
    const saved = localStorage.getItem(storagePrefix + 'params');
    if (saved) try { params = { ...defaultParams, ...JSON.parse(saved) }; } catch(e){}
    return params;
}

function saveParams(storagePrefix, params) {
    localStorage.setItem(storagePrefix + 'params', JSON.stringify(params));
}

function toggleSettings() {
    const panel = document.getElementById('settingsPanel');
    const arrow = document.getElementById('settingsArrow');
    panel.classList.toggle('hidden');
    arrow.textContent = panel.classList.contains('hidden') ? '▶' : '▼';
}

function extractMyPrices(etfData, allPrices) {
    const myPrices = {};
    etfData.forEach(etf => {
        if (allPrices[etf.code]) myPrices[etf.code] = [...allPrices[etf.code]];
        else console.warn('⚠️ 缺少数据:', etf.code);
    });
    return myPrices;
}

function updateDataAsOf(unified, allDates) {
    const lastUpdated = unified.meta?.lastUpdated || allDates[allDates.length - 1];
    const lastUpdatedTime = unified.meta?.lastUpdatedTime || '';
    document.getElementById('dataAsOfDate').textContent = lastUpdated.slice(5) + (lastUpdatedTime ? ' ' + lastUpdatedTime : '');
}

function updateHistory(storagePrefix, results, etfData, allDates) {
    const historyKey = storagePrefix + 'rank_history';
    // 优先从 localStorage 读取（作为缓存）
    const history = JSON.parse(localStorage.getItem(historyKey) || '[]');
    const today = allDates[allDates.length - 1].slice(5);
    const existing = history.find(item => item.time === today);
    const rankingsWithScore = results.map((r, idx) => ({
        rank: idx + 1, code: r.code, name: r.name, score: r.score
    }));
    if (existing) {
        existing.rankings = rankingsWithScore;
    } else {
        history.push({ time: today, rankings: rankingsWithScore });
    }
    if (history.length > 60) history.splice(0, history.length - 60);
    localStorage.setItem(historyKey, JSON.stringify(history));
}

function needsTodayUpdate(storagePrefix, allDates) {
    const historyKey = storagePrefix + 'rank_history';
    const history = JSON.parse(localStorage.getItem(historyKey) || '[]');
    if (history.length === 0) return true;
    const today = allDates[allDates.length - 1].slice(5);
    const lastEntry = history[history.length - 1];
    return lastEntry.time !== today;
}

if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
        if (typeof r === 'number') r = { tl: r, tr: r, br: r, bl: r };
        this.beginPath();
        this.moveTo(x + r.tl, y); this.lineTo(x + w - r.tr, y);
        this.quadraticCurveTo(x + w, y, x + w, y + r.tr);
        this.lineTo(x + w, y + h - r.br);
        this.quadraticCurveTo(x + w, y + h, x + w - r.br, y + h);
        this.lineTo(x + r.bl, y + h);
        this.quadraticCurveTo(x, y + h, x, y + h - r.bl);
        this.lineTo(x, y + r.tl);
        this.quadraticCurveTo(x, y, x + r.tl, y);
        this.closePath();
    };
}
