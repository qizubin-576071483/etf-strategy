import requests
import json
import re
import math
from datetime import datetime, timezone, timedelta

# 北京时间：GitHub 服务器默认 UTC，显式指定时区，避免跨零点运行把日期标错
BJT = timezone(timedelta(hours=8))

# ===== 需要获取的ETF代码列表（18只） =====
ETF_CODES = [
    '518880', '510880', '510300', '512400', '512000',
    '512010', '512690', '515030', '562500', '515880',
    '159819', '512480', '511010', '513030', '513100',
    '513330', '588000', '159915'
]

def fetch_etf_prices():
    """从腾讯财经获取所有ETF最新价"""
    prices = {}
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
    
    for code in ETF_CODES:
        try:
            # 判断市场（沪市以5/6/9开头，深市以0/1/2/3开头）
            if code.startswith(('5', '6', '9')):
                market = 'sh'
            else:
                market = 'sz'
            
            url = f'https://qt.gtimg.cn/q={market}{code}'
            response = requests.get(url, headers=headers, timeout=5)
            
            if response.status_code == 200:
                data = response.text
                # 解析数据：v_sh510300="1~沪深300ETF~510300~4.755~..."
                match = re.search(r'="([^"]+)"', data)
                if match:
                    parts = match.group(1).split('~')
                    if len(parts) >= 4:
                        price_str = parts[3].strip()
                        if price_str:
                            prices[code] = float(price_str)
                            print(f'OK {code}: {price_str}')
                        else:
                            print(f'EMPTY {code}')
                    else:
                        print(f'BAD {code}')
                else:
                    print(f'PARSE FAIL {code}')
            else:
                print(f'HTTP ERROR {code}: {response.status_code}')
        except Exception as e:
            print(f'ERROR {code}: {e}')
    
    return prices

MAX_DAILY_MOVE = 0.12  # 单日涨跌超过 12% 视为可疑（ETF 极少见），仅告警不阻断


def validate(data, tag=''):
    """落盘前结构校验：日期合法性/递增性、行列对齐、末日涨跌幅异常检测。"""
    dates = data['dates']
    problems = []
    for i, d in enumerate(dates):
        try:
            wd = datetime.strptime(d, '%Y-%m-%d').weekday()
        except ValueError:
            problems.append('日期格式非法 %s' % d)
            continue
        if wd >= 5:
            problems.append('周末日期 %s' % d)
        if i and d <= dates[i - 1]:
            problems.append('日期未递增 %s' % d)
    for code, row in data['prices'].items():
        if len(row) != len(dates):
            problems.append('%s 行长度 %d 与日期数 %d 不齐' % (code, len(row), len(dates)))
    if len(dates) >= 2:
        li = len(dates) - 1
        for code in ETF_CODES:
            row = data['prices'].get(code)
            # 行列不齐的行已在上面告警，这里跳过，避免索引越界中断落盘
            if not row or len(row) <= li or row[li] is None or row[li - 1] is None or row[li - 1] == 0:
                continue
            chg = abs(row[li] - row[li - 1]) / abs(row[li - 1])
            if chg > MAX_DAILY_MOVE:
                problems.append('%s 单日变动 %.1f%% 异常（%s）' % (code, chg * 100, dates[li]))
    if problems:
        for p in problems:
            print('[WARN][%s] %s' % (tag, p))
    else:
        print('[OK][%s] 数据结构校验通过' % tag)
    return problems


def resolve_target_date(now_bj, last_date):
    """
    判断抓到的价格归属哪个交易日，而不是按运行时刻的日期写。

    行情接口在非交易时段返回的是「最近一个交易日收盘价」；若定时任务
    延迟到凌晨运行，按运行日期写会把昨天的收盘价标成今天，导致盘中
    手动写入的价格永远定格。因此：
      - 交易日 9:30 之后（盘中/收盘后）：价格属于今天
      - 凌晨 / 开盘前 / 周末 / 节假日：价格属于数据里最后一个交易日
    """
    weekday = now_bj.weekday()
    minute_of_day = now_bj.hour * 60 + now_bj.minute
    if weekday < 5 and minute_of_day >= 9 * 60 + 30:
        return now_bj.strftime('%Y-%m-%d')
    return last_date or now_bj.strftime('%Y-%m-%d')


