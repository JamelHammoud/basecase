# Skills

Part of the Basecase guide. [AGENTS.md](../../AGENTS.md) holds the rules every change follows and the index of these files; section numbers (§) are shared across them.

## 8i. Skills

Train any robot to do anything you ask. The pipeline is Intent Compiler, TaskContract, Feasibility Gate, Method Router, Solver Race, Arena, SkillCard.

- **The contract judges, the reward only teaches.** Reward authors can't edit a contract, so a hacked reward can't fake success.
- **A Skill is bound to what it was proved on:** contract hash, compiled-physics hash, actuator hash, observation and action schema, and Arena evidence.
- **Moving a Skill to another design warm-starts training and never carries "verified".**
