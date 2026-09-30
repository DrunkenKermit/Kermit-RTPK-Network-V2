"""
Kermit (RTPK) Network - AI proxy.

The site itself is static, so an API key can never live in the page: anything
shipped to the browser is public. This endpoint keeps the key on the server and
forwards the request instead.

    GET  /api/chat   -> {"provider", "keyed", "models": [{"name", "title"}, ...]}
    POST /api/chat   -> OpenAI-shaped chat completion  {model, messages}

Providers, in priority order:
    NAVY_API_KEY        -> https://api.navy/v1          (OpenAI-compatible)
    POLLINATIONS_KEY    -> https://gen.pollinations.ai  (they now require a key)
    on a Vercel deploy  -> https://ai-gateway.vercel.sh/v1, using
                           AI_GATEWAY_API_KEY, or the VERCEL_OIDC_TOKEN that
                           Vercel injects into every deployment
    nothing at all      -> https://gen.pollinations.ai, unauthenticated

Environment:
    NAVY_API_KEY         key from your api.navy dashboard   (takes priority)
    POLLINATIONS_KEY     key from https://enter.pollinations.ai/keys
    AI_GATEWAY_API_KEY   key from the Vercel dashboard; optional, because on
                         Vercel the deployment's own OIDC token is used when
                         this is absent. The gateway bills through Vercel.
"""

import json
import os
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler

# Cloudflare in front of api.navy answers 403 to "Python-urllib/x.y", so the
# client says who it is.
USER_AGENT = (
    "KermitRTPK-Network/1.0 (+https://github.com/DrunkenKermit/Kermit-RTPK-Network)"
)

# Vercel rejects a function request body over 4.5 MB before this code is even
# reached, so there is no point accepting more than that; anywhere else keep
# room for a screen grab or a few photos.
MAX_BODY = (4 if os.environ.get("VERCEL") else 16) * 1024 * 1024
TIMEOUT = 120


def env_key(*names):
    for name in names:
        value = (os.environ.get(name) or "").strip()
        if value:
            return value
    return ""


def provider():
    """The first provider with a credential, Pollinations unauthenticated last."""
    navy_key = env_key("NAVY_API_KEY")
    if navy_key:
        return {
            "name": "navy",
            "base": "https://api.navy/v1",
            "chat": "/chat/completions",
            "models": "/models",
            "key": navy_key,
        }

    pollinations_key = env_key("POLLINATIONS_KEY", "POLLINATIONS_API_KEY")
    if pollinations_key:
        return {
            "name": "pollinations",
            "base": "https://gen.pollinations.ai",
            "chat": "/v1/chat/completions",
            "models": "/models",
            "key": pollinations_key,
        }

    # Vercel hands every deployment a short-lived OIDC token, and the AI Gateway
    # accepts it as a bearer token, so this needs no key configured by hand.
    gateway_key = env_key("AI_GATEWAY_API_KEY", "VERCEL_OIDC_TOKEN")
    if gateway_key:
        return {
            "name": "gateway",
            "base": "https://ai-gateway.vercel.sh/v1",
            "chat": "/chat/completions",
            "models": "/models",
            "key": gateway_key,
            # The gateway rejects a request with no model, unlike the others.
            "default": "openai/gpt-5.4-nano",
        }

    return {
        "name": "pollinations",
        "base": "https://gen.pollinations.ai",
        "chat": "/v1/chat/completions",
        "models": "/models",
        "key": "",
    }


def upstream(method, path, payload=None):
    """Call the provider. Returns (status, json-or-error-dict)."""
    current = provider()

    body = None
    headers = {
        "Accept": "application/json",
        "User-Agent": USER_AGENT,
    }

    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"

    if current["key"]:
        headers["Authorization"] = "Bearer " + current["key"]

    request = urllib.request.Request(
        current["base"] + path, data=body, headers=headers, method=method
    )

    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            raw = response.read().decode("utf-8", "replace")
            status = response.status
    except urllib.error.HTTPError as error:
        raw = error.read().decode("utf-8", "replace")
        status = error.code
    except Exception as error:  # DNS, timeout, TLS, ...
        return 502, {"error": "upstream request failed: %s" % error}

    try:
        return status, json.loads(raw)
    except ValueError:
        return status, {"error": (raw[:400] or "empty upstream response")}


def text_models():
    """The provider's chat models, flattened for the picker."""
    current = provider()
    status, data = upstream("GET", current["models"])

    if status != 200:
        return []

    # Pollinations wraps the catalogue in a list, api.navy and the Vercel AI
    # Gateway in {"data": [...]}.
    entries = data if isinstance(data, list) else (data or {}).get("data")
    if not isinstance(entries, list):
        return []

    models = []
    for item in entries:
        if not isinstance(item, dict):
            continue

        # The id is what the provider wants back in "model", so it wins; the
        # gateway is the one that also carries a human-readable "name".
        name = item.get("id") or item.get("name")
        if not name:
            continue

        if current["name"] == "navy":
            # The catalogue mixes chat, image, audio and embedding models.
            endpoint = item.get("endpoint")
            if endpoint and endpoint != "/v1/chat/completions":
                continue
        elif current["name"] == "pollinations":
            if item.get("category") not in (None, "text"):
                continue
            # Without a key the paid-only models answer 401, so leave them out
            # of the picker rather than let a choice fail later.
            if item.get("paid_only") and not current["key"]:
                continue
        elif item.get("type") not in (None, "language"):
            # The gateway lists 395 models, only 268 of them chat models.
            continue

        models.append({"name": name, "title": item.get("title") or item.get("name") or name})

    return models


class handler(BaseHTTPRequestHandler):
    def _send(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        current = provider()
        self._send(
            200,
            {
                "provider": current["name"],
                "keyed": bool(current["key"]),
                "models": text_models(),
            },
        )

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0

        if length <= 0 or length > MAX_BODY:
            self._send(400, {"error": "missing or oversized request body"})
            return

        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
        except ValueError:
            self._send(400, {"error": "body must be JSON"})
            return

        messages = payload.get("messages")
        if not isinstance(messages, list) or not messages:
            self._send(400, {"error": "messages[] is required"})
            return

        current = provider()

        body = {"messages": messages}
        model = payload.get("model") or current.get("default")
        if model:
            body["model"] = model

        status, data = upstream("POST", current["chat"], body)
        self._send(status if 200 <= status < 600 else 502, data)

    def log_message(self, *args):
        # Never log request bodies: they can carry the conversations.
        pass
