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

Checks run automatically about 1.5 seconds after your last change. The header shows **Checking…** until they finish, then shows **Ready to build** or the number of problems you still have to fix.

Checks do their measuring in the background, so you can keep working. On a 225-part robot, the verdict appears about 5 seconds after the edit.

Each problem is either a **blocker** or a **note**:

- A **blocker** keeps the design from being ready, even if it's the only one.
- A **note** turns a check amber and tells you something about the build, like the order the screws go in. It never changes the verdict.

If a check stops on an error or runs out of time, it counts as a blocker. The header won't keep showing an old “Ready to build” while a check is unfinished.

## Why the agent's word doesn't count

Nothing the agent writes changes the verdict. If it tells you a servo is strong enough, Servo torque still measures the load at a 30° crouch.

The agent sees the same problems you do, and it hears about new blockers after each change. To have it try to fix them, turn on **Have the agent fix new blockers** in **Settings** ▸ **Build**. It makes up to 2 follow-ups per message. Each follow-up reads like "Fix what the last change added: 2 problems.", with the problems quoted from **Checks**. If the agent thinks a check is wrong, it can dispute it. Its reason appears on the row, and the blocker still counts.

## Only you can set a blocker aside

Open the problem's **⋯** menu, then choose one of these:

- To drop a single problem, choose **Ignore**.
- To drop every problem of that kind, choose **Ignore All ⟨kind⟩**. The menu item names the kind of problem. It also covers problems on parts you haven't made yet.

Because the decision was yours, an ignored problem stays ignored when the parts change. The agent sees what you ignored and leaves it alone.

Everything you've set aside appears in **Ignored**, under the list, and you can put any of it back from there.

## What Ready to build doesn't promise

Checks measure the design as you modeled it. A strap or zip tie you'll add by hand isn't in the model, so its row is a note for you to check yourself.

Some checks have limits:

- Range of motion samples each joint every 15°, so a clash thinner than one step can fall between samples.
- Peak torque waits for a trained walk policy.
- Falls waits for the agent to tip the robot over.
- Prices are estimates until you add the ones you see, or a print service quotes the printed parts.

For every check and what makes it fail, see [Build tab checks](/help/build-checks).
