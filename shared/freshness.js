/* 数据新鲜度提示
   读取 data/prices.json 的 meta，用北京时间判断"当天数据是否已落地"。
   纯静态、只读，不写任何文件；手机浏览器直接可用，不依赖本机。 */
(function () {
    'use strict';

    function bjNow() { return new Date(Date.now() + 8 * 3600 * 1000); }
    function parts(d) {
        return {
            y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(),
            wd: d.getUTCDay(), min: d.getUTCHours() * 60 + d.getUTCMinutes()
        };
    }
    function ymd(p) {
        return p.y + '-' + String(p.m).padStart(2, '0') + '-' + String(p.d).padStart(2, '0');
    }
    function hm2min(s) {
        if (!s || !/^\d{1,2}:\d{2}/.test(s)) return null;
        var a = s.split(':');
        return Number(a[0]) * 60 + Number(a[1]);
    }
    function dayDiff(a, b) {
        return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
    }
    function fmtMin(m) {
        return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
    }

    function show(state, title, detail) {
        var el = document.createElement('div');
        el.id = 'data-freshness';
        var bg = { ok: '#10382e', warn: '#453310', bad: '#48191c', rest: '#26303b' }[state] || '#26303b';
        var fg = { ok: '#6ee7b7', warn: '#fcd34d', bad: '#fca5a5', rest: '#cbd5e1' }[state] || '#cbd5e1';
        el.setAttribute('style',
            'margin:0;padding:10px 14px;text-align:center;font-size:13px;line-height:1.55;background:' +
            bg + ';color:' + fg + ';border-bottom:1px solid rgba(255,255,255,.08);' +
            'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;');
        var strong = document.createElement('strong');
        strong.textContent = title;
        el.appendChild(strong);
        if (detail) {
            var span = document.createElement('span');
            span.setAttribute('style', 'opacity:.88;font-size:12px;');
            span.textContent = ' · ' + detail;
            el.appendChild(span);
        }
        document.body.insertBefore(el, document.body.firstChild || null);
    }

    fetch('data/prices.json?t=' + Date.now(), { cache: 'no-store' })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function (d) {
            var meta = d.meta || {};
            var last = meta.lastUpdated || (d.dates && d.dates[d.dates.length - 1]);
            var lastMin = hm2min(meta.lastUpdatedTime);
            var now = parts(bjNow());
            var today = ymd(now);
            var base = '数据截至 ' + last + (lastMin !== null ? ' ' + fmtMin(lastMin) : '');

            if (now.wd === 0 || now.wd === 6) {
                show('rest', '⚪ 休市中', base + '（周末不产生新数据）');
                return;
            }
            if (!last) { show('bad', '🔴 无法判断数据日期', 'prices.json 缺少日期字段'); return; }

            if (last === today) {
                if (lastMin !== null && now.min >= 15 * 60 + 10 && lastMin < 15 * 60) {
                    show('warn', '🟡 今日数据为盘中价', base + ' · 收盘后自动覆写，请稍后再看');
                } else {
                    show('ok', '🟢 数据已更新至今天', base);
                }
                return;
            }

            var lag = dayDiff(last, today);
            if (now.min < 21 * 60 + 10) {
                show('warn', '🟡 今日数据尚未落地',
                    base + (lag > 1 ? '（已落后 ' + lag + ' 天）' : '') +
                    ' · 自动更新通常当晚完成，最晚 21:10，延迟时可能次日凌晨落地');
            } else {
                show('bad', '🔴 今日数据未更新！',
                    base + (lag > 1 ? '（已落后 ' + lag + ' 天）' : '') +
                    ' · 已过 21:10 兜底时点，如次日仍无当日数据请手动更新');
            }
        })
        .catch(function (e) {
            show('bad', '🔴 数据状态检查失败', '无法读取 data/prices.json：' + e.message);
        });
})();
