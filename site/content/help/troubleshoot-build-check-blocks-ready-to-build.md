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
  - src/components/settings/BuildPane.tsx
---

The Checks header shows a count to fix, not Ready to build, while any check still holds a blocker.

## The header still shows a count after you edit

A blocker remains somewhere in the list, often in a check you haven't opened.

1. Click **Build** at the top of the right panel.
2. Open the check at the top of **Checks**. The worst ones come first.
3. Click a part name under a problem to select it.
4. Change the part, or click **Fix** to hand the problem to the agent.
5. Wait a moment after your last edit. The header reads **Checking…**, then the new verdict.

It worked when the header reads **Ready to build** and the red dot on the **Build** tab is gone.

## “Some checks didn’t finish, so this answer isn’t complete.”

A check stopped at its time limit or with an error. Basecase counts that as a blocker, so a half-finished run never passes a design.

1. Press ⌘K and choose **Run Checks**.
2. If the message comes back, quit Basecase and open it again.
3. Run **Run Checks** once more.

It worked when the message is gone from **Assembly**.

## Budget is red

The estimated total is over your budget. Lines marked ≈ count at their list price.

1. Open **Budget** in Checks to see the total against your budget.
2. Save the prices you really pay with **Add Price** in **Bill of materials**. List prices can be higher than what you pay.
3. Swap expensive parts, or raise the budget in the field beside the total.

Budget turns amber above 90% of the budget and red over it. [Price the parts and set a budget](/help/price-the-parts-and-set-a-budget) has the steps.

## “This servo could strip its gears when the robot falls.”

In a fall, this leg joint asks for more than 5 times its servo's rated torque, or more than the peak its datasheet gives. The item names the joint and the direction of its worst fall.

1. Click **Replay in Sim** on the joint to watch that fall.
2. Ask the agent for a stronger servo at that joint, or a lower stance.
3. Ask the agent to verify the design with falls again.

It worked when **Falls** in Checks has no red mark.

## You know a blocker is wrong

A check can't see what isn't modeled, such as a strap that holds a part.

1. Click ⋯ on the problem's row.
2. Choose **Ignore**.

The problem moves to **Ignored**, under the list, where **Restore** brings it back. Only you can ignore a blocker. The agent can say it disagrees, but it can't clear one.

## The agent keeps fixing new blockers on its own

Basecase sends new blockers to the agent after each message, up to 2 times.

1. Press ⌘, (Ctrl+, on Windows) and choose **Build**.
2. Turn off **Have the agent fix new blockers**.

Every check and what it measures is in [Checks in the Build tab](/help/build-checks).
