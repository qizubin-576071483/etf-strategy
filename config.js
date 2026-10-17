const PAGE_CONFIGS = {
    '4': {
        title: '纯趋势动量 · 排名轨迹 · 带交互',
        headerTitle: '📈 纯趋势动量 · 排名轨迹',
        storagePrefix: 'etf_simple_trend_',
        etfData: [
            { name: '沪深300ETF', code: '510300' },
            { name: '创业板ETF', code: '159915' },
            { name: '国泰纳指ETF', code: '513100' },
            { name: '华安黄金ETF', code: '518880' }
        ],
        fixedColors: ['#38bdf8', '#f87171', '#4ade80', '#fbbf24'],
        defaultParams: { windowDays: 25, annualDays: 250 },
        displayMax: 4,
        hasHistoryTable: true,
        defaultWindowDays: 25
    },
    '5': {
        title: '纯趋势动量 · 5只多资产 · 排名轨迹 · 带交互',
        headerTitle: '📈 纯趋势动量 · 5只多资产 · 排名轨迹',
        storagePrefix: 'etf_simple_trend_5_',
        etfData: [
            { name: '黄金ETF华安', code: '518880' },
            { name: '红利ETF', code: '510880' },
            { name: '纳指ETF', code: '513100' },
            { name: '创业板ETF', code: '159915' },
            { name: '国债ETF国泰', code: '511010' }
        ],
        fixedColors: ['#f87171','#38bdf8','#4ade80','#fbbf24','#c084fc'],
        defaultParams: { windowDays: 25, annualDays: 250 },
        displayMax: 5,
        hasHistoryTable: true,
        defaultWindowDays: 25
    },
    '9': {
        title: '纯趋势动量 · 9只多资产 · 排名轨迹 · 带交互',
        headerTitle: '📈 纯趋势动量 · 9只多资产 · 排名轨迹',
        storagePrefix: 'etf_simple_trend_9_',
        etfData: [
            { name: '黄金ETF华安', code: '518880' },
            { name: '有色金属ETF南方', code: '512400' },
            { name: '国债ETF国泰', code: '511010' },
            { name: '德国ETF华安', code: '513030' },
            { name: '纳指ETF国泰', code: '513100' },
            { name: '恒生互联网ETF华夏', code: '513330' },
            { name: '科创50ETF华夏', code: '588000' },
            { name: '创业板ETF易方达', code: '159915' },
            { name: '沪深300ETF华泰柏瑞', code: '510300' }
        ],
        fixedColors: ['#f87171','#38bdf8','#4ade80','#fbbf24','#c084fc','#fb923c','#2dd4bf','#e879f9','#60a5fa'],
        defaultParams: { windowDays: 25, annualDays: 250 },
        displayMax: 4,
        hasHistoryTable: false,
        defaultWindowDays: 25
    },
    '12': {
        title: '纯趋势动量 · 12只ETF · 排名轨迹 · 带交互',
        headerTitle: '📈 纯趋势动量 · 12只ETF · 排名轨迹',
        storagePrefix: 'etf_simple_trend_12_',
        etfData: [
            { name: '黄金ETF华安', code: '518880' }, { name: '红利ETF华泰柏瑞', code: '510880' },
            { name: '沪深300ETF华泰柏瑞', code: '510300' }, { name: '有色金属ETF南方', code: '512400' },
            { name: '券商ETF华宝', code: '512000' }, { name: '医药ETF易方达', code: '512010' },
            { name: '酒ETF鹏华', code: '512690' }, { name: '新能源车ETF华夏', code: '515030' },
            { name: '机器人ETF华夏', code: '562500' }, { name: '通信ETF国泰', code: '515880' },
            { name: '人工智能ETF易方达', code: '159819' }, { name: '半导体ETF国联安', code: '512480' }
        ],
        fixedColors: ['#f87171','#38bdf8','#4ade80','#fbbf24','#c084fc','#fb923c','#2dd4bf','#e879f9','#60a5fa','#f472b6','#a3e635','#facc15'],
        defaultParams: { windowDays: 10, annualDays: 250 },
        displayMax: 4,
        hasHistoryTable: false,
        defaultWindowDays: 10
    }
};
