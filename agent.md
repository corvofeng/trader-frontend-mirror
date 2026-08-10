# Agent 说明

## 项目背景

- 这是一个以股票和期权交易流程为核心的金融前端项目。
- 技术栈以 React、TypeScript、ECharts 和 `lightweight-charts` 为主。

## 设计技能（design-taste-frontend）

- **来源**：项目中已集成 `design-taste-frontend` 技能，用于 Landing 页、Portfolio 页和整体重设计场景。
  - GitHub 仓库：`https://github.com/Leonxlnx/taste-skill`
  - 技能路径：`skills/taste-skill/SKILL.md`
  - 本地产物：`.agents/skills/design-taste-frontend/SKILL.md` 与 `skills-lock.json`
- **三档表盘**（全局可调，对话覆盖默认）：
  - `DESIGN_VARIANCE`：1=完美对称，10=艺术化非对称。默认 `8 / 6 / 4`。
  - `MOTION_INTENSITY`：1=纯静态，10=电影级滚动叙事。金融仪表盘建议 `4`。
  - `VISUAL_DENSITY`：1=留白画廊，10=驾驶舱密排。交易页面按用户偏好建议 `8`。
- **反默认戒律（Anti-Default Discipline）**：
  - 拒绝 AI 紫渐变 + 暗色 mesh + 三列等宽卡片的通用模板。
  - 拒绝所有可见位置出现 em-dash（`—`），日期/数值范围用普通连字符。
  - 拒绝每个 section 顶部加 `uppercase tracking-wider` 的"eyebrow 小标签"，上限为 ceil(sectionCount/3)。
  - 拒绝默认 `Inter` 字体、拒绝 Fraunces / Instrument_Serif（除非品牌明示）。
  - 拒绝 hero 或任何 section 左上角飘着版本号/时间/城市天气条。
  - 拒绝列表行同时加 `border-t + border-b`，二选一或用稀疏分隔。
- **形状一致性锁（Shape Consistency Lock）**：
  - 全页只允许一套圆角系统：要么全锐利（r=0）、要么全柔和（r=12~16px）、要么全胶囊（full）。
  - 圆角与阴影配合：阴影色调必须与背景色同类色，不可是纯黑投影。
- **Liquid Glass / 毛玻璃**：
  - 仅在 premium/浮窗/overlay 场景使用，且需配套 `border-white/10` 内描边与 `shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]`。
  - 必须提供 `prefers-reduced-transparency` 的实色降级。
- **色彩一致性锁（Color Consistency Lock）**：
  - 全页仅一个主强调色（accent），中性灰统一冷暖（Slate/Zinc/Stone 选一个族）。
  - 金融盘口的红绿涨跌色为语义色，不算 accent；accent 用于主按钮、进度条等品牌元素。
- **Redesign - Preserve 模式**（适用于本项目的重设计请求）：
  1. Audit 先行：提取现有品牌 tokens（主色、圆角、字号、阴影）。
  2. 优先复用信息架构（URL、nav 标签、表单字段名不动，避免破坏 GA/埋点）。
  3. 改进顺序：字体 → 间距节奏 → 色彩校准 → 微动效 → 关键 section 重排 → 整块替换。
- **Pre-Flight 必查清单**（交付前至少心算一遍）：
  - 零 em-dash、圆角统一、主色一致、CTA 一行不折行、CTA 文本可读对比度 ≥ WCAG AA。
  - `VISUAL_DENSITY ≥ 7` 时禁用通用卡片盒，改用细线分隔与直接布局。
  - 移动端多列布局需显式声明 `<768px` 的单列回退，不依赖 Tailwind 隐式。

## 用户偏好

- 默认使用中文沟通与输出。
- 偏好紧凑的移动端布局，在小屏设备上尽量减少非核心信息占用。
- 当界面中的金融数值依赖常数、合约单位或倍数计算时，偏好更透明、可核对的展示方式。
- 在组合或策略分析场景下，偏好按"单份 / 1 份组合"口径展示，而不是按总持仓放大。
- 对关键交易操作，偏好"手动触发"而不是"自动回填"或"自动推断"。
- 对买卖这类有限选项，偏好使用按钮，而不是下拉框。
- 在交易确认区域，偏好明确展示"付出什么 / 获得什么"，并带上账户信息。
- 偏好"有数据即展示"，拒绝等待更多数据点的占位状态。
- 偏好通过呼吸点、波纹或"刚刷新"文字等视觉反馈确认数据流活跃。

