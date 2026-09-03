#!/usr/bin/env python3
"""
Antigravity Usage CLI
Analyze Antigravity IDE / Agent session logs, model usage, step breakdown, and estimated tokens.
"""

import os
import sys
import json
import glob
import sqlite3
import re
import argparse
from datetime import datetime, timezone, timedelta
from collections import defaultdict

GEMINI_DIR = os.path.expanduser("~/.gemini/antigravity-ide")
CONV_DIR = os.path.join(GEMINI_DIR, "conversations")
BRAIN_DIR = os.path.join(GEMINI_DIR, "brain")

# ANSI Color Codes
CYAN = "\033[96m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
BLUE = "\033[94m"
MAGENTA = "\033[95m"
BOLD = "\033[1m"
DIM = "\033[2m"
RESET = "\033[0m"


def estimate_tokens(text: str) -> int:
    """Fast estimate of tokens based on char/word heuristics."""
    if not text:
        return 0
    # CJK characters are ~1.5 - 2 chars per token, latin ~4 chars per token
    cjk_count = len(re.findall(r'[\u4e00-\u9fff\u3040-\u30ff]', text))
    other_count = len(text) - cjk_count
    return int(cjk_count * 0.7 + other_count / 3.8) + 1


def get_conversation_models():
    """Extract model mappings from sqlite database gen_metadata."""
    models_by_conv = {}
    db_files = glob.glob(os.path.join(CONV_DIR, "*.db"))
    for db_path in db_files:
        conv_id = os.path.basename(db_path)[:-3]
        try:
            conn = sqlite3.connect(db_path)
            c = conn.cursor()
            c.execute("SELECT data FROM gen_metadata")
            rows = c.fetchall()
            models = set()
            for (data,) in rows:
                if not data:
                    continue
                matches = re.findall(rb'Gemini [0-9\.]+(?: [A-Za-z]+)?(?:\s*\([A-Za-z]+\))?|Claude [0-9\.]+(?: [A-Za-z]+)?', data)
                for m in matches:
                    try:
                        models.add(m.decode('utf-8', errors='ignore').strip())
                    except Exception:
                        pass
            if models:
                models_by_conv[conv_id] = list(models)
            else:
                models_by_conv[conv_id] = ["Gemini (Default)"]
        except Exception:
            models_by_conv[conv_id] = ["Gemini (Default)"]
    return models_by_conv