def save_to_json(prices):
    """保存到 data/prices.json（按价格归属交易日写入）"""
    file_path = 'data/prices.json'

    # 读取现有数据
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except FileNotFoundError:
        data = {"meta": {}, "dates": [], "prices": {}}

    now_bj = datetime.now(BJT)
    last_date = data['dates'][-1] if data['dates'] else None
    today = resolve_target_date(now_bj, last_date)

    # 检查今天是否已存在
    if today in data['dates']:
        idx = data['dates'].index(today)
        unchanged = all(
            code in data['prices'] and data['prices'][code][idx] == prices.get(code)
            for code in ETF_CODES if code in prices
        )
        if unchanged:
            print(f'[SKIP] {today} 已记录且价格相同（冗余触发空转），不写文件')
            return
        for code, price in prices.items():
            if code in data['prices']:
                data['prices'][code][idx] = price
        print(f'[UPDATE] {len(prices)} ETF on {today}')
    else:
        # 检查是否与上一交易日价格相同（休市）
        if data['dates']:
            last_date = data['dates'][-1]
            last_idx = len(data['dates']) - 1
            same_count = 0
            for code in ETF_CODES:
                if code in prices and code in data['prices'] and data['prices'][code][last_idx]:
                    if prices[code] == data['prices'][code][last_idx]:
                        same_count += 1
            # 如果大部分 ETF 价格没变，说明休市
            if same_count >= len(ETF_CODES) * 0.8:
                print(f'[SKIP] Market closed ({today}), prices unchanged from {last_date}')
                return
        
        # 追加新一天
        data['dates'].append(today)
        for code in ETF_CODES:
            if code not in data['prices']:
                data['prices'][code] = []
            if code in prices:
                data['prices'][code].append(prices[code])
            else:
                data['prices'][code].append(None)
        print(f'[APPEND] {len(prices)} ETF on {today}')
    
    validate(data, '保存前')

    # 保存
    data['meta']['lastUpdated'] = today
    data['meta']['lastUpdatedTime'] = now_bj.strftime('%H:%M')
    if data['dates']:
        data['meta']['description'] = f"{len(ETF_CODES)}只ETF历史数据（{data['dates'][0]} 至 {data['dates'][-1]}）"
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    print(f'[SAVED] {file_path}')

def calc_score(prices, window_days=25, annual_days=250):
    """计算得分：年化收益率 × R²"""
    if not prices or len(prices) < window_days:
        return {'score': 0, 'r2': 0, 'annualReturn': 0}
    
    recent = prices[-window_days:]
    y = [math.log(p) for p in recent]
    x = list(range(len(y)))
    
    n = len(y)
    x_mean = sum(x) / n
    y_mean = sum(y) / n
    
    ss_xy = 0
    ss_xx = 0
    ss_yy = 0
    for i in range(n):
        ss_xy += (x[i] - x_mean) * (y[i] - y_mean)
        ss_xx += (x[i] - x_mean) ** 2
        ss_yy += (y[i] - y_mean) ** 2
    
    if ss_xx == 0 or ss_yy == 0:
        return {'score': 0, 'r2': 0, 'annualReturn': 0}
    
    slope = ss_xy / ss_xx
    intercept = y_mean - slope * x_mean
    annualized_return = math.exp(slope * annual_days) - 1
    
    y_pred = [intercept + slope * xi for xi in x]
    ss_res = 0
    for i in range(n):
        ss_res += (y[i] - y_pred[i]) ** 2
    r2 = 1 - ss_res / ss_yy
    
    score = annualized_return * r2
    return {'score': score, 'r2': r2, 'annualReturn': annualized_return}

