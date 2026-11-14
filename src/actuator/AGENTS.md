# src/actuator/

Make an Actuator: the Servo torque Fix, the ⌘K command and the agent's `make_actuator` replace a joint's servo with a printed cycloidal reducer (`cycloidal_drive` in `vendor/robotics/mechanisms.scad`) around a catalog BLDC motor. `pickActuator.ts` sizes it from the joint's loads and the bed, `actuatorBuild.ts` places it in one undo step, and `generated.ts` gives the motor part a version whose spec `actuatorOf` reads. Before editing here, read:

- [Parts catalog](../../docs/guide/parts-catalog.md) (§8a), Generated actuators
- [Build](../../docs/guide/build.md) (§8b), Servo torque and its Fix
- [Simulate and train](../../docs/guide/simulate.md) (§8d), armature
- [Agent](../../docs/guide/agent.md) (§9), `make_actuator` and the recipes

The rules in the root [AGENTS.md](../../AGENTS.md) apply here too. When you change how this area works, update its guide in the same change.
