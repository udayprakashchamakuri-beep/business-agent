# Autonomous AI Enterprise Simulator

Production-style multi-agent system that simulates a 10-executive boardroom, runs a three-round debate, stores shared and agent-specific memory, highlights contradictions, and issues a final `GO`, `MODIFY`, or `NO GO` decision.

## Structure

```text
iith/
  backend/
    main.py
    controller/
    agents/
    memory/
    debate_engine/
  frontend/
    src/
```

## Backend

- `backend/main.py`: FastAPI entrypoint with `/analyze`
- `backend/controller/orchestrator.py`: central controller
- `backend/controller/decision_engine.py`: weighted executive decision engine
- `backend/agents/`: agent definitions, prompts, roster, and reasoning
- `backend/memory/manager.py`: global history, round summaries, agent memory
- `backend/debate_engine/`: three-round debate loop and conflict detection

## Frontend

- React + Vite control room UI
- business brief input panel
- live debate feed
- contradiction panel
- decision panel with confidence and actions

## Run

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

The frontend expects the backend at `http://localhost:8000`.
