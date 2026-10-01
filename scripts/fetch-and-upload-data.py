#!/usr/bin/env python3
import urllib.request
import json
import os
import subprocess
import sys
from datetime import datetime

BASE_URL = os.environ.get('STOCK_API_BASE', 'https://stock.in.corvo.fun')
ALIAS = os.environ.get('STOCK_ACCOUNT_ALIAS', 'main_gjzq_qmt')
USER_ID = os.environ.get('STOCK_USER_ID', 'corvo')

def fetch_json(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (trader-sync)'})
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode('utf-8'))

def main():
    print(f"📡 正在从后端拉取最新数据: {BASE_URL} (账户: {ALIAS}) ...")
    
    # 1. Accounts
    accounts = fetch_json(f'{BASE_URL}/api/accounts')
    for acc in accounts:
        if acc.get('currency') == 'RMB':
            acc['currency'] = 'CNY'

    # 2. Holdings (Positions)
    portfolio_data = fetch_json(f'{BASE_URL}/api/portfolio/{ALIAS}')
    positions = portfolio_data.get('positions', [])

    # 3. Kline
    kline = fetch_json(f'{BASE_URL}/api/portfolio/{ALIAS}/kline?userId={USER_ID}')

    # Determine latest date from kline or positions
    if kline and len(kline) > 0:
        latest_date = kline[-1].get('date', datetime.now().strftime('%Y-%m-%d'))
    else:
        latest_date = datetime.now().strftime('%Y-%m-%d')

    print(f"📅 最新数据日期: {latest_date}")

    # 4. Trend
    trend = fetch_json(f'{BASE_URL}/api/portfolio/{ALIAS}/trend?userId={USER_ID}&startDate=2026-01-01&endDate={latest_date}')

    # 5. Trades
    trades = fetch_json(f'{BASE_URL}/api/portfolio/{ALIAS}/recent-trades?userId={USER_ID}&startDate=2026-01-01&endDate={latest_date}')
    for t in trades:
        if 'created_at' in t and 'date' not in t:
            t['date'] = t['created_at'][:10]

    # 6. Metrics
    metrics = fetch_json(f'{BASE_URL}/api/portfolio/{ALIAS}/metrics?userId={USER_ID}')

    # 7. Operations
    operations = fetch_json(f'{BASE_URL}/api/portfolio/{ALIAS}/operations')

    # 8. Portfolio Analysis
    try:
        analysis = fetch_json(f'{BASE_URL}/api/analysis/portfolio/{ALIAS}?userId={USER_ID}')
    except Exception as e:
        print(f"⚠️ 获取分析数据失败: {e}")
        analysis = None

    # 9. Stock Configs (for Heatmap categories and tags)
    try:
        stock_configs = fetch_json(f'{BASE_URL}/api/stock-configs')
        print(f"🏷️ 获取股票分类标签配置: {len(stock_configs)} 条")
    except Exception as e:
        print(f"⚠️ 获取股票分类配置失败: {e}")
        stock_configs = []

    # Assemble complete data bundle
    bundle = {
        "accounts": accounts,
        "holdings": positions,
        "kline": kline,
        "trend": trend,
        "trades": trades,
        "metrics": metrics,
        "today_orders": [],
        "operations": operations,
        "prompts": [],
        "portfolio_analysis": analysis,
        "stock_configs": stock_configs
    }

    # Save to mock_data directory
    os.makedirs('mock_data', exist_ok=True)
    out_file = f"mock_data/{latest_date}.json"
    with open(out_file, 'w', encoding='utf-8') as f:
        json.dump(bundle, f, ensure_ascii=False, indent=2)
    print(f"💾 数据包已写入: {out_file} (大小: {os.path.getsize(out_file)} 字节)")

    latest_file = "mock_data/latest.json"
    latest_payload = {
        "date": latest_date,
        "stock_configs": stock_configs
    }
    with open(latest_file, 'w', encoding='utf-8') as f:
        json.dump(latest_payload, f, ensure_ascii=False, indent=2)
    print(f"💾 日期指针与热力图配置已写入: {latest_file} -> {latest_date}")

    # Upload to Cloudflare R2 if requested
    if '--no-upload' not in sys.argv:
        print("\n🚀 开始上传数据到 Cloudflare R2 (blog 存储桶)...")
        # Upload data bundle
        cmd1 = [
            "npx", "wrangler", "r2", "object", "put",
            f"blog/stock/web/{latest_date}.json",
            f"--file={out_file}",
            "--content-type=application/json; charset=utf-8",
            "--remote"
        ]
        print(f"执行: {' '.join(cmd1)}")
        subprocess.check_call(cmd1)

        # Upload latest.json pointer
        cmd2 = [
            "npx", "wrangler", "r2", "object", "put",
            "blog/stock/web/latest.json",
            f"--file={latest_file}",
            "--content-type=application/json; charset=utf-8",
            "--remote"
        ]
        print(f"执行: {' '.join(cmd2)}")
        subprocess.check_call(cmd2)

        print("\n✅ R2 上传完成！正在验证线上接口...")
        try:
            req = urllib.request.Request("https://rawforcorvofeng.cn/stock/web/latest.json", headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req) as resp:
                result = json.loads(resp.read().decode('utf-8'))
                print(f"🎉 线上 latest.json 当前已更新为: {result}")
        except Exception as e:
            print(f"⚠️ 校验线上接口提示: {e}")

if __name__ == '__main__':
    main()
