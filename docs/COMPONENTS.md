# Trader Frontend 组件索引文档

本文件是项目中各个核心组件详细文档的入口。每个核心组件都在其源码目录下拥有一个同名的 `.md` 文档。

## 期权交易模块 (Options Feature)

- **[OptionsChain](../src/features/options/components/OptionsChain.md)**: 期权链联动视图，展示 Calls/Puts 详情。
- **[OptionsPortfolio](../src/features/options/components/OptionsPortfolio.md)**: 期权持仓管理，支持多视图模式和实时价格同步。
- **[StrategyCreator](../src/features/options/components/StrategyCreator.md)**: 交互式策略构建器，提供模板引导。
- **[RiskAnalysis](../src/features/options/components/RiskAnalysis.md)**: 3D 盈亏曲面分析与保证金压力测试。
- **[OptionsTradePlans](../src/features/options/components/OptionsTradePlans.md)**: 自动化交易计划管理（比率价差）。
- **[OptionWhitelistManager](../src/features/options/components/OptionWhitelistManager.md)**: 期权合约白名单维护。

## 投资组合模块 (Portfolio Feature)

- **[Portfolio](../src/features/portfolio/components/Portfolio.md)**: 核心持仓与资产走势看板，支持分享与导出。

## 交易执行模块 (Trading Feature)

- **[TradeForm](../src/features/trading/components/TradeForm/TradeForm.md)**: 股票交易计划录入表单。

---

## 文档维护指南

1. **同步更新**：每当修改组件的核心逻辑或新增 Props 时，请务必同步更新对应的 `.md` 文档。
2. **结构规范**：文档应包含“主要功能”、“核心逻辑”、“属性 (Props)”和“扩展建议”四个部分。
3. **新增组件**：新建业务逻辑复杂的组件时，请参照现有模式在同级目录下创建 Markdown 文档并在本索引中登记。
