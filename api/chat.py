"""
Kermit (RTPK) Network - AI proxy.

The site is static, so an API key can never live in the page: anything shipped
to the browser is public. This endpoint keeps the keys on the server and
forwards the request to whichever provider the chosen model belongs to.

    GET  /api/chat  -> {"providers": [...], "models": [{"name", "title", "provider"}]}
    POST /api/chat  -> {model, messages}  -> OpenAI-shaped chat completion

Providers (each only shows up once its key is set on the server):

    GEMINI_API_KEY      Google Gemini                   text + images
    HUGGINGFACE_API_KEY https://router.huggingface.co    text + images
    OPENROUTER_API_KEY  https://openrouter.ai/api/v1    text + images
    OPENROUTER_API_KEY_2  optional second OpenRouter key, used by whichever
                        OpenRouter model names it (see "model_env" below)

Model ids are namespaced by provider, e.g. "gemini:gemini-3.5-flash-lite" or
"openrouter:openai/gpt-5-mini", so the page can tell which key to use without
guessing. Gemini replies are converted back into the OpenAI shape, so the page
only ever has to understand one response format.

Set the keys in the project's environment (Settings -> Environment, or the
hosting env vars). Never put them in this repository.
"""

import json
import os
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler

USER_AGENT = (
    "KermitRTPK-Network/1.0 (+https://github.com/DrunkenKermit/Kermit-RTPK-Network)"
)

# Vercel rejects a function request body over 4.5 MB before this code is even
# reached; anywhere else keep room for a screen grab or a few photos.
MAX_BODY = (4 if os.environ.get("VERCEL") else 16) * 1024 * 1024
TIMEOUT = 120

# The whole catalogue. `kind` picks the request/response shape; `vision` says
# whether the provider accepts image attachments.
PROVIDERS = {
    "gemini": {
        "label": "Google Gemini",
        "env": "GEMINI_API_KEY",
        "base": "https://generativelanguage.googleapis.com/v1beta",
        "kind": "gemini",
        # Google's newest Flash model ("gemini-flash-latest", currently
        # gemini-3.8-flash) has a tiny free daily allowance: 20 requests per
        # project per day, which a chat session burns through in minutes. The
        # Flash-Lite line is built for high-volume traffic and carries a far
        # larger free quota, so it is the default here. The previous Flash
        # generation sits next to it for harder questions; every Gemini model
        # has its own daily bucket, so the two together outlast either alone.
        "models": [
            ("gemini-3.5-flash-lite", "Gemini 3.5 Flash-Lite", True),
            ("gemini-3.5-flash", "Gemini 3.5 Flash", True),
        ],
    },
    "huggingface": {
        "label": "Hugging Face",
        "env": "HUGGINGFACE_API_KEY",
        "base": "https://router.huggingface.co/v1",
        "chat": "/chat/completions",
        "kind": "openai",
        # Same reason as OpenRouter: cap the ask so a credit check doesn't
        # reserve the model's whole output window.
        "max_tokens": 4096,
        "models": [
            ("deepseek-ai/DeepSeek-V4.1-Flash", "DeepSeek V4.1 Flash", True),
        ],
    },
    "openrouter": {
        "label": "OpenRouter",
        "env": "OPENROUTER_API_KEY",
        "base": "https://openrouter.ai/api/v1",
        "chat": "/chat/completions",
        "kind": "openai",
        # OpenRouter pre-authorises credit for the model's *maximum* output when
        # max_tokens is absent, which makes even cheap models fail with a 402.
        "max_tokens": 4096,
        # Two OpenRouter keys can be used at once: a model names the env var that
        # holds its key, and falls back to OPENROUTER_API_KEY when that is unset.
        # Any other id still works by asking for "openrouter:<id>" directly.
        "model_env": {
            "openai/gpt-5-mini": "OPENROUTER_API_KEY",
            "anthropic/claude-haiku-4.5": "OPENROUTER_API_KEY_2",
        },
        "models": [
            ("openai/gpt-5-mini", "GPT-5 mini", True),
            ("anthropic/claude-haiku-4.5", "Claude Haiku 4.5", True),
        ],
    },
}


def env_key(name):
    return (os.environ.get(name) or "").strip()


def model_env(provider, model_id):
    """Which env var holds this model's key.

    A provider may map a model to its own key ("model_env"); that key is used
    when it is set, otherwise the provider's default key is used instead.
    """
    named = (provider.get("model_env") or {}).get(model_id)
    if named and env_key(named):
        return named
    return provider["env"]


def secret_env_names():
    """Every env var that can hold a provider key."""
    names = set()
    for provider in PROVIDERS.values():
        names.add(provider["env"])
        names.update((provider.get("model_env") or {}).values())
    return names


def catalogue():
    """Every model whose own key is set, ready for the picker."""
    models = []
    for provider_key, provider in PROVIDERS.items():
        for model_id, title, vision in provider["models"]:
            if not env_key(model_env(provider, model_id)):
                continue
            models.append({
                "name": provider_key + ":" + model_id,
                "title": title,
                "provider": provider_key,
                "vision": vision,
            })
    return models


def resolve(model):
    """Map a picker value onto (provider_key, model_id)."""
    if not isinstance(model, str) or not model:
        return None, None

    if ":" in model:
        provider_key, model_id = model.split(":", 1)
        provider_key = provider_key.strip().lower()
        if provider_key in PROVIDERS and model_id:
            return provider_key, model_id.strip()

    # A bare id (e.g. one remembered from before) still works if it is known.
    for provider_key, provider in PROVIDERS.items():
        for model_id, _title, _vision in provider["models"]:
            if model_id == model:
                return provider_key, model_id
    return None, None


