#!/usr/bin/env python3
"""Report the home connection to tengen.me's private owner-IP allowlist."""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request


def required_environment(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} is required")
    return value


def fetch_json(url: str, token: str, method: str = "POST") -> dict:
    headers = {"Accept": "application/json", "User-Agent": "tengen-home-access-updater/1.0"}
    headers["Authorization"] = f"Bearer {token}"
    headers["Content-Type"] = "application/json"
    data = b"{}"
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.loads(response.read().decode("utf-8"))


def main() -> int:
    endpoint = os.environ.get(
        "TENGEN_HOME_ACCESS_URL",
        "https://tengen.me/api/owner-network/heartbeat",
    ).strip()
    token = required_environment("TENGEN_HOME_ACCESS_TOKEN")
    result = fetch_json(endpoint, token)
    if result.get("ok") is not True or not isinstance(result.get("cidr"), str):
        raise RuntimeError("tengen.me rejected the home network heartbeat")
    verb = "Updated" if result.get("changed") else "Confirmed"
    print(f"{verb} the approved home network as {result['cidr']}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (RuntimeError, urllib.error.URLError, json.JSONDecodeError) as error:
        print(f"Home Access update failed: {error}", file=sys.stderr)
        raise SystemExit(1)
