"""
YHTrader 成交记录 Web Push 服务
=================================

职责：
  1. 管理 Web Push 订阅（POST /api/push/subscribe — 保存 endpoint/p256dh/auth + 账户别名）
  2. 后台线程定时轮询每个被订阅账户的 RSS（recent-trades.rss），做 guid diff
  3. 发现新成交 → 通过 pywebpush 发送 Web Push 给该账户下所有订阅者
  4. 提供发送测试通知、查看订阅状态等管理接口

使用：
  1) pip install -r push_server/requirements.txt
  2) python push_server/generate_vapid_keys.py --write-env push_server/.env
  3) 按需编辑 push_server/.env 中 VAPID_EMAIL / CORS_ORIGINS / UPSTREAM_BASE_URL / ADMIN_SHARED_SECRET
  4) python push_server/app.py  （或 gunicorn -w 1 -k sync push_server.app:app -b 0.0.0.0:8787 — 进程数必须为 1，避免重复轮询）
"""
from __future__ import annotations

import argparse
import base64
import json
import logging
import os
import re
import sys
import threading
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

import requests
from dotenv import load_dotenv
from flask import Flask, Response, jsonify, request
from flask_cors import CORS

# ---------------------------------------------------------------------------
# 日志
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("push-server")

# ---------------------------------------------------------------------------
# 环境加载
# ---------------------------------------------------------------------------
_BASE_DIR = Path(__file__).resolve().parent
load_dotenv(_BASE_DIR / ".env")


def _env_list(name: str, default: str) -> list[str]:
    raw = os.environ.get(name, default)
    return [s.strip() for s in raw.split(",") if s.strip()]


VAPID_PUBLIC_KEY = os.environ.get("VAPID_PUBLIC_KEY", "").strip()
VAPID_PRIVATE_KEY = os.environ.get("VAPID_PRIVATE_KEY", "").strip()
VAPID_EMAIL = os.environ.get("VAPID_EMAIL", "admin@example.com").strip()
PORT = int(os.environ.get("PORT", "8787"))
STORAGE_DIR = Path(os.environ.get("STORAGE_DIR", str(_BASE_DIR / "data"))).resolve()
CORS_ORIGINS = _env_list("CORS_ORIGINS", "http://localhost:5173,http://localhost:5174")
RSS_POLL_INTERVAL_SECONDS = int(os.environ.get("RSS_POLL_INTERVAL_SECONDS", "30"))
UPSTREAM_BASE_URL = os.environ.get(
    "UPSTREAM_BASE_URL", "https://stock.in.corvo.fun"
).rstrip("/")
ADMIN_SHARED_SECRET = os.environ.get("ADMIN_SHARED_SECRET", "").strip()

STORAGE_DIR.mkdir(parents=True, exist_ok=True)
SUBS_FILE = STORAGE_DIR / "subscriptions.json"
SEEN_GUIDS_FILE = STORAGE_DIR / "seen_guids.json"

# ---------------------------------------------------------------------------
# 数据模型
# ---------------------------------------------------------------------------
@dataclass
class PushSubscriptionRecord:
    account_alias: str
    endpoint: str
    p256dh: str
    auth: str
    user_agent: str
    created_at: str
    # 订阅时可带一个可选的 client_id（浏览器端随机 UUID），
    # 方便同一用户多端区分以及精确取消订阅
    client_id: str = ""

    @property
    def pywebpush_keys(self) -> dict[str, str]:
        return {"p256dh": self.p256dh, "auth": self.auth}

    def to_public(self) -> dict[str, Any]:
        return {
            "account_alias": self.account_alias,
            "client_id": self.client_id,
            "endpoint_host": _endpoint_host(self.endpoint),
            "created_at": self.created_at,
            "user_agent_ellipsis": (self.user_agent or "")[:80],
        }


