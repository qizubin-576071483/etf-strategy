function renderResults(results, etfData) {
    const first = results[0];
    document.getElementById('rankList').innerHTML = results.map((r, i) => {
        const rankClass = i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : 'rank-4';
        const annualReturnPct = (r.annualReturn * 100).toFixed(1);
        return `<div class="rank-item">
            <div class="rank-num ${rankClass}">${i + 1}</div>
            <div class="rank-info">${r.name}<div class="code">${r.code} | R²:${r.r2.toFixed(2)} | 年化收益:${annualReturnPct}%</div></div>
            <div class="rank-val">${r.score.toFixed(6)}</div>
        </div>`;
    }).join('');
    document.getElementById('tradeAdvice').innerHTML = `✅ 永远满仓第一：<strong>${first.name}</strong>（${first.code}）<br>当前得分：${first.score.toFixed(6)}<br>年化收益：${(first.annualReturn * 100).toFixed(1)}%<br>R²：${first.r2.toFixed(2)}`;
}

async function renderHistoryTable(etfData, storagePrefix) {
    const historyKey = storagePrefix + 'rank_history';
    // 优先从文件加载
    let history = [];
    try {
        const allHistory = await loadRankHistory();
        if (allHistory[historyKey]) {
            history = allHistory[historyKey];
        }
    } catch (e) {
        // fallback to localStorage
        history = JSON.parse(localStorage.getItem(historyKey) || '[]');
    }
    
    // 如果文件没有数据，用 localStorage
    if (history.length === 0) {
        history = JSON.parse(localStorage.getItem(historyKey) || '[]');
    }
    
    const container = document.getElementById('historyTable');
    if (!container) return;

    if (history.length === 0) {
        container.innerHTML = '<div style="color:#64748b;font-size:12px;text-align:center;padding:10px;">暂无历史记录</div>';
        return;
    }

    const recent = history.slice(-10).reverse();

    let html = '<table><thead><tr><th>日期</th>';
    etfData.forEach(etf => { html += `<th>${etf.name.replace('ETF','')}</th>`; });
    html += '</tr></thead><tbody>';

    recent.forEach(snap => {
        const scores = snap.rankings.map(r => r.score ?? 0);
        const maxScore = Math.max(...scores);

        html += `<tr><td>${snap.time}</td>`;
        etfData.forEach(etf => {
            const item = snap.rankings.find(r => r.code === etf.code);
            const s = item && item.score != null ? item.score : null;
            if (s === null) {
                html += '<td>—</td>';
            } else {
                const cls = s === maxScore ? 'best' : (s < 0 ? 'neg' : '');
                html += `<td class="${cls}">${s.toFixed(4)}</td>`;
            }
        });
        html += '</tr>';
    });

    html += '</tbody></table>';
    container.innerHTML = html;
}

