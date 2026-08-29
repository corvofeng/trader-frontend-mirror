import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MarkdownViewer } from '../MarkdownViewer';
import { InteractiveMarkdownTable } from '../InteractiveMarkdownTable';

describe('MarkdownViewer & InteractiveMarkdownTable', () => {
  const sampleMarkdown = `### 标的: 588000.SH

## Rollover 报告

- 高风险移仓: 0
- 虚值平行移仓: 0
- 单腿价值耗尽 / 低时间价值: 7
- 组合价值耗尽: 1

## 时间价值过低 / 移仓观察

| 到期日 | 合约 | 类型 | TV | TV/Day | 阈值 | 可移仓 | 最佳候选 | 候选到期 | K | Net |
|---|---|---:|---:|---:|---:|---|---|---|---:|---:|
| 2026-09-23 | 科创50沽9月1950 (10011564) | 义务仓 | 293 | 11.27 | 15.00 | YES | 科创50沽9月1900 (10011563) | 2026-09-23 | 1.900 | -415.00 |
| 2026-09-23 | 科创50购9月2000 (10011605) | 备兑 | 138 | 5.31 | 15.00 | YES | 科创50购9月2050 (10011621) | 2026-09-23 | 2.050 | -94.00 |

### 单腿价值耗尽 / 平仓建议

| 合约 | 类型 | TV | TV/Day | M/TV | 数量 | 原因 |
|---|---|---:|---:|---:|---:|---|
| 科创50沽9月1950 (10011564) | 义务仓 | 293.00 | 11.27 | 17.1x | 1 | 保证金/时间价值 = 17.1x，建议平仓；建议移仓 |
| 科创50购9月2000 (10011605) | 备兑 | 138.00 | 5.31 | 0.0x | 2 | 收益率达到 92.1%，建议平仓；建议移仓 |

<details>
<summary>📋 行权与风险明细</summary>

| 合约名称 | 数量 | 行权价 | 状态 |
| :--- | :--- | :--- | :--- |
| 科创50购9月1700 | 7 | 1.700 | 实值 |

</details>
`;

  it('renders markdown with interactive tables and badges correctly', () => {
    const html = renderToString(<MarkdownViewer content={sampleMarkdown} theme="dark" />);
    expect(html).toContain('标的: 588000.SH');
    expect(html).toContain('Rollover 报告');
    expect(html).toContain('时间价值过低 / 移仓观察');
    expect(html).toContain('单腿价值耗尽 / 平仓建议');
    expect(html).toContain('义务仓');
    expect(html).toContain('备兑');
    expect(html).toContain('10011564');
    expect(html).toContain('行权与风险明细');
  });

  it('renders InteractiveMarkdownTable with sortable columns and summary metrics', () => {
    const headers = ['到期日', '合约', '类型', 'TV', 'Net'];
    const rows = [
      ['2026-09-23', '科创50沽9月1950 (10011564)', '义务仓', '293', '-415.00'],
      ['2026-09-23', '科创50购9月2000 (10011605)', '备兑', '138', '-94.00'],
    ];

    const html = renderToString(
      <InteractiveMarkdownTable headers={headers} rows={rows} theme="dark" caption="测试表格" />
    );

    expect(html).toContain('测试表格');
    expect(html).toContain('科创50沽9月1950');
    expect(html).toContain('10011564');
    expect(html).toContain('义务仓');
    expect(html).toContain('备兑');
    expect(html).toContain('-415.00');
    expect(html).toContain('条记录');
    expect(html).toContain('合计 Net');
  });
});
