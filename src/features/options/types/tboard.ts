export type TBoardColumnKey =
  // 合约行情与度量属性 (Contract & market attributes)
  | 'lastPrice'      // 现价/最新价
  | 'timeValue'      // 时间价值
  | 'intrinsicValue' // 内在价值
  | 'impliedVol'     // 隐含波动率
  | 'openInterest'   // 未平仓量 (OI)
  | 'volume'         // 成交量
  // 持仓属性 (Portfolio position attributes)
  | 'right'          // 权利仓
  | 'obligation'     // 义务仓
  | 'covered'        // 备兑仓
  | 'combo'          // 组合
  | 'margin'         // 保证金
  // 希腊字母 (Greeks)
  | 'delta'          // Delta
  | 'gamma'          // Gamma
  | 'theta'          // Theta
  | 'vega';          // Vega

export type TBoardColumnCategory = 'quote' | 'position' | 'greek';

export interface TBoardColumnMeta {
  key: TBoardColumnKey;
  label: string;
  category: TBoardColumnCategory;
  description: string;
  defaultWidth?: string;
}

export const ALL_TBOARD_COLUMNS: TBoardColumnMeta[] = [
  // 行情度量
  { key: 'lastPrice', label: '现价', category: 'quote', description: '合约最新成交价/现价', defaultWidth: 'w-20' },
  { key: 'timeValue', label: '时间价值', category: 'quote', description: '期权权利金中超出内在价值的部分', defaultWidth: 'w-20' },
  { key: 'intrinsicValue', label: '内在价值', category: 'quote', description: '立即行权可获得的收益', defaultWidth: 'w-20' },
  { key: 'impliedVol', label: '隐含波动率', category: 'quote', description: '市场对未来波动预期的IV百分比', defaultWidth: 'w-20' },
  { key: 'openInterest', label: '未平仓量', category: 'quote', description: '未平仓合约总张数 (OI)', defaultWidth: 'w-20' },
  { key: 'volume', label: '成交量', category: 'quote', description: '当日累计成交张数', defaultWidth: 'w-20' },
  // 持仓属性
  { key: 'right', label: '权利', category: 'position', description: '买方持仓张数 (可用张数)', defaultWidth: 'w-20' },
  { key: 'obligation', label: '义务', category: 'position', description: '卖方持仓张数 (可用张数)', defaultWidth: 'w-16' },
  { key: 'covered', label: '备兑', category: 'position', description: '备兑持仓张数 (可用张数)', defaultWidth: 'w-16' },
  { key: 'combo', label: '组合', category: 'position', description: '组合持仓张数', defaultWidth: 'w-16' },
  { key: 'margin', label: '保证金', category: 'position', description: '单张卖方需占用的保证金', defaultWidth: 'w-20' },
  // 希腊字母
  { key: 'delta', label: 'Delta', category: 'greek', description: '标的价格变动对应的期权价格敏感度', defaultWidth: 'w-16' },
  { key: 'gamma', label: 'Gamma', category: 'greek', description: '标的价格变动对应的Delta敏感度', defaultWidth: 'w-16' },
  { key: 'theta', label: 'Theta', category: 'greek', description: '时间每流逝一天期权价值的衰减度', defaultWidth: 'w-16' },
  { key: 'vega', label: 'Vega', category: 'greek', description: '波动率每变化1%期权价值的变化量', defaultWidth: 'w-16' },
];

export const TBOARD_COLUMNS_BY_KEY: Record<TBoardColumnKey, TBoardColumnMeta> = ALL_TBOARD_COLUMNS.reduce(
  (acc, col) => {
    acc[col.key] = col;
    return acc;
  },
  {} as Record<TBoardColumnKey, TBoardColumnMeta>
);

// 默认持仓看板列（按由外向内排列：组合 -> 备兑 -> 义务 -> 权利 -> 保证金 -> 时间价值 -> 现价）
export const DEFAULT_PORTFOLIO_COLUMNS: TBoardColumnKey[] = [
  'combo',
  'covered',
  'obligation',
  'right',
  'margin',
  'timeValue',
  'lastPrice',
];

// 默认期权链行情列（按由外向内排列：未平仓量 -> 成交量 -> 隐含波动率 -> 内在价值 -> 时间价值 -> 现价）
export const DEFAULT_QUOTE_COLUMNS: TBoardColumnKey[] = [
  'openInterest',
  'volume',
  'impliedVol',
  'intrinsicValue',
  'timeValue',
  'lastPrice',
];

// 深度分析预设（含希腊字母）
export const FULL_ANALYTICS_COLUMNS: TBoardColumnKey[] = [
  'openInterest',
  'volume',
  'impliedVol',
  'delta',
  'gamma',
  'theta',
  'vega',
  'intrinsicValue',
  'timeValue',
  'lastPrice',
];
