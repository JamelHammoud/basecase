---
title: Get a robot ready to build
date: 2026-11-12
updated: 2026-11-13
collection: build-and-print
type: task
order: 1
popular: true
keywords:
  - build tab
  - checks
  - blockers
  - ready
  - fix
related:
  - from-design-to-build
  - build-checks
  - troubleshoot-build-check-blocks-ready-to-build
  - price-the-parts-and-set-a-budget
covers:
  - src/components/BuildPanel.tsx
  - src/components/build/ChecksSection.tsx
  - src/components/build/CheckItem.tsx
  - src/components/build/FindingRow.tsx
  - src/components/build/IgnoredChecks.tsx
  - src/components/build/CaseCheckItem.tsx
  - src/components/simulate/CaseSections.tsx
  - src/workspace/caseChecks.ts
  - src/components/build/TetherFields.tsx
  - src/workspace/RightPanelTabs.tsx
  - src/workspace/viewCommands.tsx
  - src/workspace/sceneCommands.tsx
  - src/components/settings/BuildPane.tsx
  - src/utils/engineeringPower.ts
  - src/utils/engineeringPayload.ts
  - src/three/viewport/checkDots.ts
---

Before you print, buy and put together a robot, clear every problem the Build tab finds.

1. Click **Build** at the top of the right panel.
2. Look at the header of **Checks**. It reads **Ready to build**, or tells you how many problems are left, such as **3 to fix**.
3. Click a check with a red mark to open it.
4. To select a part on the canvas, click its name under a problem.
5. Click **Fix** to hand the problem to the agent, or change the part yourself. On **Strength**, **Fix** prints the part on its strongest face instead. On **Falls**, **Replay in Sim** plays that joint's worst fall in the simulation.
6. If the robot runs on a power supply instead of a battery, open **Servo voltage** and type the supply's volts in **V**.
7. Open **Supply current** and type the power supply's amps in **A**.
8. Open **Current and runtime** to see how long the battery lasts, such as **about 2 h 08 min**. After the agent runs the trained walk policy in the simulator, this shows the average and peak amps from that walk, and the joint that draws the most. Until then, and after you change the design, the runtime shows **(estimate)**.
9. If the robot is an arm fixed in place, click **Payload** to see how much its hand holds at full reach and close in. While **Payload** is open, the canvas shows a dot everywhere the hand reaches. The dots are bluer where it lifts more.
10. If the scene has Cases, **Checks** lists each one under its own name, with how many of its 20 runs passed. Click a Case to open it in Simulate.
11. Wait for the header to read **Ready to build**. The checks run again on their own after every change.

![The Build tab with every check passed and a $150 budget beside the total](/help/get-a-robot-ready-to-build/build-tab.png)

![An SO-101 arm inside a cloud of dots, with Payload open in Checks reading 1.26 kg at full reach, 1.88 kg close in](/help/get-a-robot-ready-to-build/payload.png)

You can also find **Show Build** and **Run Checks** in [[⌘K]].

The settings for this tab are in **Settings** ▸ **Build**. To get there, press [[⌘,]] or choose **Build Settings** in [[⌘K]]. You can choose whether the agent fixes new blockers, which currency prices show in, and whether the build guide updates on its own.

![**Settings** ▸ **Build** with Checks, Prices and Build guide](/help/get-a-robot-ready-to-build/build-settings.png)

To set a problem aside, click ⋯ on its row and choose **Ignore**. To set aside every problem of that kind, choose **Ignore All ⟨kind⟩** below it, named after the kind of problem. **Ignored** lists every problem you set aside. Click **Restore** to bring one back.

## Cases in Checks

Each Case runs 20 times, and every run changes friction, weight, servo strength and servo delay a little. A box, or anything else that moves, starts up to 15 mm from where it was placed. A Case is green when it passes 18 of 20 runs or more, amber from 10 to 17, and red below 10. Its most common failure, such as Fell or Missed, shows under it.

Clicking a Case's row also draws each of its runs on the canvas, green for a pass and red for a failure. [Replay a failed run of a Case](/help/replay-a-failed-run-of-a-case) opens a red one on the timeline.

If a Case has a skill you kept with **Train from Tries**, it runs that skill instead of its scripted motion. See [Train a policy from your tries](/help/train-a-policy-from-your-tries).

If the robot can't run a Case, the Case gets a red row that names the first thing stopping it, such as driven wheels the Case needs, or a fall on hold. [Try a Case](/help/try-a-case) lists each reason. If the robot lacks what the Case needs, the row's note offers **New Case**.

Cases never count toward Ready to build. You can ignore one from its ⋯ menu, like any other note. A Case runs again only when the robot or the Case changes. To have the agent change the robot until a red or amber Case passes, follow [Make a Case pass with the agent](/help/make-a-case-pass-with-the-agent).

![Checks on a rover with Reach a Spot passing 20 of 20](/help/get-a-robot-ready-to-build/cases-in-checks.png)

![Checks with Reach a Spot at 0 of 20 and Missed under it, on a rover with weak wheel motors](/help/get-a-robot-ready-to-build/case-row-failing.png)

![Reach a Spot open in Simulate after clicking its row, with a green check beside its name](/help/get-a-robot-ready-to-build/case-in-simulate.png)

In Simulate, the icon beside the Case's name shows its row's status. Click it to go back to the row.

To learn why each check exists, see [The path from design to build](/help/from-design-to-build). Next, [price the parts and set a budget](/help/price-the-parts-and-set-a-budget).
