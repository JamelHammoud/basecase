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

The Build tab lists the problems in your robot. Clear every one before you print the parts, buy them, and put the robot together.

1. Click **Build** at the top of the right panel.
2. Look at the **Checks** header. It reads **Ready to build**, or it gives the number of problems left, such as **3 to fix**.
3. Click a check with a red mark to open it.
4. Click a part's name under a problem to select that part on the canvas.
5. Click **Fix** to have the agent fix the problem, or change the part yourself. Two checks work differently:
   - On **Strength**, **Fix** prints the part on its strongest face.
   - On **Falls**, **Replay in Sim** plays that joint's worst fall in the simulation.
6. If the robot runs on a power supply rather than a battery, open **Servo voltage** and enter the supply's volts in **V**.
7. Open **Supply current** and enter the power supply's amps in **A**.
8. Open **Current and runtime** to see how long the battery lasts, for example **about 2 h 08 min**. Once the agent has run the trained walk policy in the simulator, this section shows the average and peak amps from that walk and names the joint that draws the most. The runtime shows **(estimate)** before that run and after each design change.
9. If the robot is an arm fixed in place, click **Payload** to see how much its hand can hold at full reach and close in. While **Payload** is open, the canvas puts a dot on each spot the hand can reach, bluer where the hand lifts more.
10. If the scene has Cases, **Checks** lists each one under its own name, with the number of its 20 runs that passed. Click a Case to open it in Simulate.
11. Wait for the header to read **Ready to build**. Basecase reruns the checks after each change you make.

![The Build tab with every check passed and a $150 budget beside the total](/help/get-a-robot-ready-to-build/build-tab.png)

![An SO-101 arm inside a cloud of dots, with Payload open in Checks reading 1.26 kg at full reach, 1.88 kg close in](/help/get-a-robot-ready-to-build/payload.png)

**Show Build** and **Run Checks** are also in [[⌘K]].

Press [[⌘,]] or choose **Build Settings** in [[⌘K]] to open this tab's settings in **Settings** ▸ **Build**. From there you can:

- Choose whether the agent fixes new blockers
- Choose the currency for prices
- Choose whether the build guide updates on its own

![**Settings** ▸ **Build** with Checks, Prices and Build guide](/help/get-a-robot-ready-to-build/build-settings.png)

To set a problem aside, right-click its row and choose **Ignore**. To set aside every problem of that kind, choose **Ignore All ⟨kind⟩** below it. The menu shows the kind's name in place of ⟨kind⟩. Everything you set aside appears under **Ignored**, and **Restore** brings a problem back.

## Cases in Checks

Checks runs each Case 20 times. Each run nudges friction, weight, servo strength, and servo delay, and starts a box, or anything else that moves, up to 15 mm from where it sits in the scene. A Case's color gives the share of runs that passed: green for 18 of 20 or more, amber for 10 to 17, and red for fewer than 10. Under each Case, Checks names its most common failure, such as Fell or Missed.

A Case with a skill you kept through **Train from Tries** runs that skill in place of its scripted motion. See [Train a policy from your tries](/help/train-a-policy-from-your-tries).

A Case the robot can't run gets a red row naming the first thing in the way, such as driven wheels the Case needs or a fall on hold. [Try a Case](/help/try-a-case) lists every reason. If the robot lacks what the Case needs, the note on the row has **New Case**.

Cases don't count toward Ready to build. Right-click one to ignore it, as you would any other note. Checks skips rerunning a Case until the robot or the Case changes. To have the agent change the robot until a red or amber Case passes, see [Make a Case pass with the agent](/help/make-a-case-pass-with-the-agent).

![Checks on a rover with Reach a Spot passing 20 of 20](/help/get-a-robot-ready-to-build/cases-in-checks.png)

![Checks with Reach a Spot at 0 of 20 and Missed under it, on a rover with weak wheel motors](/help/get-a-robot-ready-to-build/case-row-failing.png)

![Reach a Spot open in Simulate after clicking its row, with a green check beside its name](/help/get-a-robot-ready-to-build/case-in-simulate.png)

In Simulate, the icon beside a Case's name shows the status of its row in Checks. Click the icon to return to that row.

[The path from design to build](/help/from-design-to-build) explains why each check exists. Next, [price the parts and set a budget](/help/price-the-parts-and-set-a-budget).
