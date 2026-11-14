# src/actuators/

Generated actuators: Make an Actuator sizes a printed cycloidal reducer (the `cycloidal_drive` recipe in `vendor/robotics/mechanisms.scad`) around a catalog BLDC motor to a joint's loads and the bed, and places it on the joint in place of its servo. The spec is a generated version of the motor (`src/data/generatedActuators.ts`). Before editing here, read:

- [Parts catalog](../../docs/guide/parts-catalog.md) (§8a), the Generated actuators bullet
- [Build](../../docs/guide/build.md) (§8b), Servo torque and Range of motion
- [Simulate and train](../../docs/guide/simulate.md) (§8d), Estimated servos
- [Agent](../../docs/guide/agent.md) (§9), Recipes

The rules in the root [AGENTS.md](../../AGENTS.md) apply here too. When you change how this area works, update its guide in the same change.
