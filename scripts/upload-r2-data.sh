#!/bin/bash
set -e

# 用法：
#   ./scripts/upload-r2-data.sh <data_json_file> [date]
# 示例：
#   ./scripts/upload-r2-data.sh mock_data/2026-07-25.json
#   ./scripts/upload-r2-data.sh /path/to/data.json 2026-10-01

FILE="$1"
DATE="$2"

if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  echo "❌ 错误: 请指定有效的数据 JSON 文件路径"
  echo "用法: $0 <data_json_file> [YYYY-MM-DD]"
  exit 1
fi

# 如果未指定日期，尝试从文件名提取 YYYY-MM-DD
if [ -z "$DATE" ]; then
  BASENAME=$(basename "$FILE")
  if [[ "$BASENAME" =~ ^([0-9]{4}-[0-9]{2}-[0-9]{2}) ]]; then
    DATE="${BASH_REMATCH[1]}"
  else
    echo "❌ 错误: 无法从文件名识别日期，请显式传入日期参数，例如: $0 $FILE 2026-10-01"
    exit 1
  fi
fi

echo "📦 准备上传数据文件: $FILE"
echo "📅 数据归档日期: $DATE"

# 1. 上传完整数据文件到 Cloudflare R2
echo "🚀 [1/2] 正在上传数据包到 blog/stock/web/${DATE}.json ..."
npx wrangler r2 object put "blog/stock/web/${DATE}.json" --file="$FILE" --content-type="application/json; charset=utf-8" --remote

# 2. 生成并上传 latest.json 日期指针
TMP_LATEST=$(mktemp)
echo "{\"date\":\"${DATE}\"}" > "$TMP_LATEST"

echo "🚀 [2/2] 正在上传日期指针到 blog/stock/web/latest.json ..."
npx wrangler r2 object put "blog/stock/web/latest.json" --file="$TMP_LATEST" --content-type="application/json; charset=utf-8" --remote
rm -f "$TMP_LATEST"

echo "✅ 上传完成！正在验证线上接口..."
curl -sL "https://rawforcorvofeng.cn/stock/web/latest.json"
echo ""
echo "🎉 静态数据已生效！刷新页面 https://stock-web.corvo.fun 即可展示最新数据。"
