from __future__ import annotations

import re
from typing import Optional

from pydantic import BaseModel, Field, field_validator


def _clean_text(value: str, max_length: int) -> str:
    cleaned = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", (value or "")).strip()
    if len(cleaned) > max_length:
        raise ValueError(f"Value must be {max_length} characters or fewer.")
    return cleaned


class RegisterRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=254)
    password: str = Field(..., min_length=12, max_length=128)

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        return _clean_text(value.lower(), 254)


class LoginRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=254)
    password: str = Field(..., min_length=12, max_length=128)

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        return _clean_text(value.lower(), 254)


class PasswordResetRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=254)

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        return _clean_text(value.lower(), 254)


class PasswordResetConfirmRequest(BaseModel):
    token: str = Field(..., min_length=16, max_length=256)
    new_password: str = Field(..., min_length=12, max_length=128)

    @field_validator("token")
    @classmethod
    def validate_token(cls, value: str) -> str:
        return _clean_text(value, 256)


class AuthUserResponse(BaseModel):
    id: str
    email: str
    is_verified: bool
    session_expires_at: Optional[str] = None


class RegisterResponse(BaseModel):
    email: str
    verification_required: bool = True
    verification_expires_at: str
    verification_preview_url: Optional[str] = None


class AuthMessageResponse(BaseModel):
    message: str
    reset_preview_url: Optional[str] = None
