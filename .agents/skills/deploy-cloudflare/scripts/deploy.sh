#!/usr/bin/env bash
set -euo pipefail

# Deploy script for Cloudflare (trader-frontend)
# Usage: ./scripts/deploy.sh ["Optional commit message"]

DOMAIN="https://stock.corvo.fun"

echo "🔍 [1/4] 检查 Git 工作区状态..."
git status -s

if [ -n "$(git status --porcelain)" ]; then
  COMMIT_MSG="${1:-"fix(cloudflare): update static assets and deployment configuration"}"
  echo "📝 发现未提交的修改，正在提交: ${COMMIT_MSG}"
  git add index.html wrangler.jsonc cloudflare_deployment_guide.md scripts/upload-r2-data.sh scripts/sync-holdings.py .agents/skills/deploy-cloudflare/
  git commit -m "${COMMIT_MSG}" || true
  echo "🚀 推送到远程仓库..."
  git push origin main || echo "⚠️ 推送远程遇到警告，继续执行本地部署..."
fi

echo "📦 [2/4] 构建 Cloudflare 静态产物..."
npm run build:cf

echo "⛅️ [3/4] 部署至 Cloudflare Workers..."
npm run deploy:cf

echo "🌐 [4/4] 验证线上服务可用性..."
sleep 2
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${DOMAIN}/" || echo "000")
echo "HTTP 状态码: ${HTTP_STATUS}"

if [ "${HTTP_STATUS}" = "200" ]; then
  echo "🎉 部署成功！线上已生效: ${DOMAIN}/"
else
  echo "⚠️ 状态码非 200 (${HTTP_STATUS})，请稍候片刻刷新检查 CDN 缓存。"
fi
