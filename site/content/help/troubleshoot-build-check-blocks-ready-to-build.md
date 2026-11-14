---
title: A check blocks Ready to build
date: 2026-11-13
updated: 2026-11-13
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
  - src/utils/engineeringFalls.ts
  - src/wiring/wiringChecks.ts
  - src/components/settings/BuildPane.tsx
---

If any check still has a blocker, the Checks header shows how many problems are left to fix instead of Ready to build.

## The header still shows a count after you edit

At least one check still has a blocker, possibly one you haven't opened.

1. Click **Build** at the top of the right panel.
2. Open the check at the top of **Checks**. Basecase puts the worst ones first.
3. Click a part's name under a problem to select the part.
4. Change the part, or click **Fix** and let the agent work on the problem.
5. After your last edit, the header reads **Checking…** for a moment, then shows the new verdict.

When no blockers are left, the header reads **Ready to build** and the red dot on the **Build** tab disappears.

## “Some checks didn’t finish, so this answer isn’t complete.”

A check stopped because it hit its time limit or ran into an error. Basecase counts an unfinished check as a blocker, so a design can't pass on an incomplete run.

1. Press [[⌘K]] and choose **Run Checks**.
2. If the message stays, quit Basecase and open it again.
3. Choose **Run Checks** again, then make sure the message is gone from **Assembly**.

## Budget is red

The estimated total is over your budget. Basecase counts lines marked ≈ at their list price. If you choose **Made by a Service**, it also counts printed parts at their Slant 3D quotes.

1. Open **Budget** in Checks to see the total next to your budget.
2. List prices can run above what you pay. Save your own prices with **Add Price** in **Bill of materials**.
3. Click a line's quantity and enter how many you own in **On hand**. Parts you own cost nothing.
4. Replace expensive parts, or raise the budget in the field next to the total.

Budget turns amber above 90% of the budget and red once the total goes over it. For the full steps, see [Price the parts and set a budget](/help/price-the-parts-and-set-a-budget).

## “This servo could strip its gears when the robot falls.”

In a fall, this leg joint needs more than 5 times its servo's rated torque, or more than the peak torque in the servo's datasheet. The item names the joint and the direction of its worst fall.

1. Click **Replay in Sim** on the joint to watch that fall.
2. Ask the agent for a stronger servo at that joint, or for a lower stance.
3. Ask the agent to verify the design with falls again, then check that **Falls** in Checks shows no red mark.

## Servo bus is red

Your build has at least one bus adapter, but none of them fits the connector on these servos. For example, DYNAMIXEL X servos don't fit a Waveshare Bus Servo Adapter (A).

1. Open **Servo bus** in Checks to see which adapter to add, such as **Add a JST EH 3-pin bus adapter for 2 servos.**
2. Open **Parts** and place that adapter in the robot:
   - For JST EH 3-pin, use the **ROBOTIS U2D2** or **ROBOTIS OpenRB-150**.
   - For 5264 3-pin, use the **Waveshare Bus Servo Adapter (A)**.

When the right adapter is in place, **Servo bus** leaves the list.

## You know a blocker is wrong

Checks miss anything you haven't modeled, like a strap holding a part in place.

1. Click ⋯ on the problem's row.
2. Choose **Ignore**.

The problem moves to **Ignored**, below the list. To bring it back, click **Restore** there.

**Note:** Only you can ignore a blocker. The agent can tell you it disagrees, but it can't clear a blocker itself.

## The agent keeps fixing new blockers on its own

After each message, Basecase sends any new blockers to the agent, up to 2 times. To turn this off:

1. Press [[⌘,]] and choose **Build**.
2. Turn off **Have the agent fix new blockers**.

## Learn more

[Checks in the Build tab](/help/build-checks) lists each check and what it measures.
