# OptionsChain 组件文档

`OptionsChain` 是期权交易页面的核心组件，负责展示特定标的和到期日的期权链数据。

## 主要功能

- **三段式布局**：左侧为看涨期权（Calls），中间为固定行权价（Strikes），右侧为看跌期权（Puts）。
- **联动滚动**：左侧和右侧的表格支持横向联动滚动，确保对应的字段始终可见。
- **热力图展示**：根据时间价值（Time Value）自动渲染背景色深浅，直观展示高价值合约。
- **状态标识**：自动计算并展示 ATM（平值）、ITM（价内）、OTM（价外）状态。
- **缩放控制**：支持 50% - 110% 的缩放，优化移动端和不同分辨率下的显示效果。
- **字段自定义**：用户可以勾选需要显示的字段（成交量、持仓量、隐波、内在价值等）。

## 核心逻辑

- **ATM 计算**：通过 `getAtTheMoneyStrike` 函数，找到时间价值（Call + Put）最大的行权价作为当前的平值参考。
- **缩放持久化**：缩放比例通过 Cookie (`optionsChainZoom`) 持久化，有效期 180 天。
- **行高同步**：通过 `ResizeObserver` 和 `syncRowHeights` 确保三列对应的行高度一致。

## 属性 (Props)

| 属性名 | 类型 | 说明 |
| :--- | :--- | :--- |
| `theme` | `Theme` | 当前主题 (light, dark, blue) |
| `optionsData` | `OptionsData` | 期权链原始数据 |
| `selectedSymbol` | `string` | 当前选中的标的代码 |
| `selectedExpiry` | `string` | 当前选中的到期日 |
| `onExpiryChange` | `(expiry: string) => void` | 到期日切换回调 |

## 扩展建议

- **增加 Greeks 字段**：目前主要展示基础行情，可以增加 Delta, Gamma 等字段的开关。
- **点击交互**：点击最新价或行权价可以触发快速下单或加入策略构建器。
- **性能优化**：由于期权链数据较多，可以考虑引入虚拟滚动（Virtual Scrolling）来处理超长列表。
