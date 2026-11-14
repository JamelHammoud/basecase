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

Only the Checks in the Build tab decide whether a design is ready to build. They measure the scene itself, so what anyone says about the design doesn't change the result.

![The Checks list for a single cube, every check green and Ready to build in the header](/help/get-a-robot-ready-to-build/build-tab.png)

## Where the verdict comes from

Checks run on their own about 1.5 seconds after your last change, and the header reads **Checking…** while they run. When they finish, it reads **Ready to build** or shows how many problems are left to fix.

Checks run in the background, so you can keep working. On a 225-part robot, the verdict arrives about 5 seconds after the edit.

Every problem is either a **blocker** or a **note**:

- Any one **blocker** keeps the design from being ready.
- A **note** turns a check amber and tells you something about the build, such as the order the screws go in. Notes never change the verdict.

If a check stops on an error or runs out of time, it counts as a blocker, so the header never keeps showing an old “Ready to build” while a check is unfinished.

## Why the agent's word doesn't count

Nothing the agent writes changes the verdict. For example, if the agent tells you a servo is strong enough, Servo torque still measures the load at a 30° crouch.

The agent sees the same problems you do and hears about new blockers after each change. To have it try to fix them, turn on **Have the agent fix new blockers** in **Settings** ▸ **Build**. It makes up to 2 follow-ups per message. Each follow-up reads like "Fix what the last change added: 2 problems.", with the problems quoted from **Checks**.

If the agent thinks a check is wrong, it can dispute it. Its reason appears on the row, but the blocker still counts.

## Only you can set a blocker aside

- To drop a single problem, open its **⋯** menu and choose **Ignore**.
- To drop every problem of that kind, choose **Ignore All ⟨kind⟩**. The menu item names the kind. This also covers problems on parts you haven't made yet.

An ignored problem stays ignored when the parts change, because the decision was yours. The agent sees what you ignored and leaves it alone.

Everything you've set aside is listed in **Ignored**, under the list, where you can put any of it back.

## What Ready to build doesn't promise

Checks measure the design as you modeled it, which leaves a few gaps:

- A strap or zip tie you'll add by hand isn't in the model, so its row is a note for you to check yourself.
- Range of motion samples each joint every 15°. A clash thinner than one step can fall between samples.
- Peak torque waits for a trained walk policy.
- Falls waits for the agent to tip the robot over.
- Prices are estimates until you add the ones you see, or until a print service quotes the printed parts.

For every check and what makes it fail, see [Build tab checks](/help/build-checks).
