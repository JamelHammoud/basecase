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

Only the Checks in the Build tab decide whether a design is ready to build, because they measure the scene instead of taking anyone's word.

![The Checks list for a single cube, every check green and Ready to build in the header](/help/get-a-robot-ready-to-build/build-tab.png)

## Where the verdict comes from

Checks run on their own about 1.5 seconds after your last change. There's no button to press. The header reads **Checking…** while they run, then **Ready to build**, or how many problems are left to fix.

The heavy measuring runs in the background, so you keep working while it happens. On a 225-part robot, a verdict takes about 5 seconds from the edit.

Every problem is a **blocker** or a **note**. One blocker is enough to keep a design from being ready. Notes turn a check amber and say something worth knowing, such as the order screws go in, but never change the verdict.

A check that stops on an error, or runs out of time, is a blocker itself. An old “Ready to build” never stands in for a check that didn't finish.

## Why the agent's word doesn't count

The agent can say a servo is strong enough; Servo torque still measures the load at a 30° crouch. Nothing the agent writes changes the verdict.

The agent sees the same problems you do, and after each change it hears about any new blockers. With **Have the agent fix new blockers** on, in **Settings** ▸ **Build**, it tries to fix them, up to 2 follow-ups per message. Each follow-up reads like "Fix what the last change added: 2 problems.", with the problems quoted from **Checks**. If it thinks a check is wrong, it can dispute it: its reason shows on the row, and the blocker stays.

## Only you can set a blocker aside

Open a problem's **⋯** menu and choose **Ignore** to drop that one, or **Ignore All** to drop every problem of that kind. Ignoring all covers parts you haven't made yet too.

An ignored problem doesn't come back when the parts change, because it's your call, not a measurement. **Ignored**, under the list, shows what you've set aside and puts any of it back. The agent sees what you ignored and leaves it alone.

## What Ready to build doesn't promise

Checks measure the design as it's modeled. A strap or zip tie you'll add by hand isn't in the model, so its row is a note to check yourself.

Range of motion samples each joint every 15°, so a clash thinner than one step can fall between samples. Peak torque waits for a trained walk policy, and Falls waits for the agent to tip the robot over. Prices stay estimates until you add the ones you see.

Every check, with what makes it fail, is in [Build tab checks](/help/build-checks).
