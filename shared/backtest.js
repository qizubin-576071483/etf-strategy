// ===== 策略回测：永远满仓第一 =====
// 规则：第 t 日收盘后按当前参数（回看/年化天数）计算各ETF得分，第 t+1 日满仓得分第一的ETF；
//       收益按收盘价到收盘价计算，不计手续费与滑点；基准为等权持有全部ETF（每日再平衡）。
// 依赖：engine.js 的 calcScore()

let backtestFull = null;      // 完整回测结果
let backtestRange = 'all';    // 当前展示范围

function runTop1Backtest(etfData, pricesDict, dates, cfg) {
    const { windowDays, annualDays } = cfg;
    const n = dates.length;
    const start = windowDays - 1;
    if (n <= start + 1) return null;

    const navDates = [];
    const stratNav = [1];
    const benchNav = [1];
    const holdings = [];
    let strat = 1, bench = 1, prevCode = null;

    for (let i = start; i < n - 1; i++) {
        // 收盘信号：用截至第 i 日（含）的价格算分
        const results = etfData.map(etf => {
            const p = (pricesDict[etf.code] || []).slice(0, i + 1);
            return { code: etf.code, name: etf.name, ...calcScore(p, windowDays, annualDays) };
        }).sort((a, b) => b.score - a.score);
        const top = results[0];

        // 第 i -> i+1 日收益
        let stratRet = 0;
        const pt = pricesDict[top.code];
        if (pt && pt[i] && pt[i + 1]) stratRet = pt[i + 1] / pt[i] - 1;

        let benchRet = 0, cnt = 0;
        etfData.forEach(etf => {
            const p = pricesDict[etf.code];
            if (p && p[i] && p[i + 1]) { benchRet += p[i + 1] / p[i] - 1; cnt++; }
        });
        benchRet = cnt ? benchRet / cnt : 0;

        strat *= (1 + stratRet);
        bench *= (1 + benchRet);

        navDates.push(dates[i + 1]);
        stratNav.push(strat);
        benchNav.push(bench);
        holdings.push({ date: dates[i + 1], code: top.code, name: top.name, ret: stratRet, switched: prevCode !== null && prevCode !== top.code });
        prevCode = top.code;
    }

    return { navDates, stratNav, benchNav, holdings, annualDays };
}

function statsFromSeries(navDates, stratNav, benchNav, holdings, annualDays) {
    const days = stratNav.length - 1;
    if (days <= 0) return null;
    const sEnd = stratNav[stratNav.length - 1];
    const bEnd = benchNav[benchNav.length - 1];
    const cum = sEnd - 1;
    const benchCum = bEnd - 1;
    const ann = Math.pow(sEnd, annualDays / days) - 1;
    const benchAnn = Math.pow(bEnd, annualDays / days) - 1;

    let peak = stratNav[0], mdd = 0;
    stratNav.forEach(v => { if (v > peak) peak = v; const dd = (v - peak) / peak; if (dd < mdd) mdd = dd; });
    let peakB = benchNav[0], mddB = 0;
    benchNav.forEach(v => { if (v > peakB) peakB = v; const dd = (v - peakB) / peakB; if (dd < mddB) mddB = dd; });

    const switches = holdings.filter(h => h.switched).length;
    const winDays = holdings.filter(h => h.ret > 0).length;

    return {
        days, cum, ann, mdd, benchCum, benchAnn, mddB,
        excess: cum - benchCum,
        winRate: winDays / days,
        switches,
        avgHold: days / (switches + 1),
    };
}

function sliceBacktest(bt, range) {
    let k = bt.navDates.length;
    if (range === 'week') k = Math.min(k, 5);
    else if (range === 'month') k = Math.min(k, 20);
    const from = bt.navDates.length - k;           // nav 数组比 holdings 多 1 个起点
    const navDates = bt.navDates.slice(from);
    const s0 = bt.stratNav[from], b0 = bt.benchNav[from];
    const stratNav = bt.stratNav.slice(from).map(v => v / s0);
    const benchNav = bt.benchNav.slice(from).map(v => v / b0);
    const holdings = bt.holdings.slice(from).map((h, i) => (i === 0 ? { ...h, switched: false } : h));
    return { navDates, stratNav, benchNav, holdings, annualDays: bt.annualDays };
}