## 浏览器检查

- 进行浏览器检查时，默认使用 `https://stock.in.corvo.fun`。
- 除非用户明确要求本地验证，否则优先在该域名下检查真实页面，而不是临时启动本地预览。
- 验证 Journal 交易流程时，优先从 `https://stock.in.corvo.fun/journal?tab=trades` 开始。
- 默认先通过读代码、搜索组件和静态诊断定位问题；不要机械地每次都先打开页面或截图。
- 只有在涉及真实视觉表现、响应式布局、遮挡、滚动、拖动、动画或其它明显依赖运行态表现的问题时，才进行浏览器检查。
- 浏览器检查应尽量最小化；若只需确认现象或验证修复，不要反复截图或重复打开页面。
- 如果用户明确指定"先打开页面复现"或"不要打开页面，先改代码"，则按用户要求执行。

## 界面与交互规则

- `TradeForm.tsx` 中，买卖方向默认应为未选择状态。
- `TradeForm.tsx` 中，点击盘口价格回填时，只允许回填价格，禁止自动切换买卖方向。
- `TradeForm.tsx` 中，总价值区域应更像简洁的确认单，明确区分 `Spend` 与 `Receive`。
- 在移动端，优先使用分段按钮、胶囊按钮等形式，避免桌面端下划线式 Tabs。
- 类似 `ExpiryFastNav` 的移动端导航，在折叠状态下只保留最关键的信息。

## 领域规则

- 标准 ETF 期权计算时，优先采用 `10000` 作为合约单位，并在合适场景下显式展示。
- 组合或策略收益展示时，在适用场景下按"1 份组合"口径展示。
- 合并期权策略持仓数据时，必须保留原始腿的买卖方向；应采用字段补足，而不是整对象替换。

## 经验与注意事项

- 不要只依赖 `option_type` 识别策略，应结合更多维度增强识别逻辑。
- 移动端布局应避免过于碎片化；如果横向紧凑排布仍能保证可读性，应优先保持整体感。
- **`fillContainer` + `h-full` 使用约束**（2026-08-10 Bug 复盘）：
  - **触发场景**：`StockQuotePanel.tsx` → `KlineBlock` 中，对 `StockChart` 同时传入 `fillContainer` 和 `className="h-[420px] sm:h-[600px] w-full"`，但 `StockChart` 外层的包装 div 没有显式高度。
  - **根因**：`fillContainer` 会在 `StockChart` 外层加 `h-full flex flex-col`（见 `StockChart.tsx` line 746）。`h-full` = `height: 100%`，要求父容器有明确高度；若父容器高度为 auto，则 `h-full` 与显式高度类（`h-[420px]`）冲突，**在移动端/Tailwind 生成顺序下 `h-full` 会覆盖显式高度**，导致外层 flex 容器塌缩为纯内容高度（仅工具栏），图表视口 `flex-1 min-h-0` 高度近 0，K 线不可见。桌面端仍能显示是因为 `sm:h-[600px]` 在更大屏幕的 media query 下有时能更高优先级生效。
  - **修复模式（对齐 `StockAnalysisModal.tsx` 的正确用法）**：
    1. 在 `<StockChart fillContainer />` 之外，再套一层 `div` 并给它显式高度（如 `h-[420px] sm:h-[600px] w-full`），然后 `StockChart` 自身不再传显式高度 className，让 `fillContainer` 的 `h-full` 正确填满父容器。
    2. 或者：若使用场景中没有合适的 flex 父容器，直接对 `StockChart` 使用**非** `fillContainer` 模式，让它自带的 `h-[400px] sm:h-[500px] md:h-[600px]` 视口高度生效。
  - **检查清单**：任何给 `<StockChart fillContainer />` 的调用点，都要沿着 DOM 向上核对——是否存在一条有明确高度（像素、vh、或 flex 链上带 `min-h-0` 的祖先）的高度约束链。缺失就加包装层。
