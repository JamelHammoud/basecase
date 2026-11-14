---
title: Roll out a skill to a fleet of emulated robots
date: 2026-11-14
collection: operate
type: task
order: 4
keywords:
  - fleet
  - canary
  - canaries
  - deploy
  - rollout
  - roll back
  - several robots
  - many robots
  - units
  - twin
related:
  - connect-an-emulated-robot
  - calibrate-an-emulated-robot
covers:
  - src/components/operate/FleetRows.tsx
  - src/components/operate/RollOutDialog.tsx
  - src/components/simulate/SkillTwins.tsx
  - src/fleet/rollOut.ts
  - src/fleet/twinArena.ts
  - src/workspace/useFleetRollOut.ts
  - src/workspace/operateCommands.tsx
  - src/robot/robotStore.ts
  - electron/robot/robotFleet.mjs
---

Send a skill to several emulated robots, after Arena proves it on each robot's calibrated twin.

A fleet holds up to 32 robots in the desktop app. Roll Out sends saved network policies to emulated Feetech and Dynamixel units.

## Connect and calibrate the units

1. In the view rail, click **Play**.
2. At the top of the left panel, click **Operate**.
3. Click **Connect Emulated Robot**. The first robot is named robot.
4. Press [[⌘K]] and choose **Connect Emulated Robot** for each robot you add. They're named robot-2, robot-3 and so on.
5. In Operate, click a robot's row. Its readings, calibration history and measured pose appear.
6. In the **Ladder**, click **Set Up**.
7. In the **Ladder**, click **Test**.
8. Click **Calibrate Servos**. Repeat steps 5 through 8 for each robot.

![Operate with three named robots connected in Test](/help/roll-out-a-skill-to-a-fleet/connected.png)

## Roll out the skill

1. At the top of the right panel, click **Simulate**.
2. Under **Train**, right-click a ready skill and choose **Roll Out**.
3. In the dialog, switch on the robots that should receive the skill first.

![The Roll Out Reach dialog with robot selected as a canary](/help/roll-out-a-skill-to-a-fleet/canaries.png)

4. Click **Roll Out**.

![Operate with two robots at Rehearse and robot-3 held back because its shoulder sags](/help/roll-out-a-skill-to-a-fleet/fleet.png)

Arena runs on every robot's twin first, one at a time. A robot whose twin fails keeps its version and shows the failing contract line. Each passing canary receives the skill and climbs to **Rehearse** before the remaining passing robots receive it.

The dialog starts with one canary in a fleet of three or fewer, or two in a larger fleet, chosen by name. If a canary fails to receive the policy or climb, the remaining wave stops. Each affected row shows the reason.

The skill's row shows each robot's pass count and any failing contract line.

![The Reach skill row with each robot's Arena passes and robot-3's Shoulder sags result](/help/roll-out-a-skill-to-a-fleet/twins.png)

To restore a robot's previous version, hover its Operate row and click **Roll Back**. The previous policy stays pinned even when the scene's newest policy changes.

![Robot-2 returned to its previous policy while robot retains the rolled out version](/help/roll-out-a-skill-to-a-fleet/rollback.png)

You can also press [[⌘K]] and choose **Roll Out** followed by the skill's name, or **Roll Back** followed by the robot's name. The agent uses `roll_out` and `roll_back` for the same actions.