@dataclass
class Store:
    subscriptions: list[PushSubscriptionRecord] = field(default_factory=list)
    seen_guids_by_account: dict[str, list[str]] = field(default_factory=dict)

    # ------------------------------------------------------------------ io
    @classmethod
    def load(cls) -> "Store":
        subs: list[PushSubscriptionRecord] = []
        if SUBS_FILE.exists():
            try:
                raw = json.loads(SUBS_FILE.read_text(encoding="utf-8"))
                subs = [PushSubscriptionRecord(**r) for r in raw]
            except Exception as exc:  # noqa: BLE001
                log.exception("加载 subscriptions.json 失败，忽略: %s", exc)

        seen: dict[str, list[str]] = {}
        if SEEN_GUIDS_FILE.exists():
            try:
                seen = json.loads(SEEN_GUIDS_FILE.read_text(encoding="utf-8"))
            except Exception as exc:  # noqa: BLE001
                log.exception("加载 seen_guids.json 失败，忽略: %s", exc)

        return cls(subscriptions=subs, seen_guids_by_account=seen)

    def save(self) -> None:
        SUBS_FILE.write_text(
            json.dumps([asdict(s) for s in self.subscriptions], ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        SEEN_GUIDS_FILE.write_text(
            json.dumps(self.seen_guids_by_account, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    # ------------------------------------------------------------ helpers
    def active_accounts(self) -> list[str]:
        return sorted({s.account_alias for s in self.subscriptions})

    def subscriptions_for(self, account_alias: str) -> list[PushSubscriptionRecord]:
        return [s for s in self.subscriptions if s.account_alias == account_alias]

    def upsert(self, rec: PushSubscriptionRecord) -> None:
        idx = next(
            (
                i
                for i, s in enumerate(self.subscriptions)
                if s.endpoint == rec.endpoint and s.account_alias == rec.account_alias
            ),
            None,
        )
        if idx is None:
            self.subscriptions.append(rec)
        else:
            self.subscriptions[idx] = rec

    def remove_by_endpoint(self, account_alias: str, endpoint: str) -> int:
        before = len(self.subscriptions)
        self.subscriptions = [
            s
            for s in self.subscriptions
            if not (s.account_alias == account_alias and s.endpoint == endpoint)
        ]
        return before - len(self.subscriptions)

    def remove_expired(self, endpoints: Iterable[str]) -> int:
        bad = set(endpoints)
        before = len(self.subscriptions)
        self.subscriptions = [s for s in self.subscriptions if s.endpoint not in bad]
        return before - len(self.subscriptions)

    def mark_guids(self, account_alias: str, guids: list[str]) -> None:
        cur = self.seen_guids_by_account.setdefault(account_alias, [])
        merged = [*cur, *[g for g in guids if g not in cur]]
        # 最多保留 500 条 guid，避免文件无限膨胀
        self.seen_guids_by_account[account_alias] = merged[-500:]

    def has_guid(self, account_alias: str, guid: str) -> bool:
        return guid in self.seen_guids_by_account.get(account_alias, [])


STORE = Store.load()
STORE_LOCK = threading.Lock()


def _endpoint_host(endpoint: str) -> str:
    m = re.match(r"^https?://([^/]+)", endpoint)
    return m.group(1) if m else endpoint[:60]


# ---------------------------------------------------------------------------
# Web Push 发送
# ---------------------------------------------------------------------------
def _vapid_claims() -> dict[str, str]:
    return {"sub": f"mailto:{VAPID_EMAIL}"}


def _b64url_to_pem_private(b64url_priv: str) -> str:
    """
    pywebpush 需要 PEM 格式的私钥；我们的 .env 里是 SECP256R1 d 值（32 字节 b64url）。
    这里用 cryptography 拼一个 PEM。
    """
    from cryptography.hazmat.backends import default_backend
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import ec

    def _b64url_decode(s: str) -> bytes:
        pad = "=" * (-len(s) % 4)
        return base64.urlsafe_b64decode(s + pad)

    d_bytes = _b64url_decode(b64url_priv)
    d_int = int.from_bytes(d_bytes, "big")
    curve = ec.SECP256R1()
    private_key = ec.derive_private_key(d_int, curve, default_backend())
    pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    return pem.decode("ascii")


_PEM_PRIV: str | None = None


def _pem_priv() -> str:
    global _PEM_PRIV  # noqa: PLW0603
    if _PEM_PRIV is None:
        if not VAPID_PRIVATE_KEY:
            raise RuntimeError("VAPID_PRIVATE_KEY 未配置，请先运行 generate_vapid_keys.py")
        _PEM_PRIV = _b64url_to_pem_private(VAPID_PRIVATE_KEY)
    return _PEM_PRIV


@dataclass
class TradeNotificationPayload:
    """推送给 Service Worker 的 JSON 载荷。"""

    title: str
    body: str
    tag: str
    url: str
    account_alias: str
    # icon / badge 等，前端 Service Worker 里也有默认值
    icon: str = "/favicon.svg"
    badge: str = "/favicon.svg"
    operation: str = ""  # buy / sell / system
    stock_code: str = ""
    stock_name: str = ""
    price: float | None = None
    quantity: int | None = None
    amount: float | None = None
    ts: str = ""


def send_web_push(
    subscription: PushSubscriptionRecord,
    payload: TradeNotificationPayload,
    ttl: int = 3600,
) -> bool:
    try:
        from pywebpush import WebPushException, webpush
    except ImportError as exc:  # pragma: no cover
        raise SystemExit(
            "缺少 pywebpush，请先: pip install -r push_server/requirements.txt"
        ) from exc

    data = json.dumps(asdict(payload), ensure_ascii=False)
    try:
        webpush(
            subscription_info={
                "endpoint": subscription.endpoint,
                "keys": subscription.pywebpush_keys,
            },
            data=data,
            vapid_private_key=_pem_priv(),
            vapid_claims=_vapid_claims(),
            ttl=ttl,
            timeout=15,
        )
        log.info(
            "✉️  已推送 [%s] -> %s (%s)",
            payload.tag,
            _endpoint_host(subscription.endpoint),
            subscription.account_alias,
        )
        return True
    except WebPushException as exc:  # noqa: BLE001
        # https://autopush.readthedocs.io/en/latest/http.html#response-codes
        status = getattr(exc.response, "status_code", None) if exc.response else None
        if status in {404, 410}:
            log.warning("订阅已过期 (HTTP %s)，将移除: %s", status, subscription.endpoint)
            with STORE_LOCK:
                STORE.remove_expired([subscription.endpoint])
                STORE.save()
        else:
            log.exception("推送失败（HTTP %s）: %s", status, exc)
        return False
    except Exception as exc:  # noqa: BLE001
        log.exception("推送失败（其他异常）: %s", exc)
        return False


# ---------------------------------------------------------------------------
# RSS 轮询 + diff
# ---------------------------------------------------------------------------
RSS_NS = {"": "http://www.w3.org/2005/Atom", "r": "http://purl.org/rss/1.0/"}


def _text(el, sel: str) -> str:
    """兼容 RSS 2.0 和 Atom 的简单文本提取。"""
    node = el.find(sel)
    if node is not None and node.text:
        return node.text.strip()
    # Atom 命名空间兼容
    for prefix, uri in RSS_NS.items():
        tag = sel if not prefix else f"{prefix}:{sel}"
        try:
            n2 = el.find(tag, namespaces={prefix: uri} if prefix else None)
        except Exception:  # noqa: BLE001
            n2 = None
        if n2 is not None and n2.text:
            return n2.text.strip()
    return ""


def fetch_and_parse_rss(account_alias: str) -> list[dict[str, Any]]:
    url = f"{UPSTREAM_BASE_URL}/api/portfolio/{account_alias}/recent-trades.rss"
    try:
        resp = requests.get(url, timeout=15)
        resp.raise_for_status()
    except Exception as exc:  # noqa: BLE001
        log.error("拉取 RSS 失败 [%s] %s: %s", account_alias, url, exc)
        return []

    try:
        import xml.etree.ElementTree as ET
    except ImportError:  # pragma: no cover
        return []
    try:
        root = ET.fromstring(resp.content)
    except Exception as exc:  # noqa: BLE001
        log.error("解析 RSS XML 失败 [%s]: %s", account_alias, exc)
        return []

    # RSS 2.0: /rss/channel/item ; Atom: /feed/entry
    items = root.findall(".//item") or root.findall(".//{http://www.w3.org/2005/Atom}entry")
    parsed: list[dict[str, Any]] = []
    for it in items:
        guid = _text(it, "guid") or _text(it, "id")
        title = _text(it, "title")
        link = _text(it, "link")
        pub = _text(it, "pubDate") or _text(it, "updated") or _text(it, "published")
        desc = _text(it, "description") or _text(it, "summary") or _text(it, "content")

        code = None
        m = re.search(r"([A-Z]?\d{6}|\d{5,6})", title)
        if m:
            code = m.group(1)
        operation = ""
        if "买入" in title or "buy" in title.lower():
            operation = "buy"
        elif "卖出" in title or "sell" in title.lower():
            operation = "sell"
        price = qty = amount = None
        m2 = re.search(r"(?:价格|price)\s*[:：]?\s*([\d.]+)", desc, re.I)
        if m2:
            try:
                price = float(m2.group(1))
            except ValueError:
                pass
        m3 = re.search(r"(?:数量|股数|quantity)\s*[:：]?\s*([\d,]+)", desc, re.I)
        if m3:
            try:
                qty = int(m3.group(1).replace(",", ""))
            except ValueError:
                pass
        m4 = re.search(r"(?:金额|成交额|amount)\s*[:：]?\s*([\d,.]+)", desc, re.I)
        if m4:
            try:
                amount = float(m4.group(1).replace(",", ""))
            except ValueError:
                pass

        parsed.append(
            {
                "guid": guid or f"{title}-{pub}",
                "title": title,
                "link": link,
                "pubDate": pub,
                "description": desc,
                "stock_code": code,
                "operation": operation,
                "price": price,
                "quantity": qty,
                "amount": amount,
            }
        )
    return parsed


def build_trade_payload(account_alias: str, item: dict[str, Any]) -> TradeNotificationPayload:
    action_text = (
        "🔴 买入 · 新成交记录"
        if item.get("operation") == "buy"
        else "🟢 卖出 · 新成交记录"
        if item.get("operation") == "sell"
        else "📋 新成交记录"
    )
    symbol_parts = [p for p in [item.get("stock_code"), item.get("title")] if p]
    symbol = " · ".join(symbol_parts[:2]) if symbol_parts else item.get("title", "")
    details: list[str] = [
        item.get("operation") == "buy"
        and "买入"
        or item.get("operation") == "sell"
        and "卖出"
        or "成交"
    ]
    if item.get("price") is not None:
        details.append(f"价 {item['price']:.2f}")
    if item.get("quantity") is not None:
        details.append(f"量 {item['quantity']}")
    if item.get("amount") is not None:
        details.append(f"额 {item['amount']:.0f}")
    body = f"{symbol}\n{'  '.join(details)}"
    tag = f"{account_alias}-{item['guid'][:80]}"
    return TradeNotificationPayload(
        title=action_text,
        body=body,
        tag=tag,
        url=item.get("link") or f"{UPSTREAM_BASE_URL}/journal?tab=portfolio&account_alias={account_alias}",
        account_alias=account_alias,
        operation=item.get("operation", ""),
        stock_code=item.get("stock_code") or "",
        stock_name=item.get("title", ""),
        price=item.get("price"),
        quantity=item.get("quantity"),
        amount=item.get("amount"),
        ts=datetime.now(timezone.utc).isoformat(),
    )


def poll_rss_once() -> None:
    with STORE_LOCK:
        accounts = STORE.active_accounts()
    if not accounts:
        return

    for account in accounts:
        items = fetch_and_parse_rss(account)
        if not items:
            continue

        new_items: list[dict[str, Any]] = []
        with STORE_LOCK:
            for it in items:
                if not STORE.has_guid(account, it["guid"]):
                    STORE.mark_guids(account, [it["guid"]])
                    new_items.append(it)
            STORE.save()

        if not new_items:
            continue

        log.info("📈 账户 %s 发现 %d 条新成交", account, len(new_items))
        with STORE_LOCK:
            targets = list(STORE.subscriptions_for(account))

        for item in new_items:
            payload = build_trade_payload(account, item)
            for sub in targets:
                send_web_push(sub, payload)


# ---------------------------------------------------------------------------
# 轮询线程
# ---------------------------------------------------------------------------
def poll_loop() -> None:
    log.info(
        "🧭 RSS 轮询线程已启动，每 %ds 检查一次；订阅账户: %s",
        RSS_POLL_INTERVAL_SECONDS,
        STORE.active_accounts() or "（暂无）",
    )
    while True:
        try:
            poll_rss_once()
        except Exception as exc:  # noqa: BLE001
            log.exception("poll_rss_once 异常: %s", exc)
        time.sleep(max(5, RSS_POLL_INTERVAL_SECONDS))


_POLL_THREAD: threading.Thread | None = None


def start_poller_if_needed() -> None:
    global _POLL_THREAD  # noqa: PLW0603
    if _POLL_THREAD and _POLL_THREAD.is_alive():
        return
    _POLL_THREAD = threading.Thread(target=poll_loop, name="rss-poller", daemon=True)
    _POLL_THREAD.start()


# ---------------------------------------------------------------------------
# Flask App
# ---------------------------------------------------------------------------
def _check_admin_auth() -> bool:
    """如果配置了 ADMIN_SHARED_SECRET，则管理接口需要 X-Admin-Token header 匹配。"""
    if not ADMIN_SHARED_SECRET:
        return True
    token = request.headers.get("X-Admin-Token", "").strip()
    return bool(token) and token == ADMIN_SHARED_SECRET


def _healthz_payload():
    """Web Push Server 健康检查 payload（push 组接口统一用 /api/push/healthz，/healthz 作为兼容）。"""
    return jsonify(
        {
            "ok": True,
            "ts": datetime.now(timezone.utc).isoformat(),
            "vapid_ok": bool(VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY),
            "subscriptions": len(STORE.subscriptions),
            "accounts": STORE.active_accounts(),
            "poll_interval_s": RSS_POLL_INTERVAL_SECONDS,
            "upstream": UPSTREAM_BASE_URL,
        }
    )


def create_app() -> Flask:
    global VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY  # noqa: PLW0603
    app = Flask(__name__)

    # 开发环境通配，生产严格匹配
    if CORS_ORIGINS:
        CORS(app, resources={r"/*": {"origins": CORS_ORIGINS, "supports_credentials": True}})
    else:
        CORS(app)

    if not VAPID_PUBLIC_KEY or not VAPID_PRIVATE_KEY:
        log.warning(
            "⚠️  VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY 未配置。\n"
            "   请先运行 `python push_server/generate_vapid_keys.py --write-env push_server/.env`，\n"
            "   然后重启 push server。VAPID 缺失时，/config 和 /subscribe 都会返回错误。"
        )

    # ------------------------------------------------------------------ 基础
    @app.get("/healthz")
    def healthz():
        return _healthz_payload()

    # 推荐的健康检查路径：和 push 组接口统一 /api/push/* 前缀
    @app.get("/api/push/healthz")
    def api_push_healthz():
        return _healthz_payload()

    # 给前端读取 VAPID 公钥，避免硬编码在前端代码里
    @app.get("/api/push/config")
    def push_config():
        if not VAPID_PUBLIC_KEY:
            return (
                jsonify({"error": "VAPID_PUBLIC_KEY 未在服务端配置"}),
                500,
            )
        return jsonify(
            {
                "vapid_public_key": VAPID_PUBLIC_KEY,
                "poll_interval_seconds": RSS_POLL_INTERVAL_SECONDS,
                "upstream_base_url": UPSTREAM_BASE_URL,
                "admin_auth_required": bool(ADMIN_SHARED_SECRET),
            }
        )

    # ------------------------------------------------------------ 订阅管理
    @app.post("/api/push/subscribe")
    def push_subscribe():
        if not VAPID_PRIVATE_KEY:
            return jsonify({"error": "服务端 VAPID 未配置，暂不可用"}), 500
        body = request.get_json(silent=True) or {}
        account_alias = (body.get("account_alias") or "").strip()
        endpoint = (body.get("endpoint") or "").strip()
        keys: dict[str, str] = body.get("keys") or {}
        p256dh = (keys.get("p256dh") or "").strip()
        auth = (keys.get("auth") or "").strip()
        client_id = (body.get("client_id") or "").strip()

        if not (account_alias and endpoint and p256dh and auth):
            return (
                jsonify(
                    {"error": "缺少必填字段: account_alias / endpoint / keys(p256dh, auth)"}
                ),
                400,
            )
        rec = PushSubscriptionRecord(
            account_alias=account_alias,
            endpoint=endpoint,
            p256dh=p256dh,
            auth=auth,
            client_id=client_id,
            user_agent=request.headers.get("User-Agent", "")[:512],
            created_at=datetime.now(timezone.utc).isoformat(),
        )
        with STORE_LOCK:
            STORE.upsert(rec)
            STORE.save()
        log.info("✅ 新增订阅: %s @ %s", account_alias, _endpoint_host(endpoint))
        return jsonify(
            {
                "ok": True,
                "account_alias": account_alias,
                "endpoint_host": _endpoint_host(endpoint),
                "total_subscriptions": len(STORE.subscriptions),
            }
        )

    @app.post("/api/push/unsubscribe")
    def push_unsubscribe():
        body = request.get_json(silent=True) or {}
        account_alias = (body.get("account_alias") or "").strip()
        endpoint = (body.get("endpoint") or "").strip()
        if not (account_alias and endpoint):
            return jsonify({"error": "缺少 account_alias / endpoint"}), 400
        with STORE_LOCK:
            removed = STORE.remove_by_endpoint(account_alias, endpoint)
            STORE.save()
        log.info("🗑  取消订阅: %s @ %s  removed=%d", account_alias, _endpoint_host(endpoint), removed)
        return jsonify({"ok": True, "removed": removed})

    # -------------------------------------------------------------- 手动触发
    @app.post("/api/push/test")
    def push_test():
        """给某个账户下的所有订阅发送一条测试通知（需要 admin token 或在未配置时公开）。"""
        if not _check_admin_auth():
            return jsonify({"error": "需要 X-Admin-Token"}), 401
        body = request.get_json(silent=True) or {}
        account_alias = (body.get("account_alias") or "").strip()
        if not account_alias:
            return jsonify({"error": "缺少 account_alias"}), 400
        with STORE_LOCK:
            targets = list(STORE.subscriptions_for(account_alias))
        if not targets:
            return jsonify({"ok": False, "sent": 0, "reason": "该账户暂无订阅"})
        payload = TradeNotificationPayload(
            title="✅ 测试通知 · 成交推送通道正常",
            body=(
                f"账户 {account_alias}\n"
                f"时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n"
                "如果你看到这条通知，说明 Service Worker + Web Push 全链路正常。"
            ),
            tag=f"test-{account_alias}-{int(time.time())}",
            url=f"{UPSTREAM_BASE_URL}/journal?tab=portfolio&account_alias={account_alias}",
            account_alias=account_alias,
            operation="system",
            ts=datetime.now(timezone.utc).isoformat(),
        )
        sent = 0
        for sub in targets:
            if send_web_push(sub, payload):
                sent += 1
        return jsonify({"ok": True, "sent": sent, "total": len(targets)})

    # -------------------------------------------------------------- 管理接口
    @app.get("/api/push/status")
    def push_status():
        if not _check_admin_auth():
            return jsonify({"error": "需要 X-Admin-Token"}), 401
        with STORE_LOCK:
            subs_public = [s.to_public() for s in STORE.subscriptions]
            accounts = [
                {"account_alias": a, "subscribers": len(STORE.subscriptions_for(a))}
                for a in STORE.active_accounts()
            ]
            seen_summary = {k: len(v) for k, v in STORE.seen_guids_by_account.items()}
        return jsonify(
            {
                "subscriptions": subs_public,
                "accounts": accounts,
                "seen_guids_counts": seen_summary,
                "poll_interval_seconds": RSS_POLL_INTERVAL_SECONDS,
                "upstream_base_url": UPSTREAM_BASE_URL,
                "storage_dir": str(STORAGE_DIR),
            }
        )

    @app.post("/api/push/poll-now")
    def push_poll_now():
        """立即触发一次 RSS 检查（调试用）。"""
        if not _check_admin_auth():
            return jsonify({"error": "需要 X-Admin-Token"}), 401
        threading.Thread(target=poll_rss_once, daemon=True).start()
        return jsonify({"ok": True, "msg": "已触发后台检查"})

    return app


app = create_app()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=PORT)
    parser.add_argument(
        "--no-poller",
        action="store_true",
        help="只启动 Flask，不启动 RSS 轮询线程（调试用或多实例部署用）",
    )
    args = parser.parse_args()

    if not VAPID_PUBLIC_KEY or not VAPID_PRIVATE_KEY:
        sys.stderr.write(
            "\n"
            "⚠️  VAPID 密钥未配置，订阅接口会报错。\n"
            "   请执行: python push_server/generate_vapid_keys.py --write-env push_server/.env\n"
            "   然后重启服务器。\n\n"
        )

    if not args.no_poller:
        start_poller_if_needed()

    log.info("🚀 Starting push server on http://%s:%d  (storage=%s)", args.host, args.port, STORAGE_DIR)
    app.run(host=args.host, port=args.port, debug=False, use_reloader=False, threaded=True)


if __name__ == "__main__":
    main()