def parse_transcripts(since_dt=None):
    """Parse all transcript.jsonl files under brain directory."""
    models_by_conv = get_conversation_models()
    conv_paths = glob.glob(os.path.join(BRAIN_DIR, "*", ".system_generated", "logs", "transcript.jsonl"))

    daily_stats = defaultdict(lambda: {
        "user_prompts": 0,
        "ai_responses": 0,
        "tool_calls": 0,
        "tools": defaultdict(int),
        "input_chars": 0,
        "output_chars": 0,
        "est_tokens_in": 0,
        "est_tokens_out": 0,
        "conversations": set(),
        "models": defaultdict(int)
    })

    conv_summaries = {}

    for transcript_file in conv_paths:
        conv_id = transcript_file.split("/")[-4]
        conv_models = models_by_conv.get(conv_id, ["Gemini (Default)"])
        primary_model = conv_models[0] if conv_models else "Gemini (Default)"

        conv_info = {
            "conv_id": conv_id,
            "model": primary_model,
            "first_time": None,
            "last_time": None,
            "user_prompts": 0,
            "ai_turns": 0,
            "tools_count": 0,
            "first_prompt": "",
            "est_tokens": 0
        }

        try:
            with open(transcript_file, "r", encoding="utf-8", errors="ignore") as f:
                for line in f:
                    if not line.strip():
                        continue
                    try:
                        step = json.loads(line)
                    except json.JSONDecodeError:
                        continue

                    created_str = step.get("created_at")
                    if not created_str:
                        continue

                    try:
                        dt = datetime.fromisoformat(created_str.replace("Z", "+00:00"))
                    except Exception:
                        continue

                    if since_dt and dt < since_dt:
                        continue

                    day_key = dt.strftime("%Y-%m-%d")
                    st = step.get("type", "UNKNOWN")
                    content = step.get("content", "") or ""

                    if not conv_info["first_time"] or dt < conv_info["first_time"]:
                        conv_info["first_time"] = dt
                    if not conv_info["last_time"] or dt > conv_info["last_time"]:
                        conv_info["last_time"] = dt

                    daily = daily_stats[day_key]
                    daily["conversations"].add(conv_id)
                    daily["models"][primary_model] += 1

                    if st == "USER_INPUT":
                        daily["user_prompts"] += 1
                        conv_info["user_prompts"] += 1
                        tok_in = estimate_tokens(content)
                        daily["input_chars"] += len(content)
                        daily["est_tokens_in"] += tok_in
                        conv_info["est_tokens"] += tok_in
                        if not conv_info["first_prompt"] and content:
                            clean_text = re.sub(r'</?[A-Z_]+>', '', content).strip()
                            clean_text = clean_text.split("\n")[0][:60] if clean_text else ""
                            conv_info["first_prompt"] = clean_text
                    elif st == "PLANNER_RESPONSE":
                        daily["ai_responses"] += 1
                        conv_info["ai_turns"] += 1
                        tok_out = estimate_tokens(content)
                        daily["output_chars"] += len(content)
                        daily["est_tokens_out"] += tok_out
                        conv_info["est_tokens"] += tok_out
                    elif st in ["GREP_SEARCH", "LIST_DIRECTORY", "VIEW_FILE", "CODE_ACTION", "RUN_COMMAND",
                                "BROWSER_SUBAGENT", "SEARCH_WEB", "ASK_QUESTION", "READ_URL_CONTENT"]:
                        daily["tool_calls"] += 1
                        daily["tools"][st] += 1
                        conv_info["tools_count"] += 1
                        tok_tool = estimate_tokens(content)
                        daily["input_chars"] += len(content)
                        daily["est_tokens_in"] += tok_tool
                        conv_info["est_tokens"] += tok_tool

            if conv_info["user_prompts"] > 0 or conv_info["ai_turns"] > 0:
                conv_summaries[conv_id] = conv_info
        except Exception:
            pass

    return daily_stats, conv_summaries, models_by_conv


def fmt_num(n: int) -> str:
    """Format numbers with comma or compact k/M representation."""
    if n >= 1_000_000:
        return f"{n/1_000_000:.2f}M"
    if n >= 10_000:
        return f"{n/1_000:.1f}k"
    return f"{n:,}"


