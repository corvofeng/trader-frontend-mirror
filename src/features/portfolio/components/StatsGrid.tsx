import { Theme, themes } from '../../../lib/theme';
import { InfoTooltip } from '../../../shared/components';
import type { CurrencyConfig } from '../../../shared/types';
import { formatCurrency } from '../../../shared/utils/format';

interface StatsGridProps {
  theme: Theme;
  currencyConfig: CurrencyConfig;
  latestTrendValue: number;
  totalHoldingsValue: number;
  positionRatio: number;
  totalProfitLoss: number;
  remainingCash: number;
  hasTrendData?: boolean;
}

export function StatsGrid({
  theme,
  currencyConfig,
  latestTrendValue,
  totalHoldingsValue,
  positionRatio,
  totalProfitLoss,
  remainingCash,
  hasTrendData = false,
}: StatsGridProps) {
  const statItems = [
    {
      label: '总市值',
      tooltip: hasTrendData
        ? '优先使用最新一条总资产趋势数据，表示组合在当前时点的总资产估值。'
        : '当前没有趋势数据时，使用持仓市值作为总市值近似值。',
      value: formatCurrency(latestTrendValue, currencyConfig),
      valueTitle: formatCurrency(latestTrendValue, currencyConfig),
      description: hasTrendData ? 'Based on latest trend data' : 'Based on holdings value',
      valueClassName: themes[theme].text,
    },
    {
      label: '总仓位',
      tooltip: '所有持仓证券当前市值之和，不包含未持仓现金部分。',
      value: formatCurrency(totalHoldingsValue, currencyConfig),
      valueTitle: formatCurrency(totalHoldingsValue, currencyConfig),
      description: 'Sum of all holdings market value',
      valueClassName: themes[theme].text,
    },
    {
      label: '剩余现金',
      tooltip: '账户剩余的可用现金（估算为：总市值 - 总仓位）。',
      value: formatCurrency(remainingCash, currencyConfig),
      valueTitle: formatCurrency(remainingCash, currencyConfig),
      description: 'Estimated remaining cash balance',
      valueClassName: themes[theme].text,
    },
    {
      label: '持仓比例',
      tooltip: '持仓市值 / 总市值。数值越高，代表当前资金越多处于已持仓状态。',
      value: `${positionRatio.toFixed(2)}%`,
      description: 'Holdings / Total market value',
      valueClassName: themes[theme].text,
    },
    {
      label: '持仓盈亏',
      tooltip: '所有当前持仓的浮动盈亏合计，反映未平仓头寸相对成本的整体赚亏情况。',
      value: `${totalProfitLoss >= 0 ? '+' : ''}${formatCurrency(Math.abs(totalProfitLoss), currencyConfig)}`,
      valueTitle: `${totalProfitLoss >= 0 ? '+' : ''}${formatCurrency(Math.abs(totalProfitLoss), currencyConfig)}`,
      description: 'Sum of all holdings P/L',
      valueClassName: totalProfitLoss >= 0 ? 'text-green-600' : 'text-red-600',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-6">
      {statItems.map((item) => (
        <div key={item.label} className={`${themes[theme].background} rounded-lg p-3 md:p-4 min-w-0`}>
          <div className="flex items-center gap-1.5">
            <h3 className={`text-sm md:text-base font-medium ${themes[theme].text} opacity-75 truncate`}>
              {item.label}
            </h3>
            <InfoTooltip theme={theme} content={item.tooltip} align="left" className="shrink-0" />
          </div>
          <p className={`text-base sm:text-lg md:text-xl lg:text-2xl font-bold mt-1 truncate ${item.valueClassName}`} title={item.valueTitle}>
            {item.value}
          </p>
          <p className={`text-xs md:text-sm ${themes[theme].text} opacity-60 mt-1 truncate`}>
            {item.description}
          </p>
        </div>
      ))}
    </div>
  );
}
