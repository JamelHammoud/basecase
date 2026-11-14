# src/fromMotion/

Design From Motion: the ⌘K command, the BVH sheet on a scene with no robot, and the agent's `skeleton_from_motion` fit the fewest joints that replay a motion clip (`src/utils/motionSkeleton.ts`, in a worker), pick a servo per joint, then place the skeleton and servos in one undo step. Before editing here, read:

- [Joints and motion](../../docs/guide/joints-and-motion.md) (§8c), the Design From Motion bullet
- [Build](../../docs/guide/build.md) (§8b), for how servos are picked
- [Agent](../../docs/guide/agent.md) (§9)

The rules in the root [AGENTS.md](../../AGENTS.md) apply here too. When you change how this area works, update its guide in the same change.
