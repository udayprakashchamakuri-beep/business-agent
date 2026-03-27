from __future__ import annotations

import json
import logging
import os
import uuid
from queue import Queue
from threading import Thread

from fastapi import Depends, FastAPI, HTTPException, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

from backend.config.env import load_local_env
from backend.controller.orchestrator import EnterpriseOrchestrator
from backend.controller.schemas import AnalyzeRequest, AnalyzeResponse
from backend.security import AuthService, AuthUser, RateLimiter
from backend.security.schemas import (
    AuthMessageResponse,
    AuthUserResponse,
    LoginRequest,
    PasswordResetConfirmRequest,
    PasswordResetRequest,
    RegisterRequest,
    RegisterResponse,
)

load_local_env()

logging.basicConfig(
    level=getattr(logging, os.getenv("LOG_LEVEL", "INFO").upper(), logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("business_agent.api")

app = FastAPI(
    title="Autonomous AI Enterprise Simulator",
    version="1.1.0",
    description="A secured multi-agent enterprise simulator with authenticated analysis workflows.",
)

frontend_origins = {
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://udayprakashchamakuri-beep.github.io",
}
extra_origin = os.getenv("FRONTEND_ORIGIN")
if extra_origin:
    frontend_origins.add(extra_origin.rstrip("/"))

allowed_hosts = [host.strip() for host in os.getenv("ALLOWED_HOSTS", "localhost,127.0.0.1,*.vercel.app").split(",") if host.strip()]
app.add_middleware(TrustedHostMiddleware, allowed_hosts=allowed_hosts or ["*"])
app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(frontend_origins),
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "X-Requested-With"],
)

auth_service = AuthService()
rate_limiter = RateLimiter()
orchestrator = EnterpriseOrchestrator()


@app.on_event("startup")
def startup() -> None:
    auth_service.initialize()
    auth_service.cleanup_expired()
    logger.info("startup.complete")


@app.middleware("http")
async def security_middleware(request: Request, call_next):
    request_id = str(uuid.uuid4())
    request.state.request_id = request_id
    auth_service.cleanup_expired()

    if _force_https_enabled() and not _is_request_secure(request):
        logger.warning("security.insecure_transport path=%s request_id=%s", request.url.path, request_id)
        return JSONResponse(status_code=status.HTTP_400_BAD_REQUEST, content={"detail": "HTTPS is required."})

    try:
        response = await call_next(request)
    except Exception as exc:  # pragma: no cover - defensive logging
        logger.exception("api.unhandled_error path=%s request_id=%s error=%s", request.url.path, request_id, exc)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"detail": "Internal server error.", "request_id": request_id},
        )

    response.headers["X-Request-ID"] = request_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "same-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
    response.headers["Cache-Control"] = "no-store"
    if _is_request_secure(request):
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"

    if response.status_code >= 500:
        logger.error("api.server_error path=%s status=%s request_id=%s", request.url.path, response.status_code, request_id)
    elif response.status_code == 429:
        logger.warning("security.rate_limited path=%s request_id=%s", request.url.path, request_id)
    return response


def _force_https_enabled() -> bool:
    return os.getenv("FORCE_HTTPS", "true").lower() == "true"


def _is_request_secure(request: Request) -> bool:
    host = request.headers.get("host", "")
    if host.startswith("localhost") or host.startswith("127.0.0.1"):
        return True
    forwarded_proto = request.headers.get("x-forwarded-proto", "")
    return request.url.scheme == "https" or forwarded_proto == "https"


def _client_ip(request: Request) -> str:
    forwarded_for = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
    return forwarded_for or (request.client.host if request.client else "unknown")


def _check_origin(request: Request) -> None:
    origin = request.headers.get("origin")
    if origin and origin.rstrip("/") not in frontend_origins:
        logger.warning("security.origin_blocked origin=%s path=%s", origin, request.url.path)
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Origin not allowed.")


def _enforce_rate_limit(request: Request, scope: str, limit: int, window_seconds: int, subject: str | None = None) -> None:
    identifier = subject or _client_ip(request)
    result = rate_limiter.check(f"{scope}:{identifier}", limit=limit, window_seconds=window_seconds)
    if not result.allowed:
        logger.warning("security.rate_limit scope=%s subject=%s retry_after=%s", scope, identifier, result.retry_after_seconds)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests. Please wait and try again.",
            headers={"Retry-After": str(result.retry_after_seconds)},
        )


def _set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=auth_service.cookie_name,
        value=token,
        httponly=True,
        secure=True,
        samesite="none",
        max_age=auth_service.session_ttl_seconds,
        path="/",
    )


def _clear_session_cookie(response: Response) -> None:
    response.delete_cookie(key=auth_service.cookie_name, path="/", secure=True, httponly=True, samesite="none")


def _current_user(request: Request) -> AuthUser:
    token = request.cookies.get(auth_service.cookie_name, "")
    session = auth_service.get_session(token)
    if not session:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Please sign in to continue.")
    request.state.auth_user = session.user
    return session.user


