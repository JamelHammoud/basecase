---
title: A check blocks Ready to build
date: 2026-11-13
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
  - src/utils/engineeringTime.ts
  - src/utils/engineeringFalls.ts
  - src/wiring/wiringChecks.ts
  - src/components/settings/BuildPane.tsx
hub_sort: order
---

The Checks header shows Ready to build only when no check holds a blocker. Until then, it shows how many problems are left to fix. If your design isn't passing, find the case below that matches what you see.

## The header still shows a count after you edit

At least one check still holds a blocker, often one you haven't opened.

1. Click **Build** at the top of the right panel.
2. In **Checks**, open the first check with a blocker if it’s closed. Basecase lists the worst ones first.
3. To select a part, click its name under a problem.
4. Use the action beside the problem, or change the part yourself.
5. Wait a moment after your last edit. The header reads **Checking…**, then shows the new verdict.

**Edit Route** opens the cable editor for a supported **Cable reach** finding. [Route a robot cable](/help/route-a-robot-cable) covers its controls. **Fix** sends the problem to the agent when no direct fix applies.

You're done when the header reads **Ready to build** and the red dot on the **Build** tab is gone.

## “Some checks didn’t finish, so this answer isn’t complete.”

A check stopped because it hit its time limit or ran into an error. Basecase counts this as a blocker, so a design never passes on a run that didn't finish.

1. Press [[⌘K]] and choose **Run Checks**.
2. If the message is still there, quit Basecase and open it again.
3. Choose **Run Checks** again.

You're done when the message no longer appears in **Assembly**.

{{help-hub}}

## You know a blocker is wrong

Checks only see what's in the model, so they miss things like a strap that holds a part in place. To ignore a blocker:

1. Right-click the problem's row.
2. Choose **Ignore**.

The problem moves to **Ignored**, below the list. To bring it back, click **Restore** there.

**Note:** Only you can ignore a blocker. The agent can tell you it disagrees, but it can't clear a blocker by itself.

## The agent keeps fixing new blockers on its own

After each message, Basecase sends any new blockers to the agent, up to 2 times. Each time it does, you'll see "Fix what the last change added: 2 problems." above the problems in the chat. To turn this off:

1. Press [[⌘,]] and choose **Build**.
2. Turn off **Have the agent fix new blockers**.

For every check and what it measures, see [Checks in the Build tab](/help/build-checks).