function _btPct(v) {
    const s = (v * 100).toFixed(1) + '%';
    return v > 0 ? '+' + s : s;
}
function _btColor(v) { return v > 0 ? '#4ade80' : (v < 0 ? '#f87171' : '#e2e8f0'); }

function renderBacktestStats(st) {
    const box = document.getElementById('backtestStats');
    if (!box) return;
    if (!st) { box.innerHTML = '<div style="grid-column:1/-1;color:#64748b;font-size:12px;text-align:center;padding:8px;">数据不足，无法回测</div>'; return; }
    const items = [
        ['策略累计收益', _btPct(st.cum), _btColor(st.cum)],
        ['策略年化', _btPct(st.ann), _btColor(st.ann)],
        ['最大回撤', _btPct(st.mdd), '#f87171'],
        ['日胜率', (st.winRate * 100).toFixed(0) + '%', '#e2e8f0'],
        ['调仓次数', st.switches + ' 次', '#e2e8f0'],
        ['平均持有', st.avgHold.toFixed(1) + ' 天', '#e2e8f0'],
        ['基准累计', _btPct(st.benchCum), _btColor(st.benchCum)],
        ['超额收益', _btPct(st.excess), _btColor(st.excess)],
    ];
    box.innerHTML = items.map(([label, val, color]) =>
        `<div style="background:#0f172a;border:1px solid #334155;border-radius:10px;padding:8px 6px;text-align:center;">
            <div style="font-size:10px;color:#94a3b8;margin-bottom:4px;">${label}</div>
            <div style="font-size:14px;font-weight:700;color:${color};">${val}</div>
        </div>`).join('');
}

function drawBacktestChart(series) {
    const canvas = document.getElementById('backtestChart');
    if (!canvas) return;
    const { navDates, stratNav, benchNav } = series;
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

    const all = stratNav.concat(benchNav);
    let maxV = Math.max(...all, 1.05), minV = Math.min(...all, 0.95);
    const range = (maxV - minV) || 1;

    // 网格与Y轴（净值）
    ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 0.5;
    ctx.fillStyle = '#94a3b8'; ctx.font = '10px sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    const gridLines = 5;
    for (let i = 0; i <= gridLines; i++) {
        const v = minV + range * i / gridLines;
        const y = pad.top + chartH - chartH * i / gridLines;
        ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
        ctx.fillText(v.toFixed(2), pad.left - 6, y);
    }

    // 净值 1.0 基准线
    if (1 >= minV && 1 <= maxV) {
        const y = pad.top + chartH - chartH * (1 - minV) / range;
        ctx.strokeStyle = '#475569'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
        ctx.setLineDash([]);
    }

    const px = i => pad.left + (i / Math.max(1, navDates.length - 1)) * chartW;
    const py = v => pad.top + chartH - chartH * (v - minV) / range;

    // 基准线（灰虚线）
    ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
    ctx.beginPath();
    benchNav.forEach((v, i) => i === 0 ? ctx.moveTo(px(i), py(v)) : ctx.lineTo(px(i), py(v)));
    ctx.stroke();
    ctx.setLineDash([]);

    // 策略线（绿实线 + 发光）
    ctx.strokeStyle = '#34d399'; ctx.lineWidth = 2.5; ctx.shadowColor = '#34d399'; ctx.shadowBlur = 5;
    ctx.beginPath();
    stratNav.forEach((v, i) => i === 0 ? ctx.moveTo(px(i), py(v)) : ctx.lineTo(px(i), py(v)));
    ctx.stroke();
    ctx.shadowBlur = 0;

    // X轴日期
    ctx.fillStyle = '#64748b'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const maxLabels = Math.min(navDates.length, 6);
    for (let i = 0; i < maxLabels; i++) {
        const idx = Math.floor(i * (navDates.length - 1) / Math.max(1, maxLabels - 1));
        ctx.fillText(navDates[idx].slice(5), px(idx), H - pad.bottom + 8);
    }

    document.getElementById('backtestLegend').innerHTML =
        `<span><span style="background:#34d399;width:12px;height:12px;display:inline-block;border-radius:3px;"></span> 满仓第一·净值</span>` +
        `<span><span style="background:#94a3b8;width:12px;height:12px;display:inline-block;border-radius:3px;"></span> 等权基准·净值</span>`;
}

