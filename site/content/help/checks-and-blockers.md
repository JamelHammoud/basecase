---
title: Checks and blockers
date: 2026-11-13
updated: 2026-11-13
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

Only the Checks in the Build tab decide whether a design is ready to build. They measure the scene itself, so nothing anyone says about the design changes the result.

![The Checks list for a single cube, every check green and Ready to build in the header](/help/get-a-robot-ready-to-build/build-tab.png)

## Where the verdict comes from

Checks run on their own about 1.5 seconds after your last change. While they run, the header reads **Checking…**. When they finish, it reads **Ready to build** or shows how many problems are left to fix.

The heavy measuring happens in the background, so you can keep working while it runs. On a robot with 225 parts, the verdict arrives about 5 seconds after an edit.

Each problem is either a **blocker** or a **note**:

- A single **blocker** is enough to keep a design from being ready.
- A **note** turns its check amber and tells you something about the build, such as the order the screws go in. Notes never change the verdict.

If a check stops on an error or runs out of time, it counts as a blocker. The header never keeps showing an old "Ready to build" while a check hasn't finished.

## Why the agent's word doesn't count

Nothing the agent writes changes the verdict. If it tells you a servo is strong enough, Servo torque still measures the load at a 30° crouch.

The agent sees the same problems you do, and it's told about new blockers after each change. To have it try to fix them, turn on **Have the agent fix new blockers** in **Settings** ▸ **Build**. The agent then makes up to 2 follow-ups per message.

If the agent thinks a check is wrong, it can dispute it. Its reason appears on the check's row, but the blocker still counts.

## Only you can set a blocker aside

- To drop one problem, open its **⋯** menu and choose **Ignore**.
- To drop every problem of that kind, choose **Ignore All ⟨kind⟩**, where ⟨kind⟩ is the kind of problem. This also covers problems on parts you haven't made yet.

Your choice holds: an ignored problem stays ignored when the parts change. The agent can see what you ignored and leaves it alone.

Everything you've ignored is listed in **Ignored**, below the Checks list. You can put any of it back from there.

## What Ready to build doesn't promise

Checks measure the design as you modeled it, so a few things fall outside them:

- A strap or zip tie you'll add by hand isn't in the model, so its row is a note for you to check yourself.
- Range of motion samples each joint every 15°. A clash thinner than one step can fall between two samples.
- Peak torque waits until there's a trained walk policy.
- Falls waits until the agent tips the robot over.
- Prices are estimates until you add the prices you see.

For every check and what makes it fail, see [Build tab checks](/help/build-checks).
