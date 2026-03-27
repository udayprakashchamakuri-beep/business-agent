# Architecture

## Flow

```text
Business Problem
  -> FastAPI /analyze
  -> EnterpriseOrchestrator
  -> DebateEngine
      -> 10 specialized agents
      -> shared memory
      -> conflict detection
      -> round summary compression
  -> DecisionEngine
      -> weighted board synthesis
      -> CEO-style final decision
  -> API response
  -> React operations console
```

## Controller

- `EnterpriseOrchestrator` is the centralized controller.
- It creates fresh memory for each analysis request.
- It runs the three-round debate.
- It passes the full discussion into the final decision engine.

## Agent lifecycle

1. Receive the business problem and structured context.
2. Read global history, round summaries, and agent-specific memory.
3. Generate a domain-limited response with stance, confidence, references, and actions.
4. Write the turn into shared memory.
5. Repeat for three rounds.

## Communication model

- Global conversation history stores every turn.
- Round summaries compress debate state after each round.
- Agent memory stores prior topics so agents avoid repeating themselves.
- Conflict records capture direct stance or policy contradictions.

## Decision logic

- Each functional agent contributes a weighted final stance.
- Finance, Risk, and Supply Chain act as gating functions.
- The final output is `GO`, `MODIFY`, or `NO GO` with confidence, reasons, risks, and actions.
