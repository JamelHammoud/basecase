# src/motion/

Design From Motion: ⌘K, the Import ⟨name⟩ sheet on a scene with no joints, and the agent's `skeleton_from_motion` fit a skeleton with the fewest joints that replay a BVH clip and a servo per joint (`src/utils/motionSkeleton.ts`, in a worker), then place them in one undo step. Before editing here, read:

- [Joints and motion](../../docs/guide/joints-and-motion.md) (§8c), the Design from motion bullet
- [Build](../../docs/guide/build.md) (§8b), for how servos are picked
- [Agent](../../docs/guide/agent.md) (§9)

The rules in the root [AGENTS.md](../../AGENTS.md) apply here too. When you change how this area works, update its guide in the same change.
