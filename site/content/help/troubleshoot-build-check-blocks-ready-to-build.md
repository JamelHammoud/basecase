---
title: A check blocks Ready to build
date: 2026-11-13
updated: 2026-11-14
collection: troubleshooting
type: troubleshooting
order: 1
keywords:
  - not ready
  - to fix
  - red check
  - blocker
  - checks didn't finish
  - over budget
  - over time
  - ignore
related:
  - get-a-robot-ready-to-build
  - build-checks
  - troubleshoot-build-real-parts-check
  - troubleshoot-build-part-wont-print
covers:
  - src/components/build/ChecksSection.tsx
  - src/components/build/FindingRow.tsx
  - src/components/build/IgnoredChecks.tsx
  - src/readiness/wording.ts
  - src/readiness/readiness.ts
  - src/utils/engineeringBudget.ts
  - src/utils/engineeringTime.ts
  - src/utils/engineeringFalls.ts
  - src/wiring/wiringChecks.ts
  - src/components/settings/BuildPane.tsx
---

If any check still has a blocker, the Checks header shows a count to fix instead of Ready to build. Find the section below that matches what you see.

## The header still shows a count after you edit

A blocker is still somewhere in the list, often in a check you haven't opened.

1. Click **Build** at the top of the right panel.
2. Open the check at the top of **Checks**. The worst ones are listed first.
3. To select a part, click its name under a problem.
4. Change the part, or click **Fix** to have the agent handle the problem.
5. Wait a moment after your last edit. The header reads **Checking…**, then shows the new verdict.

The problem is fixed when the header reads **Ready to build** and the red dot on the **Build** tab goes away.

## “Some checks didn’t finish, so this answer isn’t complete.”

A check stopped because it reached its time limit or ran into an error. Basecase counts that as a blocker, so a design never passes on a run that didn't finish.

1. Press [[⌘K]] and choose **Run Checks**.
2. If you still see the message, quit Basecase and open it again.
3. Choose **Run Checks** once more.

The problem is fixed when the message no longer appears in **Assembly**.

## Budget is red

The estimated total is higher than your budget. Basecase counts lines marked ≈ at their list price. If you choose **Made by a Service**, printed parts are counted at their Slant 3D quotes.

1. Open **Budget** in Checks. It shows the total next to your budget.
2. List prices can be higher than what you pay. To save your own prices, use **Add Price** in **Bill of materials**.
3. Click a line's quantity, then enter how many you already own in **On hand**. Parts you own cost nothing.
4. Swap out expensive parts, or raise the budget in the field next to the total.

Budget turns amber above 90% of the budget, and red when the total goes over it. For the full steps, see [Price the parts and set a budget](/help/price-the-parts-and-set-a-budget).

## Time is red

The estimated hours to print, assemble and set up the servos are more than your time budget.

1. Open **Time** in Checks. It shows the total against your time budget, split into printing, assembly and servo set-up.
2. Click **Fix** on the problem. The agent cuts print time or assembly steps, for example by merging printed parts.
3. If you have another printer, add it in **Settings** ▸ **Printers**. Basecase then spreads the plates across both printers.
4. Or raise the time budget in the field marked h, next to the money budget.

Time turns amber above 90% of the time budget, and red when the total goes over it. For the full steps, see [Set a time budget for a build](/help/set-a-time-budget-for-a-build).

## “This servo could strip its gears when the robot falls.”

In a fall, this leg joint needs more than 5 times its servo's rated torque, or more than the peak listed in the servo's datasheet. The item names the joint and the direction of its worst fall.

1. Click **Replay in Sim** on the joint to watch that fall.
2. Ask the agent for a stronger servo at that joint, or for a lower stance.
3. Ask the agent to verify the design with falls again.

The problem is fixed when **Falls** in Checks no longer shows a red mark.

## Servo bus is red

Your build has at least one bus adapter, but none of them accepts these servos' connector. This happens, for example, when DYNAMIXEL X servos are on a Waveshare Bus Servo Adapter (A).

1. Open **Servo bus** in Checks. It names the adapter you need to add, for example **Add a JST EH 3-pin bus adapter for 2 servos.**
2. Open **Parts** and place that adapter in the robot. For JST EH 3-pin, use the **ROBOTIS U2D2** or **ROBOTIS OpenRB-150**. For 5264 3-pin, use the **Waveshare Bus Servo Adapter (A)**.

The problem is fixed when **Servo bus** no longer appears in the list.

## You know a blocker is wrong

Checks can't see anything that isn't modeled, such as a strap that holds a part in place.

1. Click ⋯ on the problem's row.
2. Choose **Ignore**.

The problem moves to **Ignored**, below the list. To bring it back, click **Restore** there.

**Note:** Only you can ignore a blocker. The agent can tell you it disagrees, but it can't clear a blocker itself.

## The agent keeps fixing new blockers on its own

After each message, Basecase sends any new blockers to the agent, up to 2 times. To stop this:

1. Press [[⌘,]] and choose **Build**.
2. Turn off **Have the agent fix new blockers**.

For every check and what it measures, see [Checks in the Build tab](/help/build-checks).
