import hashlib
import base64
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple, Dict, Any
import httpx
import jwt
from jwt import PyJWKSet, PyJWKClientError

from backend.config import settings

# In-memory PKCE & State store with TTL cleanup for CSRF protection
_oauth_states: Dict[str, Dict[str, Any]] = {}
_cached_jwks: Optional[Tuple[float, PyJWKSet]] = None


async def get_telegram_jwks() -> PyJWKSet:
    """Fetches Telegram JWKS with gzip handling and in-memory TTL caching."""
    global _cached_jwks
    now = datetime.now(timezone.utc).timestamp()
    if _cached_jwks and (now - _cached_jwks[0] < 3600):
        return _cached_jwks[1]
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get("https://oauth.telegram.org/.well-known/jwks.json")
        resp.raise_for_status()
        jwks = PyJWKSet.from_dict(resp.json())
        _cached_jwks = (now, jwks)
        return jwks

def get_jwt_secret() -> str:
    if settings.JWT_SECRET and settings.JWT_SECRET.strip():
        return settings.JWT_SECRET.strip()
    if settings.BOT_TOKEN and settings.BOT_TOKEN.strip():
        # Derive a stable secret from BOT_TOKEN
        return hashlib.sha256(settings.BOT_TOKEN.strip().encode()).hexdigest()
    if not settings.DEBUG:
        raise RuntimeError("JWT_SECRET or BOT_TOKEN must be configured in production to secure tokens.")
    return "taskerbot-default-development-jwt-secret-key-32bytes!"


def get_telegram_client_id() -> str:
    if settings.TELEGRAM_OIDC_CLIENT_ID and settings.TELEGRAM_OIDC_CLIENT_ID.strip():
        return settings.TELEGRAM_OIDC_CLIENT_ID.strip()
    if settings.BOT_TOKEN and ":" in settings.BOT_TOKEN:
        return settings.BOT_TOKEN.split(":")[0]
    return "1234567890"


def create_access_token(
    telegram_id: int,
    username: Optional[str] = None,
    first_name: Optional[str] = None,
    photo_url: Optional[str] = None,
    expires_delta: Optional[timedelta] = None,
) -> Tuple[str, int]:
    """Generates an internal JWT Bearer token for web clients."""
    delta = expires_delta or timedelta(days=settings.JWT_EXPIRATION_DAYS)
    exp = datetime.now(timezone.utc) + delta
    expires_in = int(delta.total_seconds())

    payload = {
        "sub": str(telegram_id),
        "telegram_id": telegram_id,
        "username": username,
        "first_name": first_name,
        "photo_url": photo_url,
        "exp": exp,
        "iat": datetime.now(timezone.utc),
        "iss": "taskerbot-api",
    }
    token = jwt.encode(payload, get_jwt_secret(), algorithm=settings.JWT_ALGORITHM)
    return token, expires_in


def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    """Decodes and validates an internal JWT Bearer token."""
    try:
        payload = jwt.decode(
            token,
            get_jwt_secret(),
            algorithms=[settings.JWT_ALGORITHM],
            issuer="taskerbot-api",
        )
        return payload
    except Exception:
        return None


def generate_state() -> str:
    return secrets.token_urlsafe(32)


import hmac
import json
import urllib.parse

def generate_pkce_pair() -> Tuple[str, str]:
    """Generates PKCE code_verifier and S256 code_challenge."""
    verifier = secrets.token_urlsafe(64)
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    challenge = base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")
    return verifier, challenge


def store_oauth_state(state: str, code_verifier: Optional[str] = None, redirect_uri: Optional[str] = None) -> None:
    now = datetime.now(timezone.utc).timestamp()
    # Prune expired states older than 15 minutes
    expired = [k for k, v in _oauth_states.items() if now - v.get("created_at", 0) > 900]
    for k in expired:
        _oauth_states.pop(k, None)

    _oauth_states[state] = {
        "code_verifier": code_verifier,
        "redirect_uri": redirect_uri,
        "created_at": now,
    }


def pop_oauth_state(state: str) -> Optional[Dict[str, Any]]:
    state_data = _oauth_states.get(state)
    if not state_data:
        return None
    # Allow a 60-second grace window for concurrent requests (e.g. React StrictMode)
    now = datetime.now(timezone.utc).timestamp()
    if "first_accessed" not in state_data:
        state_data["first_accessed"] = now
    elif now - state_data["first_accessed"] > 60:
        _oauth_states.pop(state, None)
    return state_data


def build_telegram_auth_url(redirect_uri: str) -> Tuple[str, str, str]:
    """
    Builds the authorization redirect URL for Telegram OIDC.
    Returns: (auth_url, state, code_verifier)
    """
    client_id = get_telegram_client_id()
    state = generate_state()
    verifier, challenge = generate_pkce_pair()

    # Strictly normalize redirect_uri per RFC 6749
    redirect_uri = redirect_uri.strip().rstrip("/")

    store_oauth_state(state, code_verifier=verifier, redirect_uri=redirect_uri)

    # Standard OIDC Authorization Request parameters (RFC 6749 / OpenID Connect Core 1.0)
    # Non-standard parameters like 'origin' are intentionally omitted to avoid falling back to legacy widget behavior
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid profile",
        "state": state,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
    }
    query_str = urllib.parse.urlencode(params)
    auth_url = f"https://oauth.telegram.org/auth?{query_str}"
    return auth_url, state, verifier


