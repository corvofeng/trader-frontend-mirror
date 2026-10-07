#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
同步实盘持仓与投资组合数据到 Cloudflare R2 / S3 静态存储
用法:
  python3 scripts/sync-holdings.py
  python3 scripts/sync-holdings.py --no-upload
  python3 scripts/sync-holdings.py --file mock_data/2026-10-01.json --date 2026-10-01
  python3 scripts/sync-holdings.py --account main_gjzq_qmt --api-base https://stock.in.corvo.fun
"""

import argparse
import json
import os
import subprocess
import sys
import urllib.request
from datetime import datetime

DEFAULT_API_BASE = os.environ.get('STOCK_API_BASE', 'https://stock.in.corvo.fun')
DEFAULT_ALIAS = os.environ.get('STOCK_ACCOUNT_ALIAS', 'main_gjzq_qmt')
DEFAULT_USER_ID = os.environ.get('STOCK_USER_ID', 'corvo')
DEFAULT_BUCKET_PREFIX = 'blog/stock/web'
DEFAULT_VERIFY_URL = 'https://rawforcorvofeng.cn/stock/web/latest.json'


def fetch_json(url: str, timeout: int = 15):
    req = urllib.request.Request(
        url,
        headers={
            'User-Agent': 'Mozilla/5.0 (trader-holdings-sync)',
            'Accept': 'application/json',
        }
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode('utf-8'))


def upload_to_r2(local_file: str, r2_key: str, dns_override_path: str = None):
    cmd = [
        "npx", "wrangler", "r2", "object", "put",
        r2_key,
        f"--file={local_file}",
        "--content-type=application/json; charset=utf-8",
        "--remote"
    ]
    env = os.environ.copy()
    if dns_override_path and os.path.exists(dns_override_path):
        env["NODE_OPTIONS"] = f"-r {os.path.abspath(dns_override_path)}"

    print(f"  ➜ 执行上传: {' '.join(cmd)}")
    result = subprocess.run(cmd, env=env)
    if result.returncode != 0:
        raise RuntimeError(f"Wrangler 上传失败: {r2_key} (退出码: {result.returncode})")


def main():
    parser = argparse.ArgumentParser(description="同步实盘持仓与数据至 Cloudflare R2 / 静态托管")
    parser.add_argument(
        "--api-base",
        default=DEFAULT_API_BASE,
        help=f"实盘后端 API 根地址 (默认: {DEFAULT_API_BASE})"
    )
    parser.add_argument(
        "--account",
        default=DEFAULT_ALIAS,
        help=f"账户别名 (默认: {DEFAULT_ALIAS})"
    )
    parser.add_argument(
        "--user-id",
        default=DEFAULT_USER_ID,
        help=f"用户 ID (默认: {DEFAULT_USER_ID})"
    )
    parser.add_argument(
        "--date",
        default=None,
        help="归档日期 (格式: YYYY-MM-DD，留空则根据后端最新 K 线或当天日期推断)"
    )
    parser.add_argument(
        "--file",
        default=None,
        help="直接从本地现有 JSON 数据文件上传，跳过 API 请求"
    )
    parser.add_argument(
        "--bucket-prefix",
        default=DEFAULT_BUCKET_PREFIX,
        help=f"R2 存储桶前缀 (默认: {DEFAULT_BUCKET_PREFIX})"
    )
    parser.add_argument(
        "--no-upload",
        action="store_true",
        help="仅生成本地数据文件，不上传到 Cloudflare R2"
    )
    parser.add_argument(
        "--verify-url",
        default=DEFAULT_VERIFY_URL,
        help=f"校验线上的 latest.json URL (默认: {DEFAULT_VERIFY_URL})"
    )
    args = parser.parse_args()

    # 定位 DNS 覆写脚本
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    dns_override = os.path.join(repo_root, "scripts", "dns-override.cjs")

    if args.file:
        if not os.path.isfile(args.file):
            print(f"❌ 找不到指定的本地文件: {args.file}")
            sys.exit(1)
        print(f"📂 使用本地文件: {args.file}")
        with open(args.file, 'r', encoding='utf-8') as f:
            bundle = json.load(f)

        latest_date = args.date
        if not latest_date:
            basename = os.path.basename(args.file)
            if len(basename) >= 10 and basename[:10].count('-') == 2:
                latest_date = basename[:10]
            else:
                latest_date = datetime.now().strftime('%Y-%m-%d')
        stock_configs = bundle.get("stock_configs", [])
        out_file = args.file
    else:
        print(f"📡 正在从后端拉取持仓数据...")
        print(f"   API: {args.api_base}")
        print(f"   账户: {args.account}")
        print(f"   用户: {args.user_id}")

        # 1. 账户列表
        try:
            accounts = fetch_json(f'{args.api_base}/api/accounts')
            for acc in accounts:
                if acc.get('currency') == 'RMB':
                    acc['currency'] = 'CNY'
            print(f"  ✓ 成功获取账户列表 ({len(accounts)} 个)")
        except Exception as e:
            print(f"  ⚠️ 获取账户列表失败: {e}")
            accounts = []

        # 2. 持仓 (Positions)
        try:
            portfolio_data = fetch_json(f'{args.api_base}/api/portfolio/{args.account}')
            positions = portfolio_data.get('positions', [])
            print(f"  ✓ 成功获取当前持仓 ({len(positions)} 个标的)")
        except Exception as e:
            print(f"  ⚠️ 获取持仓数据失败: {e}")
            positions = []

        # 3. K线
        try:
            kline = fetch_json(f'{args.api_base}/api/portfolio/{args.account}/kline?userId={args.user_id}')
            print(f"  ✓ 成功获取净值K线 ({len(kline)} 根)")
        except Exception as e:
            print(f"  ⚠️ 获取K线失败: {e}")
            kline = []

        # 判定归档日期
        if args.date:
            latest_date = args.date
        elif kline and len(kline) > 0 and kline[-1].get('date'):
            latest_date = kline[-1]['date']
        else:
            latest_date = datetime.now().strftime('%Y-%m-%d')

        print(f"📅 归档日期: {latest_date}")

        # 4. 收益走势
        try:
            trend = fetch_json(
                f'{args.api_base}/api/portfolio/{args.account}/trend?userId={args.user_id}&startDate=2026-01-01&endDate={latest_date}'
            )
            print(f"  ✓ 成功获取趋势走势 ({len(trend)} 点)")
        except Exception as e:
            print(f"  ⚠️ 获取走势失败: {e}")
            trend = []

        # 5. 近期交易记录
        try:
            trades = fetch_json(
                f'{args.api_base}/api/portfolio/{args.account}/recent-trades?userId={args.user_id}&startDate=2026-01-01&endDate={latest_date}'
            )
            for t in trades:
                if 'created_at' in t and 'date' not in t:
                    t['date'] = t['created_at'][:10]
            print(f"  ✓ 成功获取成交记录 ({len(trades)} 条)")
        except Exception as e:
            print(f"  ⚠️ 获取成交记录失败: {e}")
            trades = []

        # 6. 指标统计
        try:
            metrics = fetch_json(f'{args.api_base}/api/portfolio/{args.account}/metrics?userId={args.user_id}')
            print(f"  ✓ 成功获取收益率指标")
        except Exception as e:
            print(f"  ⚠️ 获取指标失败: {e}")
            metrics = {}

        # 7. 操作记录
        try:
            operations = fetch_json(f'{args.api_base}/api/portfolio/{args.account}/operations')
            print(f"  ✓ 成功获取操作记录 ({len(operations)} 条)")
        except Exception as e:
            print(f"  ⚠️ 获取操作记录失败: {e}")
            operations = []

        # 8. 组合分析
        try:
            analysis = fetch_json(f'{args.api_base}/api/analysis/portfolio/{args.account}?userId={args.user_id}')
            print(f"  ✓ 成功获取持仓组合分析报告")
        except Exception as e:
            print(f"  ⚠️ 获取组合分析报告失败: {e}")
            analysis = None

        # 9. 股票配置 (用于热力图标签与板块分类)
        try:
            stock_configs = fetch_json(f'{args.api_base}/api/stock-configs')
            print(f"  ✓ 成功获取股票分类与标签配置 ({len(stock_configs)} 条)")
        except Exception as e:
            print(f"  ⚠️ 获取股票分类配置失败: {e}")
            stock_configs = []

        # 组装完整数据包
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

        # 保存本地文件
        os.makedirs(os.path.join(repo_root, "mock_data"), exist_ok=True)
        out_file = os.path.join(repo_root, "mock_data", f"{latest_date}.json")
        with open(out_file, "w", encoding="utf-8") as f:
            json.dump(bundle, f, ensure_ascii=False, indent=2)
        print(f"\n💾 数据包已生成: {out_file} ({os.path.getsize(out_file):,} 字节)")

    # 生成 latest.json 指针
    latest_file = os.path.join(repo_root, "mock_data", "latest.json")
    latest_payload = {
        "date": latest_date,
        "stock_configs": stock_configs
    }
    with open(latest_file, "w", encoding="utf-8") as f:
        json.dump(latest_payload, f, ensure_ascii=False, indent=2)
    print(f"💾 指针已更新: {latest_file} -> {latest_date}")

    if args.no_upload:
        print("\nℹ️ 已跳过上传 (--no-upload)。如需上传请省略该参数。")
        return

    # 上传到 Cloudflare R2
    print(f"\n🚀 开始上传数据到 Cloudflare R2 ({args.bucket_prefix})...")
    r2_data_target = f"{args.bucket_prefix}/{latest_date}.json"
    r2_latest_target = f"{args.bucket_prefix}/latest.json"

    upload_to_r2(out_file, r2_data_target, dns_override)
    upload_to_r2(latest_file, r2_latest_target, dns_override)

    print("\n✅ R2 上传完成！正在验证线上接口...")
    try:
        req = urllib.request.Request(
            f"{args.verify_url}?_t={int(datetime.now().timestamp())}",
            headers={'User-Agent': 'Mozilla/5.0'}
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            remote_info = json.loads(resp.read().decode('utf-8'))
            print(f"🎉 验证成功！线上 latest.json 当前日期: {remote_info.get('date')}")
            if remote_info.get('date') == latest_date:
                print(f"✨ 数据已无缝上线！访问 https://stock-web.corvo.fun 即可查看最新持仓与净值。")
            else:
                print(f"⚠️ 提示: 线上日期尚未显示最新 (CDN 可能有短暂缓存，通常数秒内刷新)")
    except Exception as e:
        print(f"⚠️ 验证线上接口提示: {e}")


if __name__ == "__main__":
    main()
