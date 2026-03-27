from __future__ import annotations

import base64
import hashlib
import hmac
import logging
import os
import secrets
import sqlite3
import tempfile
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

from backend.config.env import load_local_env

logger = logging.getLogger("business_agent.auth")


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _to_iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat()


def _from_iso(value: str) -> datetime:
    return datetime.fromisoformat(value)


@dataclass(frozen=True)
class AuthUser:
    id: str
    email: str
    is_verified: bool
    created_at: str


@dataclass(frozen=True)
class SessionRecord:
    token: str
    expires_at: str
    user: AuthUser


def build_scoped_memory_key(user_id: str, company_name: str, requested_memory_key: str | None = None) -> str:
    source = (requested_memory_key or company_name or "business-case").strip().lower()
    sanitized = "".join(character if character.isalnum() else "-" for character in source)
    normalized = "-".join(chunk for chunk in sanitized.split("-") if chunk) or "business-case"
    return f"user:{user_id}:{normalized[:80]}"


class AuthService:
    def __init__(self) -> None:
        load_local_env()
        self.db_path = Path(
            os.getenv(
                "AUTH_DB_PATH",
                str(
                    (
                        Path(tempfile.gettempdir()) / "business_agent_auth.sqlite3"
                        if os.getenv("VERCEL")
                        else Path(__file__).resolve().parent / "auth.sqlite3"
                    )
                ),
            )
        )
        self.session_ttl_seconds = int(os.getenv("SESSION_TTL_SECONDS", "43200"))
        self.verify_ttl_seconds = int(os.getenv("EMAIL_VERIFICATION_TTL_SECONDS", "86400"))
        self.reset_ttl_seconds = int(os.getenv("PASSWORD_RESET_TTL_SECONDS", "1800"))
        self.preview_links_enabled = os.getenv("AUTH_PREVIEW_LINKS", "true").lower() == "true"
        self.cookie_name = os.getenv("SESSION_COOKIE_NAME", "business_agent_session")

    def initialize(self) -> None:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    email TEXT NOT NULL UNIQUE,
                    password_hash TEXT NOT NULL,
                    is_verified INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS sessions (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    token_hash TEXT NOT NULL UNIQUE,
                    created_at TEXT NOT NULL,
                    expires_at TEXT NOT NULL,
                    last_seen_at TEXT NOT NULL,
                    ip_hash TEXT,
                    user_agent TEXT,
                    revoked_at TEXT,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS email_verification_tokens (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    token_hash TEXT NOT NULL UNIQUE,
                    created_at TEXT NOT NULL,
                    expires_at TEXT NOT NULL,
                    used_at TEXT,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS password_reset_tokens (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    token_hash TEXT NOT NULL UNIQUE,
                    created_at TEXT NOT NULL,
                    expires_at TEXT NOT NULL,
                    used_at TEXT,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                );

                CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
                CREATE INDEX IF NOT EXISTS idx_email_verification_user_id ON email_verification_tokens(user_id);
                CREATE INDEX IF NOT EXISTS idx_password_reset_user_id ON password_reset_tokens(user_id);
                """
            )

    def cleanup_expired(self) -> None:
        now = _to_iso(_utcnow())
        with self._connect() as connection:
            connection.execute("DELETE FROM email_verification_tokens WHERE expires_at < ? OR used_at IS NOT NULL", (now,))
            connection.execute("DELETE FROM password_reset_tokens WHERE expires_at < ? OR used_at IS NOT NULL", (now,))
            connection.execute("DELETE FROM sessions WHERE expires_at < ? OR revoked_at IS NOT NULL", (now,))

    def register(self, email: str, password: str, app_base_url: str) -> dict[str, object]:
        normalized_email = self._normalize_email(email)
        password_hash = self._hash_password(password)
        now = _utcnow()
        existing_user = self._get_user_row_by_email(normalized_email)

        with self._connect() as connection:
            if existing_user:
                user_id = existing_user["id"]
                connection.execute(
                    """
                    UPDATE users
                    SET password_hash = ?, is_verified = 0, updated_at = ?
                    WHERE id = ?
                    """,
                    (password_hash, _to_iso(now), user_id),
                )
            else:
                user_id = str(uuid.uuid4())
                connection.execute(
                    """
                    INSERT INTO users (id, email, password_hash, is_verified, created_at, updated_at)
                    VALUES (?, ?, ?, 0, ?, ?)
                    """,
                    (user_id, normalized_email, password_hash, _to_iso(now), _to_iso(now)),
                )

            connection.execute(
                "DELETE FROM email_verification_tokens WHERE user_id = ? AND used_at IS NULL",
                (user_id,),
            )
            raw_token, token_hash, expires_at = self._mint_token(self.verify_ttl_seconds)
            connection.execute(
                """
                INSERT INTO email_verification_tokens (id, user_id, token_hash, created_at, expires_at, used_at)
                VALUES (?, ?, ?, ?, ?, NULL)
                """,
                (str(uuid.uuid4()), user_id, token_hash, _to_iso(now), _to_iso(expires_at)),
            )

        logger.info("auth.register_success email=%s", normalized_email)
        return {
            "email": normalized_email,
            "verification_required": True,
            "verification_expires_at": _to_iso(expires_at),
            "verification_preview_url": self._preview_url(app_base_url, "verify-email", raw_token),
        }

    def verify_email(self, token: str) -> Optional[AuthUser]:
        token_hash = self._hash_token(token)
        now = _utcnow()

        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT evt.id AS token_id, evt.expires_at, u.id AS user_id, u.email, u.created_at
                FROM email_verification_tokens evt
                JOIN users u ON u.id = evt.user_id
                WHERE evt.token_hash = ? AND evt.used_at IS NULL
                """,
                (token_hash,),
            ).fetchone()
            if not row or _from_iso(row["expires_at"]) < now:
                return None

            connection.execute(
                "UPDATE users SET is_verified = 1, updated_at = ? WHERE id = ?",
                (_to_iso(now), row["user_id"]),
            )
            connection.execute(
                "UPDATE email_verification_tokens SET used_at = ? WHERE id = ?",
                (_to_iso(now), row["token_id"]),
            )

        logger.info("auth.verify_success email=%s", row["email"])
        return AuthUser(
            id=row["user_id"],
            email=row["email"],
            is_verified=True,
            created_at=row["created_at"],
        )

    def login(self, email: str, password: str, ip_address: str, user_agent: str) -> SessionRecord:
        normalized_email = self._normalize_email(email)
        row = self._get_user_row_by_email(normalized_email)
        if not row or not self._verify_password(password, row["password_hash"]):
            logger.warning("auth.login_failed email=%s ip=%s", normalized_email, ip_address)
            raise ValueError("Invalid email or password.")

        user = self._row_to_user(row)
        if not user.is_verified:
            logger.warning("auth.login_blocked_unverified email=%s", normalized_email)
            raise PermissionError("Please verify your email address before signing in.")

        now = _utcnow()
        raw_token, token_hash, expires_at = self._mint_token(self.session_ttl_seconds)

        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, last_seen_at, ip_hash, user_agent, revoked_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
                """,
                (
                    str(uuid.uuid4()),
                    user.id,
                    token_hash,
                    _to_iso(now),
                    _to_iso(expires_at),
                    _to_iso(now),
                    self._hash_token(ip_address),
                    (user_agent or "")[:300],
                ),
            )

        logger.info("auth.login_success email=%s ip=%s", normalized_email, ip_address)
        return SessionRecord(token=raw_token, expires_at=_to_iso(expires_at), user=user)

    def get_session(self, token: str) -> Optional[SessionRecord]:
        if not token:
            return None
        now = _utcnow()
        token_hash = self._hash_token(token)

        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT s.id AS session_id, s.expires_at, u.id AS user_id, u.email, u.is_verified, u.created_at
                FROM sessions s
                JOIN users u ON u.id = s.user_id
                WHERE s.token_hash = ? AND s.revoked_at IS NULL
                """,
                (token_hash,),
            ).fetchone()
            if not row:
                return None
            if _from_iso(row["expires_at"]) < now:
                connection.execute("UPDATE sessions SET revoked_at = ? WHERE id = ?", (_to_iso(now), row["session_id"]))
                return None
            connection.execute("UPDATE sessions SET last_seen_at = ? WHERE id = ?", (_to_iso(now), row["session_id"]))

        return SessionRecord(
            token=token,
            expires_at=row["expires_at"],
            user=AuthUser(
                id=row["user_id"],
                email=row["email"],
                is_verified=bool(row["is_verified"]),
                created_at=row["created_at"],
            ),
        )

    def logout(self, token: str) -> None:
        if not token:
            return
        with self._connect() as connection:
            connection.execute(
                "UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL",
                (_to_iso(_utcnow()), self._hash_token(token)),
            )

    def request_password_reset(self, email: str, app_base_url: str) -> dict[str, object]:
        normalized_email = self._normalize_email(email)
        user = self.get_user_by_email(normalized_email)
        if not user or not user.is_verified:
            logger.info("auth.reset_requested email=%s action=ignored", normalized_email)
            return {"email": normalized_email, "sent": True, "reset_preview_url": None, "reset_expires_at": None}

        now = _utcnow()
        raw_token, token_hash, expires_at = self._mint_token(self.reset_ttl_seconds)
        with self._connect() as connection:
            connection.execute(
                "DELETE FROM password_reset_tokens WHERE user_id = ? AND used_at IS NULL",
                (user.id,),
            )
            connection.execute(
                """
                INSERT INTO password_reset_tokens (id, user_id, token_hash, created_at, expires_at, used_at)
                VALUES (?, ?, ?, ?, ?, NULL)
                """,
                (str(uuid.uuid4()), user.id, token_hash, _to_iso(now), _to_iso(expires_at)),
            )

        logger.info("auth.reset_requested email=%s action=created", normalized_email)
        return {
            "email": normalized_email,
            "sent": True,
            "reset_preview_url": self._preview_url(app_base_url, "reset-password", raw_token),
            "reset_expires_at": _to_iso(expires_at),
        }

    def reset_password(self, token: str, new_password: str) -> bool:
        token_hash = self._hash_token(token)
        now = _utcnow()
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT id, user_id, expires_at
                FROM password_reset_tokens
                WHERE token_hash = ? AND used_at IS NULL
                """,
                (token_hash,),
            ).fetchone()
            if not row or _from_iso(row["expires_at"]) < now:
                return False

            connection.execute(
                "UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?",
                (self._hash_password(new_password), _to_iso(now), row["user_id"]),
            )
            connection.execute(
                "UPDATE password_reset_tokens SET used_at = ? WHERE id = ?",
                (_to_iso(now), row["id"]),
            )
            connection.execute(
                "UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL",
                (_to_iso(now), row["user_id"]),
            )

        logger.info("auth.reset_complete user_id=%s", row["user_id"])
        return True

    def get_user_by_email(self, email: str) -> Optional[AuthUser]:
        row = self._get_user_row_by_email(email)
        return self._row_to_user(row) if row else None

    def _preview_url(self, app_base_url: str, action: str, token: str) -> Optional[str]:
        if not self.preview_links_enabled:
            return None
        return f"{app_base_url.rstrip('/')}/auth/{action}?token={token}"

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.db_path, timeout=10, check_same_thread=False)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        return connection

    def _get_user_row_by_email(self, email: str):
        with self._connect() as connection:
            return connection.execute(
                "SELECT id, email, password_hash, is_verified, created_at FROM users WHERE email = ?",
                (self._normalize_email(email),),
            ).fetchone()

    def _row_to_user(self, row) -> AuthUser:
        return AuthUser(
            id=row["id"],
            email=row["email"],
            is_verified=bool(row["is_verified"]),
            created_at=row["created_at"],
        )

    def _normalize_email(self, email: str) -> str:
        normalized = (email or "").strip().lower()
        if "@" not in normalized or "." not in normalized.split("@")[-1]:
            raise ValueError("Please enter a valid email address.")
        if len(normalized) > 254:
            raise ValueError("Email address is too long.")
        return normalized

    def _hash_password(self, password: str) -> str:
        if len(password) < 12:
            raise ValueError("Password must be at least 12 characters long.")
        salt = secrets.token_bytes(16)
        digest = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1, dklen=64)
        return "$".join(
            [
                "scrypt",
                "16384",
                "8",
                "1",
                base64.urlsafe_b64encode(salt).decode("ascii"),
                base64.urlsafe_b64encode(digest).decode("ascii"),
            ]
        )

    def _verify_password(self, password: str, stored: str) -> bool:
        try:
            algorithm, n_value, r_value, p_value, salt_b64, digest_b64 = stored.split("$", 5)
            if algorithm != "scrypt":
                return False
            salt = base64.urlsafe_b64decode(salt_b64.encode("ascii"))
            expected = base64.urlsafe_b64decode(digest_b64.encode("ascii"))
            candidate = hashlib.scrypt(
                password.encode("utf-8"),
                salt=salt,
                n=int(n_value),
                r=int(r_value),
                p=int(p_value),
                dklen=len(expected),
            )
            return hmac.compare_digest(candidate, expected)
        except (ValueError, TypeError):
            return False

    def _mint_token(self, ttl_seconds: int) -> tuple[str, str, datetime]:
        raw = secrets.token_urlsafe(32)
        return raw, self._hash_token(raw), _utcnow() + timedelta(seconds=ttl_seconds)

    def _hash_token(self, value: str) -> str:
        return hashlib.sha256(value.encode("utf-8")).hexdigest()
