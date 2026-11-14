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

Before you print the parts, buy them, and put the robot together, clear every problem the Build tab finds.

1. Click **Build** at the top of the right panel.
2. Check the header of **Checks**. It reads **Ready to build** or shows how many problems are left, such as **3 to fix**.
3. To open a check, click one with a red mark.
4. To select a part on the canvas, click its name under a problem.
5. Click **Fix** to have the agent fix the problem, or change the part yourself. A few checks work differently:
   - On **Strength**, **Fix** prints the part on its strongest face instead.
   - On **Falls**, **Replay in Sim** plays that joint's worst fall in the simulation.
6. If the robot runs on a power supply instead of a battery, open **Servo voltage** and type the supply's volts in **V**.
7. Open **Supply current** and type the power supply's amps in **A**.
8. Open **Current and runtime** to see how long the battery lasts, such as **about 2 h 08 min**. After the agent runs the trained walk policy in the simulator, **Current and runtime** shows the average and peak amps from that walk, and the joint that draws the most. Until then, and again after you change the design, the runtime shows **(estimate)**.
9. If the robot is an arm fixed in place, click **Payload** to see how much its hand can hold at full reach and close in. While **Payload** is open, the canvas shows a dot at every point the hand can reach. Bluer dots mean the hand can lift more there.
10. If the scene has Cases, **Checks** lists each one under its own name, with how many of its 20 runs passed. To open a Case in Simulate, click it.
11. Wait for the header to read **Ready to build**. Basecase runs the checks again after every change.

![The Build tab with every check passed and a $150 budget beside the total](/help/get-a-robot-ready-to-build/build-tab.png)

![An SO-101 arm inside a cloud of dots, with Payload open in Checks reading 1.26 kg at full reach, 1.88 kg close in](/help/get-a-robot-ready-to-build/payload.png)

You can also choose **Show Build** and **Run Checks** from [[⌘K]].

The settings for this tab are in **Settings** ▸ **Build**. To open them, press [[⌘,]] or choose **Build Settings** in [[⌘K]]. There you can set:

- Whether the agent fixes new blockers
- Which currency prices show in
- Whether the build guide updates automatically

![**Settings** ▸ **Build** with Checks, Prices and Build guide](/help/get-a-robot-ready-to-build/build-settings.png)

To ignore a problem, right-click its row and choose **Ignore**. To ignore every problem of that kind, choose **Ignore All ⟨kind⟩** below it. **Ignored** lists every problem you ignore. To bring one back, click **Restore**.

## Cases in Checks

Each Case runs 20 times. On each run, Basecase changes friction, weight, servo strength, and servo delay by a small amount. It also starts a box, or anything else that moves, up to 15 mm from where it was placed. A Case's color shows how many runs it passed:

- **Green:** 18 or more of 20
- **Amber:** 10 to 17
- **Red:** fewer than 10

The Case's most common failure, such as Fell or Missed, shows under it.

If a Case has a skill you kept with **Train from Tries**, the Case runs that skill instead of its scripted motion. To learn more, see [Train a policy from your tries](/help/train-a-policy-from-your-tries).

If the robot can't run a Case, the Case gets a red row that names the first thing stopping it, such as driven wheels the Case needs or a fall on hold. [Try a Case](/help/try-a-case) lists each reason. If the robot lacks what the Case needs, the row's note offers **New Case**.

Cases never count toward Ready to build. To ignore one, right-click the note under it and choose **Ignore**, the same as any other note. A Case runs again only when the robot or the Case changes, or when you drop the 3D world it was made in. To have the agent change the robot until a red or amber Case passes, see [Make a Case pass with the agent](/help/make-a-case-pass-with-the-agent).

![Checks on a rover with Reach a Spot passing 20 of 20](/help/get-a-robot-ready-to-build/cases-in-checks.png)

![Checks with Reach a Spot at 0 of 20 and Missed under it, on a rover with weak wheel motors](/help/get-a-robot-ready-to-build/case-row-failing.png)

![Reach a Spot open in Simulate after clicking its row, with a green check beside its name](/help/get-a-robot-ready-to-build/case-in-simulate.png)

In Simulate, the icon beside the Case's name shows the status of its row. To go back to the row, click the icon.

To learn why each check exists, see [The path from design to build](/help/from-design-to-build). Next, [price the parts and set a budget](/help/price-the-parts-and-set-a-budget).
