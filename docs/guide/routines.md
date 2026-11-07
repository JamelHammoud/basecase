# Routines

Part of the Basecase guide. [AGENTS.md](../../AGENTS.md) holds the rules every change follows and the index of these files; section numbers (§) are shared across them.

## 8j. Routines

A Routine is an inspectable flowchart that runs as one background skill plus prioritised reactions. It lives in `src/routines/`, and its coordinator in `hw/coordinator/`.

- **The graph is the truth.** Sentences are an entry point, and plain English is generated back from the graph.
- **The motor loop never depends on a Routine.** Control reads one atomic slot, so a hung model or LLM can't stall motors.
- **Sim runs the code the robot runs.** One coordinator crate builds natively and to WASM.
