"""
一次性生成 VAPID 公私钥对（RFC 8292 — Voluntary Application Server Identification）
运行后把输出粘贴到 push_server/.env 里。
"""
from __future__ import annotations

import argparse
import base64
import sys
from pathlib import Path


def b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def generate_keys() -> tuple[str, str]:
    try:
        from cryptography.hazmat.backends import default_backend
        from cryptography.hazmat.primitives import serialization
        from cryptography.hazmat.primitives.asymmetric import ec
    except ImportError as e:
        sys.stderr.write(
            "缺少 cryptography 依赖，请先运行:\n"
            "  pip install cryptography\n"
            "或: pip install -r push_server/requirements.txt\n"
        )
        raise SystemExit(1) from e

    private_key = ec.generate_private_key(ec.SECP256R1(), default_backend())
    public_key = private_key.public_key()

    pub_bytes = public_key.public_bytes(
        encoding=serialization.Encoding.X962,
        format=serialization.PublicFormat.UncompressedPoint,
    )
    priv_bytes = private_key.private_numbers().private_value.to_bytes(32, "big")
    return b64url(pub_bytes), b64url(priv_bytes)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--write-env",
        type=Path,
        help="可选：把 VAPID_* 变量追加写入指定 .env 文件（如 push_server/.env）",
    )
    args = parser.parse_args()

    public, private = generate_keys()

    lines = [
        "# ============================================================",
        "# VAPID Keys — 由 generate_vapid_keys.py 自动生成",
        f"# 生成时间: {__import__('datetime').datetime.now().isoformat(timespec='seconds')}",
        "# ============================================================",
        f"VAPID_PUBLIC_KEY={public}",
        f"VAPID_PRIVATE_KEY={private}",
        "",
    ]
    block = "\n".join(lines) + "\n"

    print(block)
    print("👉 请把上面两行 VAPID_* 粘贴到 push_server/.env 对应位置")
    print(f"   VAPID_PUBLIC_KEY（前端要用）: {public}")
    print(f"   VAPID_PRIVATE_KEY（仅服务端）: {'*' * len(private)}")

    if args.write_env:
        env_path = args.write_env
        existed = env_path.exists()
        content = env_path.read_text(encoding="utf-8") if existed else ""

        import re

        patterns = {
            "public": re.compile(r"^VAPID_PUBLIC_KEY=.*$", re.MULTILINE),
            "private": re.compile(r"^VAPID_PRIVATE_KEY=.*$", re.MULTILINE),
        }
        if patterns["public"].search(content):
            content = patterns["public"].sub(f"VAPID_PUBLIC_KEY={public}", content)
        else:
            content = content.rstrip() + f"\nVAPID_PUBLIC_KEY={public}\n"
        if patterns["private"].search(content):
            content = patterns["private"].sub(f"VAPID_PRIVATE_KEY={private}", content)
        else:
            content = content.rstrip() + f"\nVAPID_PRIVATE_KEY={private}\n"

        env_path.parent.mkdir(parents=True, exist_ok=True)
        env_path.write_text(content, encoding="utf-8")
        print(f"\n✅ 已写入 VAPID 密钥到: {env_path.resolve()}")
        if not existed:
            print("   记得补充 VAPID_EMAIL / CORS_ORIGINS / ADMIN_SHARED_SECRET 等其他配置。")


if __name__ == "__main__":
    main()