def compute_and_save_rankings():
    """读取价格数据，计算排名，保存到 rank_history.json"""
    prices_file = 'data/prices.json'
    history_file = 'data/rank_history.json'
    
    # 读取价格数据
    try:
        with open(prices_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except FileNotFoundError:
        print('[ERROR] prices.json not found')
        return
    
    # 页面配置（从 config.js 复制）
    page_configs = {
        '4': {
            'storagePrefix': 'etf_simple_trend_',
            'etfData': [
                {'name': '沪深 300ETF', 'code': '510300'},
                {'name': '创业板 ETF', 'code': '159915'},
                {'name': '国泰纳指 ETF', 'code': '513100'},
                {'name': '华安黄金 ETF', 'code': '518880'}
            ],
            'defaultParams': {'windowDays': 25, 'annualDays': 250}
        },
        '5': {
            'storagePrefix': 'etf_simple_trend_5_',
            'etfData': [
                {'name': '黄金 ETF 华安', 'code': '518880'},
                {'name': '红利 ETF', 'code': '510880'},
                {'name': '纳指 ETF', 'code': '513100'},
                {'name': '创业板 ETF', 'code': '159915'},
                {'name': '国债 ETF 国泰', 'code': '511010'}
            ],
            'defaultParams': {'windowDays': 25, 'annualDays': 250}
        }
    }
    
    all_dates = data['dates']
    all_prices = data['prices']
    
    # 读取现有历史
    try:
        with open(history_file, 'r', encoding='utf-8') as f:
            history = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        history = {}
    
    for page_id, cfg in page_configs.items():
        etf_data = cfg['etfData']
        window_days = cfg['defaultParams']['windowDays']
        annual_days = cfg['defaultParams']['annualDays']
        storage_prefix = cfg['storagePrefix']
        history_key = storage_prefix + 'rank_history'
        
        # 提取需要的 ETF 价格
        my_prices = {}
        for etf in etf_data:
            if etf['code'] in all_prices:
                my_prices[etf['code']] = all_prices[etf['code']]
        
        # 生成历史排名（从 window_days-1 开始）
        snapshots = []
        start_idx = window_days - 1
        
        for i in range(start_idx, len(all_dates)):
            # 切片价格数据到当前日期
            sliced_prices = {}
            for code in my_prices:
                sliced_prices[code] = my_prices[code][:i+1]
            
            # 计算排名
            results = []
            for etf in etf_data:
                prices = sliced_prices.get(etf['code'], [])
                score_data = calc_score(prices, window_days, annual_days)
                results.append({**etf, **score_data})
            
            results.sort(key=lambda x: x['score'], reverse=True)
            
            # 构建排名数据
            rankings = [
                {'rank': idx+1, 'code': r['code'], 'name': r['name'], 'score': r['score']}
                for idx, r in enumerate(results)
            ]
            
            snapshots.append({
                'time': all_dates[i][5:],  # MM-DD format
                'rankings': rankings
            })
        
        # 只保留最近 60 天
        if len(snapshots) > 60:
            snapshots = snapshots[-60:]
        
        # 保存到历史
        history[history_key] = snapshots
        
        print(f'[RANK] Page {page_id}: generated {len(snapshots)} days of rankings')
    
    # 保存文件
    with open(history_file, 'w', encoding='utf-8') as f:
        json.dump(history, f, ensure_ascii=False, indent=2)
    
    print(f'[SAVED] {history_file}')

if __name__ == '__main__':
    print('[START] Getting ETF prices...')
    prices = fetch_etf_prices()
    if prices:
        save_to_json(prices)
        compute_and_save_rankings()
        print(f'[DONE] Got {len(prices)} ETF prices and computed rankings')
    else:
        print('[FAILED] Check network')
