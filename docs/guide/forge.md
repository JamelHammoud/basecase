# Forge

Part of the Basecase guide. [AGENTS.md](../../AGENTS.md) holds the rules every change follows and the index of these files; section numbers (§) are shared across them.

## 8g. Forge

Forge is Basecase's native trainer and batched physics, in `forge/`. It replaces Python for training, so nobody needs a terminal, uv or PyTorch to teach a robot.

- **C MuJoCo stays the compiler and oracle.** Forge links stock `libmujoco` to compile the generated MJCF and to check its own results. We never fork MuJoCo's C code. Forge's own engine is a reimplementation of MuJoCo's formulation for the subset Basecase generates.
- **Same events as the Python trainer.** Forge prints the same JSON lines on stdout, so `electron/trainer.mjs` barely changes.
- **Anything outside the subset routes to C MuJoCo, never silently.** The feature matrix refuses what it can't simulate exactly.
- **Speed claims use one number:** time-to-skill from `verify/`, not steps per second.
