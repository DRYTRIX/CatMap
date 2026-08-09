#!/usr/bin/env python3
"""Generate a VAPID keypair for Web Push and print env vars to paste into Render.

Usage:
    python backend/scripts/generate_vapid.py

Paste the printed values into the Render dashboard (catmap-backend → Environment)
or into your local .env. Never commit the private key.
"""

from __future__ import annotations

import base64
import sys


def _urlsafe_b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def generate_vapid_keys() -> tuple[str, str]:
    """Return (public_key, private_key) as URL-safe base64 (no padding)."""
    try:
        from cryptography.hazmat.primitives.asymmetric import ec
    except ImportError:
        print(
            "cryptography is required (comes with pywebpush).\n"
            "Install backend deps: pip install -r backend/requirements.txt",
            file=sys.stderr,
        )
        sys.exit(1)

    private_key = ec.generate_private_key(ec.SECP256R1())
    private_numbers = private_key.private_numbers()
    public_numbers = private_numbers.public_numbers

    # Uncompressed EC point: 0x04 || x || y (65 bytes) — required by Web Push.
    public_bytes = (
        b"\x04"
        + public_numbers.x.to_bytes(32, "big")
        + public_numbers.y.to_bytes(32, "big")
    )
    private_bytes = private_numbers.private_value.to_bytes(32, "big")

    return _urlsafe_b64(public_bytes), _urlsafe_b64(private_bytes)


def main() -> None:
    public_key, private_key = generate_vapid_keys()
    print("# Paste into Render dashboard or .env (do not commit the private key)")
    print(f"VAPID_PUBLIC_KEY={public_key}")
    print(f"VAPID_PRIVATE_KEY={private_key}")
    print("VAPID_SUBJECT=mailto:admin@catmap.drytrix.com")


if __name__ == "__main__":
    main()
