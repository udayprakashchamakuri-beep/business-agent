# Crypto Backend

Simple FastAPI backend that:

- fetches BTC/USDT price using CCXT
- stores balance and position in Redis
- simulates basic buy/sell trades only, starting from $10,000
- runs a simple multi-agent decision system
- serves a production-friendly dashboard frontend

## Run

1. Install dependencies:

```bash
pip install -r requirements.txt
```

2. Start Redis locally.

3. Run the API:

```bash
uvicorn main:app --reload
```

4. Open the dashboard at:

```bash
http://127.0.0.1:8000/
```

## Endpoints

- `GET /health` returns service health
- `GET /market` returns the latest BTC/USDT price
- `GET /portfolio` returns balance and position from Redis
- `POST /trade` simulates a 0.01 BTC buy or sell
- `GET /history` returns the last 10 trades from Redis
- `GET /pnl` returns simulated profit and loss
- `GET /agents` returns technical, ML, risk, and final decision outputs
- `POST /autonomous/run` runs one autonomous agent cycle and can execute a simulated trade
- `GET /autonomous/history` returns recent autonomous cycles
- `GET /` serves the dashboard frontend

The technical agent uses real BTC/USDT OHLCV data from CCXT and calculates:
- RSI with pandas
- SMA(20) with pandas

## Environment

- `REDIS_URL` defaults to `redis://localhost:6379/0`
- `LLM_PROVIDER=auto|featherless|groq` controls which reasoning provider is preferred
- `FEATHERLESS_API_KEY` enables Featherless as the primary reasoning model provider
- `FEATHERLESS_MODEL` defaults to `Qwen/Qwen2.5-7B-Instruct`
- `GROQ_API_KEY` enables Groq-generated reasoning text for the agents
- `GROQ_MODEL` defaults to `llama-3.3-70b-versatile`
- `BRIGHTDATA_API_KEY` and `BRIGHTDATA_WEB_UNLOCKER_ZONE` enable Bright Data scraping for live news headlines
- `BRIGHTDATA_NEWS_URLS` controls which public crypto news sites are scraped
- `MARKET_CACHE_SECONDS` controls short-lived caching for market and indicator data
- `MARKET_EXCHANGES` controls fallback CCXT exchanges, for example `binance,kraken,coinbase,bitstamp`
- `LOG_LEVEL` controls application logging
- `CORS_ORIGINS` and `ALLOWED_HOSTS` can be tightened for deployment

If Featherless or Groq is unavailable or the API call fails, the app automatically falls back to local reasoning text.

## Production Notes

- API responses are gzip-compressed for larger payloads
- CCXT and Groq clients are reused instead of recreated on every request
- market data is cached briefly to reduce upstream calls and improve latency
- request timing is logged for easier debugging

## Docker

Build and run:

```bash
docker build -t crypto-dashboard .
docker run -p 8000:8000 --env-file .env.example crypto-dashboard
```
