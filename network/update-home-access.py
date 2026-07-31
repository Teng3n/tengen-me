#!/usr/bin/env python3
"""Keep the owner Access policy's required home IPv4 rule current.

The script deliberately updates one reusable Cloudflare Access policy and no
other account resource. Configure it with a token scoped to that policy when
Cloudflare's resource-scoped Access roles are available for the account.
"""

from __future__ import annotations

import ipaddress
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


def fetch_json(url: str, token: str | None = None, method: str = "GET", body: dict | None = None) -> dict:
    headers = {"Accept": "application/json", "User-Agent": "tengen-home-access-updater/1.0"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body, separators=(",", ":")).encode("utf-8")
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.loads(response.read().decode("utf-8"))


def current_public_ipv4() -> str:
    lookup_url = os.environ.get("HOME_IP_LOOKUP_URL", "https://api.ipify.org?format=json")
    payload = fetch_json(lookup_url)
    address = ipaddress.ip_address(str(payload.get("ip", "")))
    if address.version != 4 or not address.is_global:
        raise RuntimeError("The lookup did not return a public IPv4 address")
    return f"{address}/32"


def main() -> int:
    account_id = required_environment("CF_ACCOUNT_ID")
    policy_id = required_environment("CF_ACCESS_POLICY_ID")
    api_token = required_environment("CF_API_TOKEN")
    policy_url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/access/policies/{policy_id}"
    desired_cidr = current_public_ipv4()

    response = fetch_json(policy_url, api_token)
    if not response.get("success") or not isinstance(response.get("result"), dict):
        raise RuntimeError("Cloudflare did not return the Access policy")
    policy = response["result"]
    require_rules = list(policy.get("require") or [])
    current_ip_rules = [rule for rule in require_rules if isinstance(rule, dict) and "ip" in rule]
    if current_ip_rules == [{"ip": {"ip": desired_cidr}}]:
        print(f"Home Access policy already requires {desired_cidr}")
        return 0

    updated_require = [rule for rule in require_rules if not (isinstance(rule, dict) and "ip" in rule)]
    updated_require.append({"ip": {"ip": desired_cidr}})
    allowed_fields = (
        "name", "decision", "include", "exclude", "precedence", "session_duration",
        "purpose_justification_required", "purpose_justification_prompt",
        "approval_required", "approval_groups", "isolation_required",
    )
    update = {field: policy[field] for field in allowed_fields if field in policy and policy[field] is not None}
    update["require"] = updated_require
    result = fetch_json(policy_url, api_token, method="PUT", body=update)
    if not result.get("success"):
        raise RuntimeError("Cloudflare rejected the Access policy update")
    print(f"Updated the home Access requirement to {desired_cidr}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (RuntimeError, ValueError, urllib.error.URLError, json.JSONDecodeError) as error:
        print(f"Home Access update failed: {error}", file=sys.stderr)
        raise SystemExit(1)
