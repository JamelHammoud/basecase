# src/joints/

Declaring joints: the one module the agent's `define_joints` and Add Hinge / Add Slider both go through, and the axis finder that fits a cylinder to a round face. Before editing here, read:

- [Joints and motion](../../docs/guide/joints-and-motion.md) (§8c)
- [Performance](../../docs/guide/performance.md) (§0f): the finder runs in the analysis worker, never on the main thread

The rules in the root [AGENTS.md](../../AGENTS.md) apply here too. When you change how this area works, update its guide in the same change.