function _backtestTooltip(series, hi) {
    const canvas = document.getElementById('backtestChart');
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const W = rect.width, H = 260;
    const pad = { left: 50, right: 10 };
    const chartW = W - pad.left - pad.right;
    const { navDates, stratNav, benchNav, holdings } = series;

    const all = stratNav.concat(benchNav);
    const maxV = Math.max(...all, 1.05), minV = Math.min(...all, 0.95);
    const range = (maxV - minV) || 1;
    const chartH = H - 20 - 30;
    const x = pad.left + (hi / Math.max(1, navDates.length - 1)) * chartW;

    ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(x, 20); ctx.lineTo(x, H - 30); ctx.stroke(); ctx.setLineDash([]);

    const h = holdings[hi] || null;
    const lines = [
        ['策略 ' + stratNav[hi + 1].toFixed(4), '#34d399'],
        ['基准 ' + benchNav[hi + 1].toFixed(4), '#94a3b8'],
        ['持仓 ' + (h ? h.name : '—'), '#e2e8f0'],
        ['当日 ' + (h ? _btPct(h.ret) : '—'), h ? _btColor(h.ret) : '#e2e8f0'],
    ];
    const tipW = 150, tipH = 20 + lines.length * 16;
    let tipX = x + 10, tipY = 25;
    if (tipX + tipW > W - pad.right) tipX = x - tipW - 10;

    ctx.fillStyle = 'rgba(11, 15, 25, 0.95)'; ctx.strokeStyle = '#334155'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(tipX, tipY, tipW, tipH, 6); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e2e8f0'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('📅 ' + navDates[hi], tipX + 6, tipY + 4);
    ctx.font = '9px sans-serif';
    lines.forEach(([txt, color], i) => {
        ctx.fillStyle = color;
        ctx.fillText(txt, tipX + 6, tipY + 20 + i * 16);
    });
}

function setupBacktestInteraction() {
    const canvas = document.getElementById('backtestChart');
    if (!canvas || canvas.dataset.btBound) return;
    canvas.dataset.btBound = '1';

    function onMove(e) {
        if (!backtestFull) return;
        const series = sliceBacktest(backtestFull, backtestRange);
        const rect = canvas.getBoundingClientRect();
        let clientX = e.touches ? e.touches[0].clientX : e.clientX;
        if (e.touches) e.preventDefault();
        const x = clientX - rect.left;
        const pad = { left: 50, right: 10 };
        const W = rect.width, chartW = W - pad.left - pad.right;
        if (x < pad.left || x > W - pad.right) return;
        const idx = Math.round((x - pad.left) / chartW * (series.navDates.length - 1));
        const hi = Math.max(0, Math.min(series.navDates.length - 2, idx));
        drawBacktestChart(series);
        _backtestTooltip(series, hi);
    }
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseleave', () => { if (backtestFull) drawBacktestChart(sliceBacktest(backtestFull, backtestRange)); });
    canvas.addEventListener('touchstart', onMove, { passive: false });
    canvas.addEventListener('touchmove', onMove, { passive: false });
}

function applyBacktestRange(range) {
    backtestRange = range;
    document.querySelectorAll('.bt-range-btn').forEach(b => {
        const on = b.dataset.range === range;
        b.style.background = on ? '#38bdf8' : '#0f172a';
        b.style.color = on ? '#0b0f19' : '#94a3b8';
        b.style.fontWeight = on ? '700' : '400';
        b.style.border = '1px solid ' + (on ? '#38bdf8' : '#334155');
    });
    if (!backtestFull) return;
    const series = sliceBacktest(backtestFull, range);
    renderBacktestStats(statsFromSeries(series.navDates, series.stratNav, series.benchNav, series.holdings, series.annualDays));
    drawBacktestChart(series);
}

// 入口：由 app.js 在数据加载后调用
function renderBacktest(etfData, pricesDict, dates, cfg) {
    const card = document.getElementById('backtestCard');
    if (!card) return;
    backtestFull = runTop1Backtest(etfData, pricesDict, dates, cfg);
    if (!backtestFull) { renderBacktestStats(null); return; }
    applyBacktestRange(backtestRange);
    setupBacktestInteraction();
}
