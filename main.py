from contextlib import asynccontextmanager
import asyncio
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi import WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

from agents.multi_agent import run_agents
from services.agent_event_service import get_agent_events
from services.assistant_service import answer_dashboard_question
from services.autonomous_service import get_autonomous_history, run_autonomous_cycle
from services.autonomous_runner_service import (
    get_autonomous_runner_status,
    start_autonomous_runner,
    stop_autonomous_runner,
)
from services.backtest_service import get_backtest_summary
from services.history_service import get_trade_history
from services.journal_service import get_journal
from services.market_service import (
    DEFAULT_SYMBOL,
    get_fake_order_book,
    get_fake_trade_feed,
    get_latest_btc_price,
    get_latest_market_price,
    get_market_stats,
    get_markets_overview,
    get_market_series,
)
from services.news_service import get_mock_news
from services.pnl_service import get_pnl
from services.positions_service import get_open_position
from services.portfolio_service import add_balance, get_portfolio, initialize_portfolio_defaults, withdraw_balance
from services.realtime_service import build_dashboard_snapshot
from services.settings_service import get_settings, initialize_settings, update_settings
from services.trade_service import execute_trade
from utils.config import APP_NAME, CORS_ORIGINS
from utils.logger import get_logger, setup_logging

logger = get_logger(__name__)
CLIENT_DIST_DIR = Path("client/dist")
CLIENT_ASSETS_DIR = CLIENT_DIST_DIR / "assets"


@asynccontextmanager
async def lifespan(_: FastAPI):
    setup_logging()
    logger.info("Starting application")
    initialize_portfolio_defaults()
    initialize_settings()
    yield
    logger.info("Shutting down application")


