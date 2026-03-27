# Autonomous AI Enterprise Simulator

Production-style multi-agent system that simulates a 10-executive boardroom, runs a three-round debate, stores shared and persistent memory, highlights contradictions, generates an action plan, replays what-if scenarios, and issues a final `GO`, `MODIFY`, or `NO GO` decision.

## What This System Does

- Runs exactly 10 specialized agents:
  - CEO
  - Startup Builder
  - Market Research
  - Finance
  - Marketing
  - Pricing
  - Supply Chain
  - Hiring
  - Risk
  - Sales Strategy
- Maintains:
  - global conversation history
  - round summaries
  - agent-specific memory
  - persistent simulation history across runs
- Produces:
  - final decision
  - explainability report
  - execution plan
  - marketing strategy
  - financial plan
  - hiring plan
  - what-if scenario comparison
  - validation check
- Streams debate updates agent by agent and round by round

## Structure

```text
iith/
  backend/
    main.py
    controller/
    agents/
    memory/
    debate_engine/
    services/
  frontend/
    src/
  .github/workflows/
```

## Backend Endpoints

- `GET /health`
- `POST /analyze`
- `POST /analyze/stream`

`/analyze/stream` returns newline-delimited JSON events so the React UI can update in real time.

## External Providers

The simulator now supports two optional external providers:

- `Featherless AI`
  - Used for optional boardroom-language enhancement in agent turns
  - Expected as an OpenAI-compatible endpoint via `https://api.featherless.ai/v1`
- `Bright Data`
  - Used for optional external market-grounding snippets
  - Integrated through an environment-configured API endpoint so you can point it at your Bright Data AI / web-access setup

Create `backend/.env` from `backend/.env.example` and set:

```env
FEATHERLESS_API_KEY=your_featherless_key
FEATHERLESS_MODEL=your_featherless_model
FEATHERLESS_BASE_URL=https://api.featherless.ai/v1

BRIGHTDATA_API_KEY=your_brightdata_key
BRIGHTDATA_API_ENDPOINT=https://your-brightdata-endpoint

FRONTEND_ORIGIN=https://udayprakashchamakuri-beep.github.io
```

If those variables are not present, the simulator still works using the internal reasoning engine.

## Run Locally

Backend:

```bash
cd iith
python -m venv .venv
.venv\Scripts\activate
pip install -r backend/requirements.txt
uvicorn backend.main:app --reload
```

Frontend:

```bash
cd iith/frontend
npm install
npm run dev
```

The frontend expects the backend at `http://localhost:8000` unless `VITE_API_BASE_URL` is set.

## Deploy Like GitHub Pages

This project is split-deploy:

- Frontend: GitHub Pages
- Backend: a real API host such as Render, Railway, Fly.io, or any Docker-compatible service

Why: GitHub Pages is static hosting only. It can serve the React app, but it cannot run FastAPI.

### Frontend on GitHub Pages

A Pages workflow already exists:

- `.github/workflows/deploy-frontend.yml`

Set this GitHub repository variable before deploying:

- `VITE_API_BASE_URL`
  - Example: `https://your-backend-host.example.com`

The workflow builds the frontend with:

- `VITE_BASE_PATH=/business-agent/`

That makes the frontend compatible with:

- `https://udayprakashchamakuri-beep.github.io/business-agent/`

### Backend Hosting

A Dockerfile is included:

- `backend/Dockerfile`

You can deploy that backend to Render, Railway, Fly.io, or another container host, then point `VITE_API_BASE_URL` at that backend URL.

## Persistent Memory

Past simulations are stored in:

- `backend/memory/persistent_history.json`

That file is ignored by git, so production learning data is not committed back to the repo.

## Validation Goals

The system validates that it is:

- making decisions
- simulating multiple scenarios
- generating actions
- using memory

Those results appear in the final response under `validation`.
