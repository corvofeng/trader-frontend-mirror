# S3 / Cloudflare R2 静态数据直连部署指南

本方案摒弃了传统的 Cloudflare Worker 路由代理，改由前端直接请求存储在 S3 / Cloudflare R2 存储桶中的合并静态 JSON 文件，并在浏览器端进行内存级路由解析与过滤。

## 1. 数据结构设计

每次更新数据时，将以下两个 JSON 文件上传至存储桶对应的目录下（例如 `s3://blog/stock/web/`）：

### A. 日期指针：`latest.json`
用于标记最新的数据发布日期：
```json
{
  "date": "2026-07-25"
}
```

### B. 完整数据包：`2026-07-25.json`
按日期归档的完整结构体：
```json
{
  "accounts": [
    {
      "id": "main-account-id",
      "name": "个人主账户",
      "currency": "CNY",
      "alias": "main-acc",
      "is_default": true
    }
  ],
  "holdings": [
    {
      "stock_code": "600519.SH",
      "stock_name": "贵州茅台",
      "quantity": 300,
      "cost_price": 1580,
      "current_price": 1650,
      "total_value": 495000,
      "profit_loss": 21000,
      "profit_loss_percentage": 4.43
    }
  ],
  "kline": [],
  "trend": [],
  "trades": [],
  "metrics": {},
  "today_orders": [],
  "operations": [],
  "prompts": []
}
```

---

## 2. 存储桶配置与上传

### A. 存储桶配置
1. **绑定自定义域名**：在存储桶设置中绑定域名（如 `https://rawforcorvofeng.cn`）。
2. **启用 CORS 跨域许可**：前端浏览器需要跨域直接拉取文件，必须在存储桶的 CORS 选项中增加允许 `GET` 与 `OPTIONS` 的配置，例如：
   ```json
   [
     {
       "AllowedOrigins": ["*"],
       "AllowedMethods": ["GET", "OPTIONS"],
       "AllowedHeaders": ["*"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

### B. 命令行上传
无论是 Cloudflare R2 还是 AWS S3，在上传文件时**务必指定 `Content-Type` 为 `application/json; charset=utf-8`**，以防止中文乱码：

#### 1) 使用 Cloudflare Wrangler (R2) 上传到 `blog` 桶的 `stock/web/` 下：
```bash
# 上传完整数据
npx wrangler r2 object put blog/stock/web/2026-07-25.json --file=./mock_data/2026-07-25.json --content-type="application/json; charset=utf-8" --remote

# 上传日期指针
npx wrangler r2 object put blog/stock/web/latest.json --file=./mock_data/latest.json --content-type="application/json; charset=utf-8" --remote
```

#### 2) 使用 AWS CLI (S3) 上传：
```bash
# 上传完整数据
aws s3 cp ./mock_data/2026-07-25.json s3://blog/stock/web/2026-07-25.json --content-type "application/json; charset=utf-8"

# 上传日期指针
aws s3 cp ./mock_data/latest.json s3://blog/stock/web/latest.json --content-type "application/json; charset=utf-8"
```

---

## 3. 前端配置

在你的本地环境变量或部署环境（例如 `.env` 文件）中配置 `VITE_STATIC_DB_BASE_URL`：

```bash
VITE_STATIC_DB_BASE_URL="https://rawforcorvofeng.cn/stock/web"
```

只要配置了该参数，前端项目中的 [src/main.tsx](file:///home/corvo/GitRepo/trader-frontend/src/main.tsx) 就会自动启用“静态直连拦截器”：
1. 页面载入时自动发起请求拉取 `latest.json`。
2. 根据拉取到的日期去下载对应的数据文件（如 `2026-07-25.json`）并将其缓存在本地内存中。
3. 拦截项目内部所有类似 `/api/accounts`、`/api/portfolio/xxx/holdings` 的调用，并自动在内存中进行切片路由，使得前端不需要对底层服务 API 做任何重构，就可以完美无缝地运行。
---

## 4. 一键同步持仓 Python 脚本

项目提供了脚本 [scripts/sync-holdings.py](file:///home/corvo/GitRepo/trader-frontend/scripts/sync-holdings.py)，支持从实盘服务拉取所有持仓、净值 K 线、收益趋势、交易记录及分析报告，并一键推送到 Cloudflare R2：

```bash
# 一键拉取并上传（默认 API: https://stock.in.corvo.fun，账户: main_gjzq_qmt）
python3 scripts/sync-holdings.py
# 或
npm run sync:holdings

# 仅生成本地归档文件，不执行 R2 上传
python3 scripts/sync-holdings.py --no-upload

# 显式指定日期或自定义账户
python3 scripts/sync-holdings.py --date 2026-10-07 --account main_gjzq_qmt

# 直接上传现有的本地 JSON 文件
python3 scripts/sync-holdings.py --file mock_data/2026-09-30.json
```

---

## 5. GitHub Actions 自动更新 (Tag 触发)

已配置工作流 [.github/workflows/deploy-cloudflare.yml](file:///home/corvo/GitRepo/trader-frontend/.github/workflows/deploy-cloudflare.yml)。

只要推送以 `v` 开头的 Tag（例如 `v0.2.5`），GitHub Actions 将自动执行：
1. 安装依赖并构建 Cloudflare 静态产物 (`npm run build:cf`)
2. 使用 Cloudflare Wrangler 自动部署至 Worker 路由 `stock-web.corvo.fun/*`

> **注**：需在 GitHub 仓库的 **Settings -> Secrets and variables -> Actions** 中配置：
> - `CLOUDFLARE_API_TOKEN`：具备 Workers/Pages 部署权限的 Cloudflare API 令牌
> - `CLOUDFLARE_ACCOUNT_ID`（可选）：Cloudflare 账户 ID
