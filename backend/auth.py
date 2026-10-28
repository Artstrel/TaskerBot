import hashlib
import base64
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple, Dict, Any
import httpx
import jwt
from jwt import PyJWKClient, PyJWKClientError

from backend.config import settings

# In-memory PKCE & State store with TTL cleanup for CSRF protection
_oauth_states: Dict[str, Dict[str, Any]] = {}

def get_jwt_secret() -> str:
    if settings.JWT_SECRET and settings.JWT_SECRET.strip():
        return settings.JWT_SECRET.strip()
    if settings.BOT_TOKEN and settings.BOT_TOKEN.strip():
        # Derive a stable secret from BOT_TOKEN
        return hashlib.sha256(settings.BOT_TOKEN.strip().encode()).hexdigest()
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


def generate_pkce_pair() -> Tuple[str, str]:
    """Generates PKCE code_verifier and S256 code_challenge."""
    verifier = secrets.token_urlsafe(64)
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    challenge = base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")
    return verifier, challenge


def store_oauth_state(state: str, code_verifier: Optional[str] = None, redirect_uri: Optional[str] = None) -> None:
    now = datetime.now(timezone.utc).timestamp()
    # Prune expired states older than 10 minutes
    expired = [k for k, v in _oauth_states.items() if now - v.get("created_at", 0) > 600]
    for k in expired:
        _oauth_states.pop(k, None)

    _oauth_states[state] = {
        "code_verifier": code_verifier,
        "redirect_uri": redirect_uri,
        "created_at": now,
    }


def pop_oauth_state(state: str) -> Optional[Dict[str, Any]]:
    return _oauth_states.pop(state, None)


def build_telegram_auth_url(redirect_uri: str) -> Tuple[str, str, str]:
    """
    Builds the authorization redirect URL for Telegram OIDC.
    Returns: (auth_url, state, code_verifier)
    """
    client_id = get_telegram_client_id()
    state = generate_state()
    verifier, challenge = generate_pkce_pair()
    store_oauth_state(state, code_verifier=verifier, redirect_uri=redirect_uri)

    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid profile",
        "state": state,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
    }
    import urllib.parse
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
    (https://oauth.telegram.org/token) and extracts verified claims.
    """
    client_id = get_telegram_client_id()
    client_secret = settings.TELEGRAM_OIDC_CLIENT_SECRET.strip()

    payload = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": redirect_uri,
        "client_id": client_id,
    }
    if code_verifier:
        payload["code_verifier"] = code_verifier

    auth = None
    if client_secret:
        auth = (client_id, client_secret)
        payload["client_secret"] = client_secret

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            "https://oauth.telegram.org/token",
            data=payload,
            auth=auth,
            headers={"Accept": "application/json"},
        )
        if resp.status_code != 200:
            raise ValueError(f"Telegram token endpoint returned {resp.status_code}: {resp.text}")

        token_data = resp.json()

    id_token = token_data.get("id_token")
    if not id_token:
        raise ValueError("Missing id_token in Telegram token response")

    # Verify ID token via Telegram JWKS
    claims = verify_telegram_id_token(id_token, client_id)
    return claims


def verify_telegram_id_token(id_token: str, client_id: str) -> Dict[str, Any]:
    """
    Verifies a Telegram RS256/ES256 signed ID token against Telegram's public JWKS.
    """
    try:
        jwks_client = PyJWKClient("https://oauth.telegram.org/.well-known/jwks.json")
        signing_key = jwks_client.get_signing_key_from_jwt(id_token)
        claims = jwt.decode(
            id_token,
            signing_key.key,
            algorithms=["RS256", "ES256"],
            audience=client_id,
            issuer="https://oauth.telegram.org",
            options={"verify_exp": True},
        )
        return claims
    except PyJWKClientError as e:
        # If JWKS lookup fails, decode without verify if in debug/dev or raise
        if settings.DEBUG:
            return jwt.decode(id_token, options={"verify_signature": False})
        raise ValueError(f"Failed to verify Telegram token signature: {e}")
    except Exception as e:
        if settings.DEBUG:
            return jwt.decode(id_token, options={"verify_signature": False})
        raise ValueError(f"Invalid Telegram ID Token: {e}")


def extract_user_profile(claims: Dict[str, Any]) -> Dict[str, Any]:
    """
    Extracts standard fields (telegram_id, first_name, username, photo_url)
    from Telegram OIDC claims.
    """
    raw_sub = claims.get("sub") or claims.get("id")
    try:
        telegram_id = int(raw_sub)
    except (ValueError, TypeError):
        raise ValueError(f"Invalid subject claim: {raw_sub}")

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