async def exchange_telegram_code(
    code: str,
    redirect_uri: str,
    code_verifier: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Exchanges an authorization code with Telegram OIDC Token Endpoint
    (https://oauth.telegram.org/token) using client_secret_post per OpenID Connect Core 1.0.
    """
    client_id = get_telegram_client_id()
    client_secret = settings.TELEGRAM_OIDC_CLIENT_SECRET.strip()

    if not client_secret:
        raise ValueError(
            "TELEGRAM_OIDC_CLIENT_SECRET is not configured on the server. "
            "Please configure TELEGRAM_OIDC_CLIENT_SECRET in your server environment variables (Render Dashboard)."
        )

    # Strictly normalize redirect_uri
    redirect_uri = redirect_uri.strip().rstrip("/")

    # OpenID Connect Core 1.0 Section 3.1.3.1 - client_secret_post
    # Passing both Basic auth headers and POST body parameters violates RFC 6749 Section 2.3
    # and burns the single-use authorization code. client_secret_post is the canonical format for Telegram OIDC.
    token_payload = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": redirect_uri,
        "client_id": client_id,
        "client_secret": client_secret,
    }
    if code_verifier:
        token_payload["code_verifier"] = code_verifier

    headers = {
        "Accept": "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            "https://oauth.telegram.org/token",
            data=token_payload,
            headers=headers,
        )
        if resp.status_code != 200:
            raise ValueError(f"Telegram token endpoint returned HTTP {resp.status_code}: {resp.text}")
        try:
            token_data = resp.json()
        except Exception:
            raise ValueError(f"Failed to parse Telegram token response: {resp.text}")

    # Telegram returns HTTP 200 with {"error": "..."} upon failures
    if "error" in token_data:
        err = token_data.get("error")
        desc = token_data.get("error_description") or ""
        msg = f"{err} ({desc})" if desc else str(err)
        raise ValueError(f"Telegram OAuth error: {msg} [client_id={client_id}, redirect_uri={redirect_uri}]")

    id_token = token_data.get("id_token")
    if not id_token:
        keys_present = list(token_data.keys())
        raise ValueError(f"Missing id_token in Telegram token response (keys received: {keys_present})")

    # Verify ID token via Telegram JWKS
    claims = await verify_telegram_id_token(id_token, client_id)

    # In case Telegram returns additional user attributes in token_data (e.g. id, user)
    for k, v in token_data.items():
        if k not in claims and k not in ("access_token", "id_token", "refresh_token", "token_type", "expires_in"):
            claims[k] = v

    return claims


def validate_telegram_widget_data(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Validates data received from Telegram Login Widget / tgAuthResult
    per specification: https://core.telegram.org/widgets/login#checking-authorization
    """
    if not settings.BOT_TOKEN or not settings.BOT_TOKEN.strip():
        raise ValueError("BOT_TOKEN is not configured on the server")

    data_copy = dict(data)
    received_hash = data_copy.pop("hash", None)
    if not received_hash:
        raise ValueError("Missing hash parameter in Telegram widget data")

    # Filter out None values and convert to string
    items = []
    for k, v in data_copy.items():
        if v is not None and v != "":
            items.append(f"{k}={v}")
    items.sort()
    data_check_string = "\n".join(items)

    # For Telegram Login Widget: secret_key is SHA256 of bot token
    secret_key = hashlib.sha256(settings.BOT_TOKEN.strip().encode("utf-8")).digest()
    expected_hash = hmac.new(secret_key, data_check_string.encode("utf-8"), hashlib.sha256).hexdigest()

    if not hmac.compare_digest(received_hash, expected_hash):
        raise ValueError("Invalid Telegram Login Widget signature (hash mismatch)")

    # Validate auth_date freshness (allow up to 48 hours)
    auth_date = data.get("auth_date")
    if auth_date:
        try:
            auth_timestamp = int(auth_date)
            now = datetime.now(timezone.utc).timestamp()
            if now - auth_timestamp > 86400 * 2:
                raise ValueError("Telegram widget authorization has expired")
        except (ValueError, TypeError):
            pass

    return {
        "telegram_id": int(data["id"]),
        "first_name": data.get("first_name", ""),
        "last_name": data.get("last_name", ""),
        "username": data.get("username", ""),
        "photo_url": data.get("photo_url"),
    }


def validate_telegram_webapp_init_data(init_data: str) -> Dict[str, Any]:
    """
    Validates Telegram WebApp initData string using HMAC-SHA256
    per Telegram WebApp specification:
    https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
    """
    if not settings.BOT_TOKEN or not settings.BOT_TOKEN.strip():
        raise ValueError("BOT_TOKEN is not configured on the server")

    parsed = dict(urllib.parse.parse_qsl(init_data, keep_blank_values=True))
    received_hash = parsed.pop("hash", None)
    # Telegram Bot API 7.0+ may include third-party signature which must not be part of HMAC data-check-string
    parsed.pop("signature", None)
    if not received_hash:
        raise ValueError("Missing hash parameter in Telegram WebApp initData")

    # Sort key-value pairs alphabetically
    data_check_arr = [f"{k}={v}" for k, v in sorted(parsed.items())]
    data_check_string = "\n".join(data_check_arr)

    # Secret key is HMAC-SHA256 of bot token with key "WebAppData"
    secret_key = hmac.new(b"WebAppData", settings.BOT_TOKEN.strip().encode("utf-8"), hashlib.sha256).digest()
    expected_hash = hmac.new(secret_key, data_check_string.encode("utf-8"), hashlib.sha256).hexdigest()

    if not hmac.compare_digest(received_hash, expected_hash):
        raise ValueError("Invalid Telegram WebApp initData signature")

    # Check auth_date expiration (allow up to 24 hours per Telegram security standard)
    auth_date = parsed.get("auth_date")
    if auth_date:
        try:
            auth_timestamp = int(auth_date)
            now = datetime.now(timezone.utc).timestamp()
            if now - auth_timestamp > 86400:
                raise ValueError("Telegram WebApp initData has expired")
        except (ValueError, TypeError):
            pass

    user_raw = parsed.get("user")
    if not user_raw:
        raise ValueError("Missing user object in Telegram WebApp initData")

    try:
        user_data = json.loads(user_raw)
    except json.JSONDecodeError:
        raise ValueError("Invalid user JSON in Telegram WebApp initData")

    telegram_id = user_data.get("id")
    if not telegram_id:
        raise ValueError("Missing id in Telegram user data")

    return {
        "telegram_id": int(telegram_id),
        "first_name": user_data.get("first_name", ""),
        "last_name": user_data.get("last_name", ""),
        "username": user_data.get("username", ""),
        "photo_url": user_data.get("photo_url"),
    }


async def verify_telegram_id_token(id_token: str, client_id: str) -> Dict[str, Any]:
    """
    Verifies a Telegram RS256/ES256 signed ID token against Telegram's public JWKS.
    Handles gzip decompression and caches public keys.
    """
    try:
        jwks = await get_telegram_jwks()
        header = jwt.get_unverified_header(id_token)
        kid = header.get("kid")
        alg = header.get("alg", "RS256")

        signing_key = None
        if kid:
            try:
                signing_key = jwks[kid].key
            except KeyError:
                pass

        if not signing_key:
            for k in jwks.keys:
                if getattr(k, "key_id", None) == kid or getattr(k, "algorithm_name", None) == alg:
                    signing_key = k.key
                    break

        if not signing_key and jwks.keys:
            signing_key = jwks.keys[0].key

        claims = jwt.decode(
            id_token,
            signing_key,
            algorithms=["RS256", "ES256", "EdDSA", "ES256K"],
            audience=[client_id, str(client_id)],
            issuer="https://oauth.telegram.org",
            options={"verify_exp": True},
        )
        return claims
    except Exception as e:
        if settings.DEBUG:
            return jwt.decode(id_token, options={"verify_signature": False})
        raise ValueError(f"Failed to verify Telegram ID Token ({type(e).__name__}): {e}")


def extract_user_profile(claims: Dict[str, Any]) -> Dict[str, Any]:
    """
    Extracts standard fields (telegram_id, first_name, username, photo_url)
    from Telegram OIDC claims.
    """
    # Prioritize Telegram user ID ('id', 'user_id', 'telegram_id') over OIDC 'sub'.
    # Telegram's OIDC 'sub' is a 64-bit unsigned subject identifier which can exceed signed int64,
    # whereas 'id' is the canonical numeric Telegram user ID matching Bot API and WebApp.
    raw_id = (
        claims.get("id")
        or claims.get("user_id")
        or claims.get("telegram_id")
        or claims.get("sub")
    )
    if raw_id is None:
        raise ValueError("Missing user ID or subject claim in Telegram token")

    try:
        telegram_id = int(raw_id)
    except (ValueError, TypeError):
        raise ValueError(f"Invalid user ID claim: {raw_id}")

    # Boundary check for PostgreSQL BIGINT (signed 64-bit integer: -9223372036854775808 to 9223372036854775807).
    # If raw_id came from an unsigned 64-bit "sub" claim (> 2^63 - 1), map it to signed 64-bit range
    # via two's complement wrap around to prevent asyncpg/PostgreSQL integer overflow.
    if telegram_id >= (1 << 63):
        telegram_id -= (1 << 64)

    first_name = (
        claims.get("given_name")
        or claims.get("first_name")
        or claims.get("name")
        or f"User {telegram_id}"
    )
    username = claims.get("preferred_username") or claims.get("username")
    photo_url = claims.get("picture") or claims.get("photo_url")

    return {
        "telegram_id": telegram_id,
        "first_name": first_name,
        "username": username,
        "photo_url": photo_url,
    }
