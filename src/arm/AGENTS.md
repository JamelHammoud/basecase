# src/arm/

Size Arm to Targets: the ⌘K and right-click command and the agent's `size_arm` size a servo arm from the points it must reach and the payload it carries (`src/utils/armSizing.ts`, in a worker), then place its skeleton, servos and `arm_template` links in one undo step. Before editing here, read:

- [Joints and motion](../../docs/guide/joints-and-motion.md) (§8c), the Size an arm bullet
- [Build](../../docs/guide/build.md) (§8b), for how servos are picked
- [Agent](../../docs/guide/agent.md) (§9)

The rules in the root [AGENTS.md](../../AGENTS.md) apply here too. When you change how this area works, update its guide in the same change.
