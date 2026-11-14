---
title: Check what a fall does to the servos
date: 2026-11-13
collection: engineer
type: task
order: 4
keywords:
  - fall
  - falls
  - stripped gears
  - impact
  - knee
  - servo damage
  - rated torque
  - safefall
related:
  - servo-torque-and-sizing
  - build-checks
covers:
  - src/utils/engineeringFalls.ts
  - src/agent/agentFalls.ts
  - src/sim/fallRuns.ts
  - src/workspace/fallReplay.ts
---

You can tip a legged robot over in the simulation from 12 directions and see which servos a fall would push past the limit of their gears. The test holds the robot in the pose you modeled.

1. Open the robot's scene, then pose its legs the way it stands.
2. In the agent panel, ask the agent to verify the design with falls.
3. Click the **Build** tab.
4. In **Checks**, click **Falls**.

![Falls open in Checks, with the right and left knees at 10.4× rated and Replay in Sim beside each](/help/check-what-a-fall-does-to-the-servos/falls.png)

5. To watch the worst fall for a joint, click **Replay in Sim** on that joint.

![Simulate after the replay, the biped on its side and Right knee at its limit in Results](/help/check-what-a-fall-does-to-the-servos/replay.png)

Each joint shows an estimate of the load on its servo, as a multiple of the servo's rated torque, along with the direction of its worst fall. Up to 3× passes, and up to 5× is amber. Anything above 5× is red and blocks Ready to build. These limits come from a rule of thumb in the SafeFall paper: servo gears survive about 3 to 5 times their rated torque for a moment.

If a datasheet gives a peak torque, as many quasi-direct-drive actuators do, the joint fails above that peak instead. If a servo's datasheet doesn't list a rated torque, the check uses a quarter of its stall torque.

Robots with no leg joints don't get this check. If a robot doesn't tip over from any side, the check reads Not run. The result stays until you change the parts, the joints or the pose.

If a joint is red, ask the agent for a stronger servo at that joint, or lower the robot's stance. Then run the check again. To learn about stall and rated torque, see [Servo torque and sizing](/help/servo-torque-and-sizing).