def model_vision(provider_key, model_id):
    """Whether the chosen model accepts image attachments."""
    for mid, _title, vision in PROVIDERS[provider_key]["models"]:
        if mid == model_id:
            return vision
    return True


def decode_data_url(url):
    """Turn a data: URL into a Gemini inline_data blob."""
    if not isinstance(url, str) or not url.startswith("data:"):
        return None
    try:
        head, data = url.split(",", 1)
    except ValueError:
        return None
    if ";base64" not in head:
        return None
    mime = head[5:].split(";", 1)[0] or "image/png"
    return {"mime_type": mime, "data": data}


def text_only(messages):
    """Drop image parts for a model that cannot see images."""
    out = []
    for message in messages:
        content = message.get("content")
        if isinstance(content, list):
            text = "\n".join(
                part.get("text", "")
                for part in content
                if isinstance(part, dict) and part.get("type") == "text"
            )
            out.append({"role": message.get("role", "user"), "content": text})
        else:
            out.append(message)
    return out


def gemini_payload(messages):
    """Convert OpenAI-shaped messages into Gemini contents + system prompt."""
    contents = []
    system = []

    for message in messages:
        content = message.get("content")
        role = message.get("role", "user")
        parts = []

        if isinstance(content, str):
            if content:
                parts.append({"text": content})
        elif isinstance(content, list):
            for part in content:
                if not isinstance(part, dict):
                    continue
                if part.get("type") == "text" and part.get("text"):
                    parts.append({"text": part["text"]})
                elif part.get("type") == "image_url":
                    blob = decode_data_url((part.get("image_url") or {}).get("url"))
                    if blob:
                        parts.append({"inline_data": blob})

        if not parts:
            continue
        if role in ("system", "developer"):
            system.extend(parts)
        else:
            contents.append({
                "role": "model" if role == "assistant" else "user",
                "parts": parts,
            })

    return contents, system


def gemini_reply(data):
    """Pull the text out of a Gemini response and wrap it in OpenAI shape."""
    candidates = (data or {}).get("candidates") or []
    if not candidates:
        return None
    content = (candidates[0] or {}).get("content") or {}
    parts = content.get("parts") or []
    text = "".join(p.get("text", "") for p in parts if isinstance(p, dict))
    return text or None


def upstream(method, url, env_name, payload=None, header_key=None):
    """Call a provider. Returns (status, json)."""
    key = env_key(env_name)

    body = None
    headers = {"Accept": "application/json", "User-Agent": USER_AGENT}
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    if key:
        if header_key:
            headers[header_key] = key
        else:
            headers["Authorization"] = "Bearer " + key

    request = urllib.request.Request(url, data=body, headers=headers, method=method)

    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            raw = response.read().decode("utf-8", "replace")
            status = response.status
    except urllib.error.HTTPError as error:
        raw = error.read().decode("utf-8", "replace")
        status = error.code
    except Exception as error:  # DNS, timeout, TLS, ...
        return 502, {"error": "Could not reach the provider: %s" % error}

    try:
        return status, json.loads(raw)
    except ValueError:
        return status, {"error": (raw[:400] or "empty provider response")}


def call_openai(provider, model_id, messages, vision=True, env_name=None):
    if not vision:
        messages = text_only(messages)
    body = {"model": model_id, "messages": messages}
    if provider.get("max_tokens"):
        body["max_tokens"] = provider["max_tokens"]
    return upstream(
        "POST",
        provider["base"] + provider["chat"],
        env_name or provider["env"],
        body,
    )


def call_gemini(provider, model_id, messages):
    contents, system = gemini_payload(messages)
    if not contents:
        return 400, {"error": "messages[] has no usable content"}

    body = {"contents": contents}
    if system:
        body["systemInstruction"] = {"parts": system}

    url = provider["base"] + "/models/" + model_id + ":generateContent"
    status, data = upstream("POST", url, provider["env"], body, header_key="x-goog-api-key")
    if status != 200:
        return status, data

    text = gemini_reply(data)
    if not text:
        return 502, {"error": "Gemini returned an empty reply."}
    return 200, {"choices": [{"message": {"role": "assistant", "content": text}}]}


def redact(data):
    """Never echo a configured key back to the browser."""
    text = json.dumps(data)
    for name in secret_env_names():
        key = env_key(name)
        if key and key in text:
            text = text.replace(key, "[redacted]")
    try:
        return json.loads(text)
    except ValueError:
        return {"error": text[:400]}


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
        self._send(200, {
            "providers": [
                k for k, p in PROVIDERS.items()
                if any(env_key(model_env(p, mid)) for mid, _t, _v in p["models"])
            ],
            "models": catalogue(),
        })

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

        provider_key, model_id = resolve(payload.get("model"))
        if not provider_key:
            self._send(400, {
                "error": "Unknown model. Make sure its provider's API key is set.",
            })
            return

        provider = PROVIDERS[provider_key]
        env_name = model_env(provider, model_id)
        if not env_key(env_name):
            self._send(400, {
                "error": "%s isn't configured on the server yet." % provider["label"],
            })
            return

        if provider["kind"] == "gemini":
            status, data = call_gemini(provider, model_id, messages)
        else:
            status, data = call_openai(
                provider,
                model_id,
                messages,
                model_vision(provider_key, model_id),
                env_name,
            )

        self._send(status if 200 <= status < 600 else 502, redact(data))

    def log_message(self, *args):
        # Never log request bodies: they can carry the conversations.
        pass