async function drawRankChart(cfg) {
    const { etfData, fixedColors, storagePrefix, displayMax } = cfg;
    const historyKey = storagePrefix + 'rank_history';
    
    // 优先从文件加载
    let history = [];
    try {
        const allHistory = await loadRankHistory();
        if (allHistory[historyKey]) {
            history = allHistory[historyKey];
        }
    } catch (e) {
        // fallback to localStorage
        history = JSON.parse(localStorage.getItem(historyKey) || '[]');
    }
    
    // 如果文件没有数据，用 localStorage
    if (history.length === 0) {
        history = JSON.parse(localStorage.getItem(historyKey) || '[]');
    }
    const canvas = document.getElementById('trendChart');
    const rect = canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const W = rect.width || 400, H = 220;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    const pad = { top: 10, bottom: 30, left: 35, right: 10 };
    const chartW = W - pad.left - pad.right, chartH = H - pad.top - pad.bottom;
    const gridDiv = displayMax - 1;

    ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 0.5;
    ctx.fillStyle = '#94a3b8'; ctx.font = '10px sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let r = 1; r <= displayMax; r++) {
        const y = pad.top + ((r - 1) / gridDiv) * chartH;
        ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
        ctx.fillText(`第${r}名`, pad.left - 6, y);
    }

    if (history.length === 0) {
        ctx.fillStyle = '#64748b'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('暂无历史记录', W / 2, H / 2);
        return;
    }

    const etfRanks = {};
    etfData.forEach(etf => { etfRanks[etf.code] = []; });
    history.forEach(snap => {
        etfData.forEach(etf => {
            const found = snap.rankings.find(r => r.code === etf.code);
            etfRanks[etf.code].push(found ? found.rank : null);
        });
    });

    etfData.forEach((etf, idx) => {
        const ranks = etfRanks[etf.code];
        if (!ranks || ranks.length === 0) return;
        const color = fixedColors[idx % fixedColors.length];
        ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.shadowColor = color; ctx.shadowBlur = 4;
        ctx.beginPath();
        let started = false;
        ranks.forEach((rank, i) => {
            if (rank === null || rank === undefined) return;
            const displayRank = Math.min(rank, displayMax);
            const x = pad.left + (i / Math.max(1, ranks.length - 1)) * chartW;
            const y = pad.top + ((displayRank - 1) / gridDiv) * chartH;
            if (!started) { ctx.moveTo(x, y); started = true; }
            else ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.shadowBlur = 0;
        ranks.forEach((rank, i) => {
            if (rank === null || rank === undefined) return;
            const displayRank = Math.min(rank, displayMax);
            const x = pad.left + (i / Math.max(1, ranks.length - 1)) * chartW;
            const y = pad.top + ((displayRank - 1) / gridDiv) * chartH;
            ctx.fillStyle = color;
            ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
        });
    });

    ctx.fillStyle = '#64748b'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const maxLabels = Math.min(history.length, 6);
    for (let i = 0; i < maxLabels; i++) {
        const idx = Math.floor(i * (history.length - 1) / Math.max(1, maxLabels - 1));
        const x = pad.left + (idx / Math.max(1, history.length - 1)) * chartW;
        ctx.fillText(history[idx].time, x, H - pad.bottom + 8);
    }

    if (cfg._highlightIndex >= 0 && cfg._highlightIndex < history.length) {
        const hi = cfg._highlightIndex;
        const x = pad.left + (hi / Math.max(1, history.length - 1)) * chartW;
        ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(x, pad.top); ctx.lineTo(x, H - pad.bottom); ctx.stroke(); ctx.setLineDash([]);

        const snap = history[hi];
        const rankMap = {};
        snap.rankings.forEach(item => { if (item.rank <= displayMax) rankMap[item.rank] = item.name; });

        const tipW = displayMax >= 5 ? 170 : 150;
        const tipH = 20 + displayMax * 17;
        let tipX = x + 10, tipY = pad.top + 5;
        if (tipX + tipW > W - pad.right) tipX = x - tipW - 10;
        if (tipY + tipH > H - pad.bottom) tipY = H - pad.bottom - tipH;

        ctx.fillStyle = 'rgba(11, 15, 25, 0.95)'; ctx.strokeStyle = '#334155'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.roundRect(tipX, tipY, tipW, tipH, 6); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#e2e8f0'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText(`📅 ${snap.time}`, tipX + 6, tipY + 4);
        ctx.font = '9px sans-serif';
        for (let rank = 1; rank <= displayMax; rank++) {
            if (rankMap[rank]) {
                const etfObj = etfData.find(e => e.name === rankMap[rank]);
                let color = '#e2e8f0';
                if (etfObj) { const idx = etfData.indexOf(etfObj); color = fixedColors[idx % fixedColors.length]; }
                ctx.fillStyle = color;
                ctx.fillText(`${rank}名 ${rankMap[rank]}`, tipX + 6, tipY + 22 + (rank - 1) * 17);
            } else {
                ctx.fillStyle = '#64748b';
                ctx.fillText(`${rank}名 — 无`, tipX + 6, tipY + 22 + (rank - 1) * 17);
            }
        }
    }

    document.getElementById('chartLegend').innerHTML = etfData.map((etf, idx) => {
        return `<span><span style="background:${fixedColors[idx % fixedColors.length]};width:12px;height:12px;display:inline-block;border-radius:3px;"></span> ${etf.name}</span>`;
    }).join('');
}

function setupChartInteraction(cfg) {
    const canvas = document.getElementById('trendChart');
    const storagePrefix = cfg.storagePrefix;
    const historyKey = storagePrefix + 'rank_history';

    function getCanvasCoords(e) {
        const rect = canvas.getBoundingClientRect();
        let clientX;
        if (e.touches) { clientX = e.touches[0].clientX; e.preventDefault(); }
        else { clientX = e.clientX; }
        return { x: clientX - rect.left };
    }

    function getHistory() {
        return JSON.parse(localStorage.getItem(historyKey) || '[]');
    }

    function handlePointerMove(e) {
        const history = getHistory();
        if (history.length === 0) return;
        const { x } = getCanvasCoords(e);
        const pad = { left: 35, right: 10 };
        const rect = canvas.getBoundingClientRect();
        const W = rect.width, chartW = W - pad.left - pad.right;
        if (x < pad.left || x > W - pad.right) { drawRankChart({ ...cfg, _highlightIndex: -1 }); return; }
        const rawIndex = (x - pad.left) / chartW;
        const index = Math.round(rawIndex * (history.length - 1));
        drawRankChart({ ...cfg, _highlightIndex: Math.max(0, Math.min(history.length - 1, index)) });
    }

    function handlePointerLeave() {
        drawRankChart({ ...cfg, _highlightIndex: -1 });
    }

    canvas.addEventListener('mousemove', handlePointerMove);
    canvas.addEventListener('mouseleave', handlePointerLeave);
    canvas.addEventListener('touchstart', handlePointerMove, { passive: false });
    canvas.addEventListener('touchmove', handlePointerMove, { passive: false });
    canvas.addEventListener('touchend', handlePointerLeave, { passive: false });
}

// 动量走势图
let momentumData = [];
let momentumEtfData = [];
let momentumColors = [];
let currentRange = 'all';

async function drawMomentumChart(etfData, storagePrefix, colors, range = 'all') {
    // 部分页面（如 5/9/12）没有动量走势图区块，缺画布时直接跳过，避免初始化报错
    if (!document.getElementById('momentumChart') || !document.getElementById('momentumLegend')) return;
    const historyKey = storagePrefix + 'rank_history';
    let history = [];
    try {
        const allHistory = await loadRankHistory();
        if (allHistory[historyKey]) {
            history = allHistory[historyKey];
        }
    } catch (e) {
        history = JSON.parse(localStorage.getItem(historyKey) || '[]');
    }
    if (history.length === 0) {
        history = JSON.parse(localStorage.getItem(historyKey) || '[]');
    }

    momentumData = history;
    momentumEtfData = etfData;
    momentumColors = colors;
    currentRange = range;

    // 根据范围过滤数据
    let filteredHistory = history;
    if (range === 'week') {
        filteredHistory = history.slice(-5);
    } else if (range === 'month') {
        filteredHistory = history.slice(-20);
    }

    const canvas = document.getElementById('momentumChart');
    const rect = canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const W = rect.width || 400, H = 260;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    const pad = { top: 20, bottom: 30, left: 50, right: 10 };
    const chartW = W - pad.left - pad.right, chartH = H - pad.top - pad.bottom;

    // 收集所有分数
    const allScores = [];
    filteredHistory.forEach(snap => {
        snap.rankings.forEach(r => {
            if (r.score != null) allScores.push(r.score);
        });
    });

    if (allScores.length === 0) {
        ctx.fillStyle = '#64748b'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('暂无数据', W / 2, H / 2);
        return;
    }

    const maxScore = Math.max(...allScores, 0.5);
    const minScore = Math.min(...allScores, -0.5);
    const scoreRange = maxScore - minScore;

    // 绘制网格和Y轴标签
    ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 0.5;
    ctx.fillStyle = '#94a3b8'; ctx.font = '10px sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    const gridLines = 6;
    for (let i = 0; i <= gridLines; i++) {
        const score = minScore + (scoreRange * i / gridLines);
        const y = pad.top + chartH - (chartH * i / gridLines);
        ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
        ctx.fillText(score.toFixed(1), pad.left - 6, y);
    }

    // 绘制零线（多头/分界线）
    const zeroY = pad.top + chartH - (chartH * (0 - minScore) / scoreRange);
    ctx.strokeStyle = '#475569'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(pad.left, zeroY); ctx.lineTo(W - pad.right, zeroY); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#64748b'; ctx.font = '9px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('0', pad.left + 4, zeroY - 4);

    // 绘制ETF曲线
    etfData.forEach((etf, idx) => {
        const scores = [];
        filteredHistory.forEach(snap => {
            const item = snap.rankings.find(r => r.code === etf.code);
            scores.push(item ? item.score : null);
        });

        const color = colors[idx % colors.length];
        ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.shadowColor = color; ctx.shadowBlur = 4;
        ctx.beginPath();
        let started = false;
        scores.forEach((score, i) => {
            if (score === null) return;
            const x = pad.left + (i / Math.max(1, scores.length - 1)) * chartW;
            const y = pad.top + chartH - (chartH * (score - minScore) / scoreRange);
            if (!started) { ctx.moveTo(x, y); started = true; }
            else ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.shadowBlur = 0;

        // 绘制数据点
        scores.forEach((score, i) => {
            if (score === null) return;
            const x = pad.left + (i / Math.max(1, scores.length - 1)) * chartW;
            const y = pad.top + chartH - (chartH * (score - minScore) / scoreRange);
            ctx.fillStyle = color;
            ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
        });
    });

    // X轴日期标签
    ctx.fillStyle = '#64748b'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const maxLabels = Math.min(filteredHistory.length, 6);
    for (let i = 0; i < maxLabels; i++) {
        const idx = Math.floor(i * (filteredHistory.length - 1) / Math.max(1, maxLabels - 1));
        const x = pad.left + (idx / Math.max(1, filteredHistory.length - 1)) * chartW;
        ctx.fillText(filteredHistory[idx].time, x, H - pad.bottom + 8);
    }

    // 图例
    document.getElementById('momentumLegend').innerHTML = etfData.map((etf, idx) => {
        return `<span><span style="background:${colors[idx % colors.length]};width:12px;height:12px;display:inline-block;border-radius:3px;"></span> ${etf.name}</span>`;
    }).join('');
}

function setupMomentumChartInteraction(etfData, storagePrefix, colors) {
    const canvas = document.getElementById('momentumChart');
    if (!canvas) return;   // 无动量图区块的页面跳过交互绑定
    const historyKey = storagePrefix + 'rank_history';

    function getHistory() {
        return JSON.parse(localStorage.getItem(historyKey) || '[]');
    }

    function getCanvasCoords(e) {
        const rect = canvas.getBoundingClientRect();
        let clientX;
        if (e.touches) { clientX = e.touches[0].clientX; e.preventDefault(); }
        else { clientX = e.clientX; }
        return { x: clientX - rect.left };
    }

    function handlePointerMove(e) {
        const history = getHistory();
        let filteredHistory = history;
        if (currentRange === 'week') filteredHistory = history.slice(-5);
        else if (currentRange === 'month') filteredHistory = history.slice(-20);

        if (filteredHistory.length === 0) return;
        const { x } = getCanvasCoords(e);
        const pad = { left: 50, right: 10 };
        const rect = canvas.getBoundingClientRect();
        const W = rect.width, chartW = W - pad.left - pad.right;
        if (x < pad.left || x > W - pad.right) return;

        const rawIndex = (x - pad.left) / chartW;
        const index = Math.round(rawIndex * (filteredHistory.length - 1));
        const hi = Math.max(0, Math.min(filteredHistory.length - 1, index));
        const snap = filteredHistory[hi];

        // 重绘图表并显示tooltip
        drawMomentumChart(etfData, storagePrefix, colors, currentRange).then(() => {
            const ctx = canvas.getContext('2d');
            const dpr = window.devicePixelRatio || 1;
            const H = 260;
            const chartH = H - 20 - 30;
            const x = pad.left + (hi / Math.max(1, filteredHistory.length - 1)) * chartW;

            // 绘制垂直线
            ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
            ctx.beginPath(); ctx.moveTo(x, 20); ctx.lineTo(x, H - 30); ctx.stroke(); ctx.setLineDash([]);

            // 绘制tooltip
            const tipW = 180;
            const tipH = 20 + etfData.length * 17;
            let tipX = x + 10, tipY = 25;
            if (tipX + tipW > W - pad.right) tipX = x - tipW - 10;

            ctx.fillStyle = 'rgba(11, 15, 25, 0.95)'; ctx.strokeStyle = '#334155'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.roundRect(tipX, tipY, tipW, tipH, 6); ctx.fill(); ctx.stroke();
            ctx.fillStyle = '#e2e8f0'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
            ctx.fillText(`📅 ${snap.time}`, tipX + 6, tipY + 4);
            ctx.font = '9px sans-serif';
            etfData.forEach((etf, idx) => {
                const item = snap.rankings.find(r => r.code === etf.code);
                const score = item ? item.score : 0;
                ctx.fillStyle = colors[idx % colors.length];
                ctx.fillText(`${etf.name}: ${score.toFixed(6)}`, tipX + 6, tipY + 22 + idx * 17);
            });
        });
    }

    canvas.addEventListener('mousemove', handlePointerMove);
    canvas.addEventListener('touchstart', handlePointerMove, { passive: false });
    canvas.addEventListener('touchmove', handlePointerMove, { passive: false });
}