def print_dashboard(daily_stats, conv_summaries, models_by_conv, days_limit=None):
    now = datetime.now(timezone.utc)
    today_key = now.strftime("%Y-%m-%d")

    # Aggregate totals
    total_convs = len(conv_summaries)
    total_prompts = sum(d["user_prompts"] for d in daily_stats.values())
    total_ai_turns = sum(d["ai_responses"] for d in daily_stats.values())
    total_tools = sum(d["tool_calls"] for d in daily_stats.values())
    total_tokens_in = sum(d["est_tokens_in"] for d in daily_stats.values())
    total_tokens_out = sum(d["est_tokens_out"] for d in daily_stats.values())
    total_tokens = total_tokens_in + total_tokens_out

    # Today stats
    today_d = daily_stats.get(today_key, {
        "user_prompts": 0, "ai_responses": 0, "tool_calls": 0,
        "est_tokens_in": 0, "est_tokens_out": 0, "conversations": set()
    })
    today_tokens = today_d["est_tokens_in"] + today_d["est_tokens_out"]

    # Past 7 Days (This Week) stats
    seven_days_ago = now - timedelta(days=7)
    week_keys = [d for d in daily_stats.keys() if datetime.strptime(d, "%Y-%m-%d").replace(tzinfo=timezone.utc) >= seven_days_ago]
    week_prompts = sum(daily_stats[k]["user_prompts"] for k in week_keys)
    week_ai_turns = sum(daily_stats[k]["ai_responses"] for k in week_keys)
    week_tools = sum(daily_stats[k]["tool_calls"] for k in week_keys)
    week_tokens_in = sum(daily_stats[k]["est_tokens_in"] for k in week_keys)
    week_tokens_out = sum(daily_stats[k]["est_tokens_out"] for k in week_keys)
    week_tokens = week_tokens_in + week_tokens_out
    week_convs = set()
    for k in week_keys:
        week_convs.update(daily_stats[k]["conversations"])
    avg_daily_tokens = int(week_tokens / 7)

    # Model breakdown
    model_counts = defaultdict(int)
    for c in conv_summaries.values():
        model_counts[c["model"]] += c["ai_turns"]

    # Tool breakdown
    all_tools = defaultdict(int)
    for d in daily_stats.values():
        for t, cnt in d["tools"].items():
            all_tools[t] += cnt

    # Print Header
    print(f"\n{BOLD}{CYAN}╔══════════════════════════════════════════════════════════════════╗{RESET}")
    print(f"{BOLD}{CYAN}║                Antigravity Agent Usage Report                    ║{RESET}")
    print(f"{BOLD}{CYAN}╚══════════════════════════════════════════════════════════════════╝{RESET}")
    print(f"{DIM}💡 说明: 统计展示本地实际产生的使用量 (Usage / 消耗)，非云端剩余余额{RESET}\n")

    # Overview Cards
    print(f"{BOLD}📊  OVERVIEW SUMMARY (全量历史){RESET}")
    print(f"  ├─ {BOLD}Active Sessions / Conversations:{RESET} {CYAN}{total_convs}{RESET}")
    print(f"  ├─ {BOLD}User Prompts (Turns):{RESET}            {GREEN}{fmt_num(total_prompts)}{RESET}")
    print(f"  ├─ {BOLD}AI Responses (Planner Steps):{RESET}    {BLUE}{fmt_num(total_ai_turns)}{RESET}")
    print(f"  ├─ {BOLD}Tool / Action Invocations:{RESET}       {YELLOW}{fmt_num(total_tools)}{RESET}")
    print(f"  └─ {BOLD}Estimated Tokens Consumed:{RESET}       {MAGENTA}{fmt_num(total_tokens)}{RESET} "
          f"{DIM}(In: ~{fmt_num(total_tokens_in)}, Out: ~{fmt_num(total_tokens_out)}){RESET}\n")

    # This Week Summary Card
    print(f"{BOLD}📆  THIS WEEK / PAST 7 DAYS (近 7 天统计){RESET}")
    print(f"  ├─ Active Sessions (活跃会话):     {CYAN}{len(week_convs)}{RESET}")
    print(f"  ├─ Prompts / AI Responses:         {GREEN}{fmt_num(week_prompts)}{RESET} prompts / {BLUE}{fmt_num(week_ai_turns)}{RESET} responses")
    print(f"  ├─ Tool Calls (工具调用):          {YELLOW}{fmt_num(week_tools)}{RESET}")
    print(f"  ├─ 7-Day Total Tokens (近7天总消耗): {MAGENTA}{fmt_num(week_tokens)}{RESET}")
    print(f"  └─ Daily Average (日均消耗估算):     {MAGENTA}{fmt_num(avg_daily_tokens)}{RESET} tokens/day\n")

    # Today Highlights
    today_pct = (today_tokens / week_tokens * 100) if week_tokens else 0
    print(f"{BOLD}⚡  TODAY'S USAGE (今日消耗: {today_key}){RESET}")
    print(f"  ├─ Active Sessions Today:   {CYAN}{len(today_d['conversations'])}{RESET}")
    print(f"  ├─ Prompts / AI Responses: {GREEN}{today_d['user_prompts']}{RESET} prompts / {BLUE}{today_d['ai_responses']}{RESET} responses")
    print(f"  ├─ Tool Calls:             {YELLOW}{today_d['tool_calls']}{RESET}")
    print(f"  └─ Estimated Tokens:       {MAGENTA}{fmt_num(today_tokens)}{RESET} {DIM}(占本周: {today_pct:.1f}%){RESET}\n")

    # Model Breakdown
    if model_counts:
        print(f"{BOLD}🤖  MODEL DISTRIBUTION (AI Turns){RESET}")
        for model_name, turns in sorted(model_counts.items(), key=lambda x: -x[1]):
            pct = (turns / total_ai_turns * 100) if total_ai_turns else 0
            bar_len = int(pct / 5)
            bar = "█" * bar_len + "░" * (20 - bar_len)
            print(f"  ├─ {BOLD}{model_name:<26}{RESET} {bar} {turns:>5} turns ({pct:>5.1f}%)")
        print()

    # Top Tool Calls
    if all_tools:
        print(f"{BOLD}🛠️   TOOL INVOCATION BREAKDOWN{RESET}")
        for tool_name, count in sorted(all_tools.items(), key=lambda x: -x[1])[:6]:
            clean_tool = tool_name.replace("_", " ").title()
            pct = (count / total_tools * 100) if total_tools else 0
            print(f"  ├─ {clean_tool:<24} {count:>5} calls ({pct:>5.1f}%)")
        print()

    # Daily Trend Table
    days_to_show = sorted(daily_stats.keys(), reverse=True)
    if days_limit:
        days_to_show = days_to_show[:days_limit]

    print(f"{BOLD}📅  RECENT DAILY ACTIVITY{RESET}")
    print(f"  ┌────────────┬─────────┬──────────┬──────────┬─────────────┐")
    print(f"  │ {BOLD}Date{RESET}       │ {BOLD}Prompts{RESET} │ {BOLD}AI Turns{RESET} │ {BOLD}Tools{RESET}    │ {BOLD}Est. Tokens{RESET} │")
    print(f"  ├────────────┼─────────┼──────────┼──────────┼─────────────┤")
    for d_key in days_to_show:
        st = daily_stats[d_key]
        tok = st["est_tokens_in"] + st["est_tokens_out"]
        print(f"  │ {d_key} │ {st['user_prompts']:>7} │ {st['ai_responses']:>8} │ {st['tool_calls']:>8} │ {fmt_num(tok):>11} │")
    print(f"  └────────────┴─────────┴──────────┴──────────┴─────────────┘\n")


