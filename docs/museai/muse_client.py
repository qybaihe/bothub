#!/usr/bin/env python3
"""Meta Muse (muse.ai / Hatch) control-plane client sketch.

This module covers the HTTPS control plane that *can* be called with cookies:
  OIDC helpers, auth/check, VM wake/lease/token, falco is intentionally omitted.

The real chat / connectors / memory / Sentinel RPCs run over
  wss://hatch.metaaivm.com/v1/noise
with Noise_XX_25519_AESGCM_SHA256 + protobuf framing. A working Noise transport
is NOT implemented here (needs libsodium, notary verification, and protos
reverse-engineered from the JS bundles). For BotHub MVP, drive muse.ai inside
Electron WebContentsView and call window-side sendRequest via preload.

See protocol.md for the full method catalog (387 RPCs).
"""

from __future__ import annotations

import json
import re
import uuid
from dataclasses import dataclass
from typing import Any, Optional
from urllib.parse import urlencode, urljoin

# Optional: curl_cffi survives some bot checks better than plain requests.
try:
    from curl_cffi import requests as http  # type: ignore
except Exception:  # pragma: no cover
    import requests as http  # type: ignore


ORIGIN = "https://muse.ai"
HATCH_NOISE_HOST = "hatch.metaaivm.com"
HATCH_NOISE_PATH = "/v1/noise"


@dataclass
class AuthCheck:
    ok: bool
    access_token: str
    session_binding_id: str
    viewer_id: str
    outcome: str


@dataclass
class VmLease:
    status: str
    gateway_url: str
    vm_name: str
    vm_id: Optional[str] = None


@dataclass
class GatewayCreds:
    token: str
    noise_notary_token: Optional[str]
    gateway_url: str
    vm_name: Optional[str]


class MuseControlPlane:
    """Cookie-authenticated HTTPS client for muse.ai control plane."""

    def __init__(self, cookies: dict[str, str], user_agent: Optional[str] = None):
        self.session = http.Session()
        if hasattr(self.session, "cookies"):
            for k, v in cookies.items():
                self.session.cookies.set(k, v, domain="muse.ai")
        self.headers = {
            "User-Agent": user_agent
            or "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36",
            "Origin": ORIGIN,
            "Referer": ORIGIN + "/",
            "Accept": "application/json, text/plain, */*",
        }

    def _url(self, path: str) -> str:
        return urljoin(ORIGIN + "/", path.lstrip("/"))

    def auth_check(self) -> AuthCheck:
        r = self.session.post(self._url("/api/auth/check"), headers=self.headers, json={})
        r.raise_for_status()
        d = r.json()
        return AuthCheck(
            ok=bool(d.get("ok")),
            access_token=d.get("access_token") or "",
            session_binding_id=d.get("session_binding_id") or "",
            viewer_id=str(d.get("viewer_id") or ""),
            outcome=str(d.get("outcome") or ""),
        )

    def consent_status(self) -> dict[str, Any]:
        r = self.session.get(self._url("/api/consent/status"), headers=self.headers)
        r.raise_for_status()
        return r.json()

    def wake_vm(self) -> dict[str, Any]:
        r = self.session.post(self._url("/api/hatch/vm/wake"), headers=self.headers, json={})
        r.raise_for_status()
        return r.json()

    def lease_vm(self, vm_type: str = "hatch_vm") -> VmLease:
        r = self.session.post(
            self._url("/api/hatch/lease-vm"),
            headers={**self.headers, "Content-Type": "application/json"},
            data=json.dumps({"vmType": vm_type}),
        )
        r.raise_for_status()
        d = r.json()
        if d.get("status") != "assigned":
            raise RuntimeError(f"lease-vm unexpected: {d}")
        return VmLease(
            status=d["status"],
            gateway_url=d["gatewayUrl"],
            vm_name=d["vmName"],
            vm_id=(d.get("vmId") or None),
        )

    def hatch_token(self, gateway_url: str, vm_name: Optional[str] = None, force_refresh: bool = False) -> GatewayCreds:
        body: dict[str, Any] = {"vmAddress": gateway_url}
        if vm_name:
            body["vmName"] = vm_name
        if force_refresh:
            body["force_refresh"] = True
        r = self.session.post(
            self._url("/api/hatch/token"),
            headers={**self.headers, "Content-Type": "application/json"},
            data=json.dumps(body),
        )
        r.raise_for_status()
        d = r.json()
        return GatewayCreds(
            token=d["token"],
            noise_notary_token=d.get("notary_token"),
            gateway_url=gateway_url,
            vm_name=vm_name,
        )

    def noise_notary_token(self, vm_name: str) -> str:
        r = self.session.post(
            self._url("/api/hatch/noise-notary-token"),
            headers={**self.headers, "Content-Type": "application/json"},
            data=json.dumps({"vmName": vm_name}),
        )
        r.raise_for_status()
        d = r.json()
        tok = d.get("notaryToken") or d.get("notary_token")
        if not isinstance(tok, str) or not tok.strip():
            raise RuntimeError("notary token missing")
        return tok

    def invite(self) -> dict[str, Any]:
        r = self.session.get(self._url("/api/hatch/invite"), headers=self.headers)
        r.raise_for_status()
        return r.json()


