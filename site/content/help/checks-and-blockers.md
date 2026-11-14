---
title: Checks and blockers
date: 2026-11-13
updated: 2026-11-14
collection: engineer
type: concept
order: 2
keywords:
  - ready to build
  - verdict
  - buildable
  - blocker
  - blockers
  - note
  - ignore
  - dispute
  - validation
  - verify
  - can it be built
related:
  - build-checks
  - get-a-robot-ready-to-build
covers:
  - src/readiness/readiness.ts
  - src/readiness/wording.ts
  - src/workspace/runReadiness.ts
  - src/workspace/useReadiness.ts
  - src/components/build/ChecksSection.tsx
  - src/components/build/IgnoredChecks.tsx
  - src/components/settings/BuildPane.tsx
---

Only the Checks in the Build tab decide whether a design is ready to build. They measure the scene itself, so nothing anyone says about the design changes what they find.

![The Checks list for a single cube, every check green and Ready to build in the header](/help/get-a-robot-ready-to-build/build-tab.png)

## Where the verdict comes from

Checks start about 1.5 seconds after your last change. While they run, the header reads **Checking…**. When they finish, it reads **Ready to build** or shows how many problems you have left to fix.

Basecase does the heavy measuring in the background, so you can keep working while checks run. On a 225-part robot, the verdict appears about 5 seconds after an edit.

Every problem is either a **blocker** or a **note**:

- A **blocker** keeps the design from being ready. A single blocker is enough.
- A **note** turns a check amber and tells you something about the build, such as the order the screws go in. Notes don't affect the verdict.

If a check stops on an error or runs out of time, it counts as a blocker. The header doesn't keep showing an old “Ready to build” while a check is unfinished.

## Why the agent's word doesn't count

Nothing the agent writes can change the verdict. If it tells you a servo is strong enough, Servo torque still measures the load at a 30° crouch.

The agent sees the same problems you do, and it hears about new blockers after each change. To have it try to fix them, turn on **Have the agent fix new blockers** in **Settings** ▸ **Build**. The agent makes up to 2 follow-ups per message. Each follow-up reads like "Fix what the last change added: 2 problems.", with the problems quoted from **Checks**.

If the agent thinks a check is wrong, it can dispute it. Its reason shows on the row, but the blocker still counts.

## Only you can set a blocker aside

To ignore one problem, open its **⋯** menu and choose **Ignore**. To ignore every problem of that kind, choose **Ignore All ⟨kind⟩**. The menu item shows the name of the problem's kind, and it also covers problems on parts you haven't made yet.

An ignored problem stays ignored when the parts change, because you made that call. The agent sees what you ignored and leaves it alone. You can find everything you've set aside under **Ignored**, below the list, and restore any of it from there.

## What Ready to build doesn't promise

Checks measure the design as you modeled it. A strap or zip tie you'll add by hand isn't in the model, so its row is a note for you to check.

Some checks have limits:

- Range of motion samples each joint every 15°, so a clash thinner than one step can fall between samples.
- Peak torque needs a trained walk policy.
- Falls needs the agent to tip the robot over.
- Prices stay estimates until you add the ones you see, or a print service quotes the printed parts.

For every check and what makes it fail, see [Build tab checks](/help/build-checks).
