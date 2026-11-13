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

Clear every problem the Build tab finds, so the design can be printed, bought and put together.

1. Click **Build** at the top of the right panel.
2. Read the header of **Checks**. It says **Ready to build**, or how many problems are left, such as **3 to fix**.
3. Click a check with a red mark to open it.
4. Click a part name under a problem to select that part on the canvas.
5. Click **Fix** to hand the problem to the agent, or change the part yourself. On **Strength**, **Fix** prints the part on its strongest face instead.
6. If the robot runs on a cable instead of a battery, open **Servo voltage** and type the supply's volts in **V**.
7. Open **Supply current** and type the supply's amps in **A**.
8. Open **Current and runtime** to see how many minutes the battery lasts. Once the agent has walked the trained walk policy in the simulator, it shows the average and peak amps from that walk and the joint that draws the most. Until then, and after you change the design, it says **(estimate)**.
9. If the robot is an arm fixed in place, click **Payload** to see how much its hand holds at full reach and close in. While it's open, the canvas shows a dot wherever the hand reaches, bluer where it lifts more.
10. If the scene has Cases, find each one in **Checks** under its own name, with how many of 20 runs it passed. Click it to open the Case in Simulate.
11. Wait for the header to read **Ready to build**. The checks run again on their own after every change.

![The Build tab with every check passed and a $150 budget beside the total](/help/get-a-robot-ready-to-build/build-tab.png)

![An SO-101 arm inside a cloud of dots, with Payload open in Checks reading 1.26 kg at full reach, 1.88 kg close in](/help/get-a-robot-ready-to-build/payload.png)

**Show Build** and **Run Checks** are also in ⌘K.

Settings ▸ Build (⌘,) holds the settings for this tab: whether the agent fixes new blockers, the currency prices show in, and whether the build guide updates on its own.

![Settings ▸ Build with Checks, Prices and Build guide](/help/get-a-robot-ready-to-build/build-settings.png)

To set a problem aside, click ⋯ on its row and choose **Ignore**. The **Ignore All** item below it, named after the kind of problem, sets aside every problem of that kind. Ignored problems stay under **Ignored**, where **Restore** brings each one back.

## Cases in Checks

Each Case runs 20 times, with friction, weight, servo strength and servo delay changed a little every time. A box or anything else that moves starts up to 15 mm from where it was placed. A Case is green at 18 of 20 or better, amber from 10 to 17 and red below 10. Its most common failure shows under it, such as Fell or Missed.

A Case with a skill kept by **Train From Tries** runs that skill instead of its scripted motion; see [Train a policy from your tries](/help/train-a-policy-from-your-tries).

A robot that can't enter a Case gets a red row that says why. Cases never count toward Ready to build, and you can ignore one from its ⋯ menu like any other note. They run again only when the robot or the Case changes. To have the agent change the robot until a red or amber Case passes, follow [Make a Case pass with the agent](/help/make-a-case-pass-with-the-agent).

![Checks with Reach the Flag and Follow a Path past a Block, each passing 20 of 20](/help/get-a-robot-ready-to-build/cases-in-checks.png)

![Checks with Reach the Flag at 0 of 20 and Missed under it, on a rover with weak wheel motors](/help/get-a-robot-ready-to-build/case-row-failing.png)

![Reach the Flag open in Simulate after clicking its row](/help/get-a-robot-ready-to-build/case-in-simulate.png)

Why each check exists is in [The path from design to build](/help/from-design-to-build). Next, [price the parts and set a budget](/help/price-the-parts-and-set-a-budget).