def print_conversations_list(conv_summaries, limit=10):
    print(f"\n{BOLD}{CYAN}📜  RECENT SESSIONS / CONVERSATIONS{RESET}\n")
    sorted_convs = sorted(
        conv_summaries.values(),
        key=lambda x: x["last_time"] or datetime.min.replace(tzinfo=timezone.utc),
        reverse=True
    )
    for i, c in enumerate(sorted_convs[:limit]):
        t_str = c["last_time"].strftime("%Y-%m-%d %H:%M") if c["last_time"] else "N/A"
        preview = c["first_prompt"] or "(No prompt text recorded)"
        if len(preview) > 50:
            preview = preview[:47] + "..."
        print(f"  {BOLD}[{i+1}]{RESET} {CYAN}{c['conv_id'][:8]}...{RESET} ({DIM}{t_str}{RESET})")
        print(f"      Model: {GREEN}{c['model']}{RESET} | Prompts: {c['user_prompts']} | Steps: {c['ai_turns']} | Tools: {c['tools_count']}")
        print(f"      Initial: {preview}")
        print()


def main():
    parser = argparse.ArgumentParser(description="Antigravity Agent Usage & Token Statistics CLI")
    parser.add_argument("--today", action="store_true", help="Show usage statistics for today only")
    parser.add_argument("-w", "--week", action="store_true", help="Show usage statistics for the past 7 days")
    parser.add_argument("--days", type=int, default=7, help="Number of days to show in daily breakdown (default: 7)")
    parser.add_argument("--all", action="store_true", help="Show all daily records")
    parser.add_argument("-l", "--list", action="store_true", help="List recent conversation sessions")
    parser.add_argument("--json", action="store_true", help="Output raw JSON data")

    args = parser.parse_args()

    since_dt = None
    if args.today:
        now = datetime.now(timezone.utc)
        since_dt = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
    elif args.week:
        now = datetime.now(timezone.utc)
        since_dt = now - timedelta(days=7)

    daily_stats, conv_summaries, models_by_conv = parse_transcripts(since_dt=since_dt)

    if args.json:
        out = {
            "total_conversations": len(conv_summaries),
            "daily": {
                k: {
                    "user_prompts": v["user_prompts"],
                    "ai_responses": v["ai_responses"],
                    "tool_calls": v["tool_calls"],
                    "est_tokens_in": v["est_tokens_in"],
                    "est_tokens_out": v["est_tokens_out"],
                    "total_est_tokens": v["est_tokens_in"] + v["est_tokens_out"],
                    "tools": dict(v["tools"])
                }
                for k, v in daily_stats.items()
            }
        }
        print(json.dumps(out, indent=2, ensure_ascii=False))
        return

    if args.list:
        print_conversations_list(conv_summaries)
        return

    days_limit = None if args.all else (1 if args.today else args.days)
    print_dashboard(daily_stats, conv_summaries, models_by_conv, days_limit=days_limit)


if __name__ == "__main__":
    main()