@app.get("/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/auth/session", response_model=AuthUserResponse)
def get_session(request: Request, user: AuthUser = Depends(_current_user)) -> AuthUserResponse:
    session = auth_service.get_session(request.cookies.get(auth_service.cookie_name, ""))
    return AuthUserResponse(
        id=user.id,
        email=user.email,
        is_verified=user.is_verified,
        session_expires_at=session.expires_at if session else None,
    )


@app.post("/auth/register", response_model=RegisterResponse)
def register(request: Request, payload: RegisterRequest) -> RegisterResponse:
    _check_origin(request)
    _enforce_rate_limit(request, "register", limit=5, window_seconds=3600)
    result = auth_service.register(payload.email, payload.password, str(request.base_url).rstrip("/"))
    return RegisterResponse(**result)


@app.get("/auth/verify-email", response_model=AuthMessageResponse)
def verify_email(token: str) -> AuthMessageResponse:
    if len(token) > 256:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid verification token.")
    user = auth_service.verify_email(token)
    if not user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Verification link is invalid or expired.")
    return AuthMessageResponse(message=f"Email verified for {user.email}. You can now sign in.")


@app.post("/auth/login", response_model=AuthUserResponse)
def login(request: Request, response: Response, payload: LoginRequest) -> AuthUserResponse:
    _check_origin(request)
    _enforce_rate_limit(request, "login-ip", limit=10, window_seconds=900)
    _enforce_rate_limit(request, "login-email", limit=8, window_seconds=900, subject=payload.email.lower())
    try:
        session = auth_service.login(payload.email, payload.password, _client_ip(request), request.headers.get("user-agent", ""))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc

    _set_session_cookie(response, session.token)
    return AuthUserResponse(
        id=session.user.id,
        email=session.user.email,
        is_verified=session.user.is_verified,
        session_expires_at=session.expires_at,
    )


@app.post("/auth/logout", response_model=AuthMessageResponse)
def logout(request: Request, response: Response, user: AuthUser = Depends(_current_user)) -> AuthMessageResponse:
    _check_origin(request)
    auth_service.logout(request.cookies.get(auth_service.cookie_name, ""))
    _clear_session_cookie(response)
    logger.info("auth.logout email=%s", user.email)
    return AuthMessageResponse(message="Signed out.")


@app.post("/auth/request-password-reset", response_model=AuthMessageResponse)
def request_password_reset(request: Request, payload: PasswordResetRequest) -> AuthMessageResponse:
    _check_origin(request)
    _enforce_rate_limit(request, "password-reset", limit=5, window_seconds=3600)
    result = auth_service.request_password_reset(payload.email, str(request.base_url).rstrip("/"))
    return AuthMessageResponse(
        message="If that account exists, a password reset link has been created.",
        reset_preview_url=result.get("reset_preview_url"),
    )


@app.post("/auth/reset-password", response_model=AuthMessageResponse)
def reset_password(request: Request, payload: PasswordResetConfirmRequest) -> AuthMessageResponse:
    _check_origin(request)
    _enforce_rate_limit(request, "password-reset-confirm", limit=10, window_seconds=3600)
    if not auth_service.reset_password(payload.token, payload.new_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Reset token is invalid or expired.")
    return AuthMessageResponse(message="Password updated. You can now sign in.")


@app.post("/analyze", response_model=AnalyzeResponse)
def analyze(request: Request, payload: AnalyzeRequest, user: AuthUser = Depends(_current_user)) -> AnalyzeResponse:
    _check_origin(request)
    _enforce_rate_limit(request, "analyze-ip", limit=40, window_seconds=300)
    _enforce_rate_limit(request, "analyze-user", limit=20, window_seconds=300, subject=user.id)
    return orchestrator.analyze(payload, user_id=user.id)


@app.post("/analyze/stream")
def analyze_stream(request: Request, payload: AnalyzeRequest, user: AuthUser = Depends(_current_user)) -> StreamingResponse:
    _check_origin(request)
    _enforce_rate_limit(request, "analyze-stream-ip", limit=30, window_seconds=300)
    _enforce_rate_limit(request, "analyze-stream-user", limit=12, window_seconds=300, subject=user.id)

    def event_stream():
        queue: Queue[dict[str, object] | None] = Queue()

        def emit(payload_chunk: dict[str, object]) -> None:
            queue.put(payload_chunk)

        def run_analysis() -> None:
            try:
                orchestrator.stream_analyze(payload, user_id=user.id, event_handler=emit)
            except Exception as exc:  # pragma: no cover - surfaced to stream clients
                logger.exception("api.stream_error user_id=%s error=%s", user.id, exc)
                queue.put({"type": "error", "error": "Unable to complete the analysis right now."})
            finally:
                queue.put(None)

        Thread(target=run_analysis, daemon=True).start()

        while True:
            payload_line = queue.get()
            if payload_line is None:
                break
            yield json.dumps(payload_line) + "\n"

    return StreamingResponse(event_stream(), media_type="application/x-ndjson")
