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

Tip a legged robot over in the simulation from 12 directions, and see which servos a fall would push past their gears' limit.

The test holds the robot in the pose you modeled, so pose it the way it stands before you start.

1. Open the robot's scene, and pose its legs the way it stands.
2. In the agent panel, ask the agent to verify the design with falls.
3. Click the **Build** tab.
4. In **Checks**, click **Falls**.

![Falls open in Checks, with the right and left knees at 10.4× rated and Replay in Sim beside each](/help/check-what-a-fall-does-to-the-servos/falls.png)

5. Click **Replay in Sim** on a joint to watch its worst fall.

![Simulate after the replay, the biped on its side and Right knee at its limit in Results](/help/check-what-a-fall-does-to-the-servos/replay.png)

Each joint reads as a multiple of its servo's rated torque, with the direction its worst fall went. Up to 3× passes and up to 5× is amber. Above 5× is red and blocks Ready to build. Those limits follow the SafeFall paper's rule of thumb: servo gears survive about 3 to 5 times their rated torque for a moment. The numbers are estimates.

Where a datasheet gives a peak torque, as many quasi-direct-drive actuators do, the joint fails above that peak instead. A servo with no rated torque in its datasheet is rated at a quarter of its stall torque.

Robots with no leg joints don't get the check. A robot that doesn't tip over from any side reads Not run. The result stays until you change the parts, the joints or the pose.

For a red joint, ask the agent for a stronger servo there, or lower the robot's stance and run the check again. [Servo torque and sizing](/help/servo-torque-and-sizing) explains stall and rated torque.