app = FastAPI(title=APP_NAME, version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS if CORS_ORIGINS != ["*"] else ["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/static", StaticFiles(directory="frontend"), name="static")
if CLIENT_ASSETS_DIR.exists():
    app.mount("/app/assets", StaticFiles(directory=str(CLIENT_ASSETS_DIR)), name="client-assets")


class TradeRequest(BaseModel):
    action: str = Field(..., pattern="^(BUY|SELL)$")
    symbol: str = Field(DEFAULT_SYMBOL)


class AutonomousStartRequest(BaseModel):
    duration_minutes: int = Field(..., ge=1, le=720)
    interval_seconds: int = Field(2, ge=1, le=300)
    symbol: str = Field(DEFAULT_SYMBOL)


class BalanceTopUpRequest(BaseModel):
    amount: float = Field(..., gt=0, le=1_000_000)
    payment_method: str = Field("FAKE_CARD")


class SettingsUpdateRequest(BaseModel):
    risk_level: str = Field(..., pattern="^(LOW|MEDIUM|HIGH)$")
    trade_size_btc: float = Field(..., gt=0, le=1)
    max_position_btc: float = Field(..., gt=0, le=5)
    stop_loss_pct: float = Field(..., gt=0, le=100)
    take_profit_pct: float = Field(..., gt=0, le=100)
    auto_trade_enabled: bool = Field(...)
    max_trades_per_run: int = Field(..., ge=1, le=1000)


class AskRequest(BaseModel):
    question: str = Field(..., min_length=3, max_length=500)
    symbol: str = Field(DEFAULT_SYMBOL)


@app.get("/")
async def index() -> RedirectResponse:
    return RedirectResponse(url="/app")


def _serve_react_app() -> FileResponse | HTMLResponse:
    index_file = CLIENT_DIST_DIR / "index.html"
    if index_file.exists():
        return FileResponse(str(index_file))
    return HTMLResponse(
        "<h2>React app not built yet.</h2><p>Run <code>cd client && npm install && npm run build</code>, then open <code>/app</code>.</p>",
        status_code=503,
    )


@app.get("/app")
async def react_app_root():
    return _serve_react_app()


@app.get("/app/{full_path:path}")
async def react_app_routes(full_path: str):
    asset_path = CLIENT_DIST_DIR / full_path
    if asset_path.exists() and asset_path.is_file():
        return FileResponse(str(asset_path))
    return _serve_react_app()


@app.get("/terminal/{symbol_slug}")
async def terminal(symbol_slug: str) -> FileResponse:
    return FileResponse("frontend/terminal.html")


@app.get("/journal-page")
async def journal_page() -> FileResponse:
    return FileResponse("frontend/journal.html")


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@app.get("/market")
async def market(symbol: str = "BTC/USDT") -> dict:
    price = get_latest_market_price(symbol)
    return {"symbol": symbol, "price": price}


@app.get("/markets")
async def markets() -> list[dict]:
    return get_markets_overview()


@app.get("/market-stats")
async def market_stats() -> dict:
    return get_market_stats()


@app.get("/market/series")
async def market_series(limit: int = 60, timeframe: str = "1h", symbol: str = "BTC/USDT") -> dict:
    return get_market_series(limit=limit, timeframe=timeframe, symbol=symbol)


@app.get("/market/order-book")
async def market_order_book(levels: int = 7, symbol: str = "BTC/USDT") -> dict:
    return get_fake_order_book(levels=levels, symbol=symbol)


@app.get("/market/trades")
async def market_trades(limit: int = 12, symbol: str = "BTC/USDT") -> dict:
    return get_fake_trade_feed(limit=limit, symbol=symbol)


@app.get("/news")
async def news() -> list[dict]:
    return get_mock_news()


@app.get("/portfolio")
async def portfolio() -> dict:
    return get_portfolio()


@app.get("/positions")
async def positions(symbol: str = DEFAULT_SYMBOL) -> dict:
    return {"position": get_open_position(symbol)}


@app.get("/settings")
async def settings() -> dict:
    return get_settings()


@app.post("/settings")
async def settings_update(payload: SettingsUpdateRequest) -> dict:
    return update_settings(payload.model_dump())


@app.post("/balance/add")
async def balance_add(payload: BalanceTopUpRequest) -> dict:
    try:
        return add_balance(payload.amount, payload.payment_method)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.post("/balance/withdraw")
async def balance_withdraw(payload: BalanceTopUpRequest) -> dict:
    try:
        return withdraw_balance(payload.amount)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.post("/trade")
async def trade(payload: TradeRequest) -> dict:
    return execute_trade(payload.action, symbol=payload.symbol)


@app.get("/history")
async def history(symbol: str | None = None) -> dict:
    return {"trades": get_trade_history(symbol)}


@app.get("/journal")
async def journal(limit: int = 100) -> dict:
    return {"entries": get_journal(limit=limit)}


@app.get("/pnl")
async def pnl() -> dict:
    return get_pnl()


@app.get("/backtest")
async def backtest(limit: int = 120, symbol: str = DEFAULT_SYMBOL, timeframe: str = "1h") -> dict:
    return get_backtest_summary(limit=limit, symbol=symbol, timeframe=timeframe)


@app.get("/agents")
async def agents(symbol: str = DEFAULT_SYMBOL) -> dict:
    return run_agents(symbol=symbol)


@app.get("/agent-events")
async def agent_events(limit: int = 25) -> dict:
    return {"events": get_agent_events(limit=limit)}


@app.post("/ask")
async def ask_agent(payload: AskRequest) -> dict:
    try:
        return answer_dashboard_question(payload.question, symbol=payload.symbol)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.websocket("/ws")
async def websocket_stream(websocket: WebSocket):
    await websocket.accept()
    symbol = websocket.query_params.get("symbol", DEFAULT_SYMBOL)
    timeframe = websocket.query_params.get("timeframe", "1m")
    last_alert_time = None
    tick_interval_seconds = 0.5
    try:
        while True:
            snapshot = await asyncio.to_thread(build_dashboard_snapshot, symbol=symbol, timeframe=timeframe)
            await websocket.send_json({"type": "snapshot", "data": snapshot})

            alerts = snapshot.get("alerts", {}).get("items", [])
            if last_alert_time is None and alerts:
                last_alert_time = alerts[0]["time"]
                alerts = []
            new_alerts = []
            for alert in reversed(alerts):
                if last_alert_time is None or alert["time"] > last_alert_time:
                    new_alerts.append(alert)
            for alert in new_alerts:
                await websocket.send_json({"type": "alert", "data": alert})
            if alerts:
                last_alert_time = alerts[0]["time"]

            loop_end_at = asyncio.get_running_loop().time() + tick_interval_seconds
            while True:
                remaining = loop_end_at - asyncio.get_running_loop().time()
                if remaining <= 0:
                    break
                try:
                    incoming = await asyncio.wait_for(websocket.receive_json(), timeout=min(remaining, 0.15))
                    if isinstance(incoming, dict):
                        symbol = incoming.get("symbol", symbol)
                        timeframe = incoming.get("timeframe", timeframe)
                except asyncio.TimeoutError:
                    continue
    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected")


@app.post("/autonomous/run")
async def autonomous_run() -> dict:
    return run_autonomous_cycle()


@app.get("/autonomous/history")
async def autonomous_history() -> dict:
    return {"cycles": get_autonomous_history()}


@app.post("/autonomous/start")
async def autonomous_start(payload: AutonomousStartRequest) -> dict:
    return start_autonomous_runner(
        duration_minutes=payload.duration_minutes,
        interval_seconds=payload.interval_seconds,
        symbol=payload.symbol,
    )


@app.post("/autonomous/stop")
async def autonomous_stop() -> dict:
    return stop_autonomous_runner()


@app.get("/autonomous/status")
async def autonomous_status() -> dict:
    return get_autonomous_runner_status()