def build_noise_ws_url(
    vm_id: str,
    auth_token: str,
    notary_token: Optional[str] = None,
    app_id: str = "hatch-web",
    request_id: Optional[str] = None,
) -> str:
    """Construct the Noise WebSocket URL used by the official web client."""
    q = {
        "vm_id": vm_id,
        "auth_token": auth_token,
        "app_id": app_id,
        "request_id": request_id or str(uuid.uuid4()),
    }
    if notary_token:
        q["notary_token"] = notary_token
    return f"wss://{HATCH_NOISE_HOST}{HATCH_NOISE_PATH}?{urlencode(q)}"


def extract_vm_id_from_gateway_url(gateway_url: str) -> Optional[str]:
    """wss://<vmId>.metaaivm.com/ → vmId"""
    m = re.match(r"wss://([a-f0-9-]{36})\.metaaivm\.com/?", gateway_url.strip())
    return m.group(1) if m else None


# ---- Gateway RPC sketches (NOT executable without Noise transport) ----

CHAT_STREAM_EXAMPLE = {
    "items": [{"type": "text", "text": "hello"}],
    "node_id": "<deviceId>",
    # "session_id": "<thread session id>",
    "capabilities": [],
}

APPROVAL_DECIDE_EXAMPLE = {
    "approval_id": "<id>",
    "decision": "allow_once",  # allow_once | deny | allow_always | deny_always
    "reason": None,
    "expires_at_ms": None,
    "notification_channel": None,
    "expected_message_revision": None,
}

GATEWAY_METHODS_OF_INTEREST = {
    "chat.stream": ("POST", "/chat/stream", True),
    "chat.history": ("GET", "/chat/history", False),
    "chat.cancel": ("POST", "/chat/cancel", True),
    "sessions.list": ("GET", "/api/session/list", False),
    "session.start": ("POST", "/session/start", False),
    "connectors.list": ("GET", "/connectors", False),
    "connectors.connect": ("POST", "/connectors/{id}/connect", False),
    "connectors.disconnect": ("POST", "/connectors/{id}/disconnect", False),
    "egress.approvals": ("GET", "/approvals", False),  # service=sentinel
    "egress.approval.decide": ("POST", "/approvals/{approval_id}/decide", False),
    "memory.search": ("POST", "/memory/search", False),
    "memory.get": ("POST", "/memory/get", False),
    "activity.list": ("GET", "/activity", False),
}


class NoiseGatewayNotImplemented(NotImplementedError):
    def __init__(self):
        super().__init__(
            "Noise_XX gateway is not implemented in this sketch. "
            "Use Electron WebContentsView + page sendRequest, or port "
            "Noise_XX_25519_AESGCM_SHA256 + protobuf frames from museai/js."
        )


class MuseNoiseGateway:
    """Placeholder for the encrypted RPC channel."""

    def __init__(self, ws_url: str):
        self.ws_url = ws_url

    def connect(self) -> None:
        raise NoiseGatewayNotImplemented()

    def send_request(self, method: str, params: Optional[dict] = None) -> Any:
        raise NoiseGatewayNotImplemented()

    def chat_stream(self, text: str, node_id: str, session_id: Optional[str] = None) -> Any:
        params = {
            "items": [{"type": "text", "text": text}],
            "node_id": node_id,
            "capabilities": [],
        }
        if session_id:
            params["session_id"] = session_id
        return self.send_request("chat.stream", params)

    def list_approvals(self) -> Any:
        return self.send_request("egress.approvals", {})

    def decide_approval(self, approval_id: str, decision: str = "allow_once", **kw: Any) -> Any:
        body = {"approval_id": approval_id, "decision": decision, **kw}
        return self.send_request("egress.approval.decide", body)


def oidc_start_url() -> str:
    return ORIGIN + "/api/oidc/start"


if __name__ == "__main__":
    print("Muse control-plane sketch")
    print("OIDC start:", oidc_start_url())
    print("Noise path:", HATCH_NOISE_PATH)
    print("Example chat.stream payload:", json.dumps(CHAT_STREAM_EXAMPLE, indent=2))
    print("RPCs of interest:", ", ".join(GATEWAY_METHODS_OF_INTEREST))
    print("Full catalog: samples/gateway_methods.json")
