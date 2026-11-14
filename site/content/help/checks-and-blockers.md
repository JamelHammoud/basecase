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

The Checks in the Build tab decide whether your design is ready to build. They judge it only on what they measure in the scene.

![The Checks list for a single cube, every check that ran green and Ready to build in the header](/help/get-a-robot-ready-to-build/build-tab.png)

## Where the verdict comes from

Basecase runs the checks about 1.5 seconds after your last change, and the header shows **Checking…** until they finish. Then it shows **Ready to build** or the number of problems left to fix.

The heavy measuring runs in the background, so you can keep working. On a robot with 225 parts, the verdict appears about 5 seconds after an edit.

Every problem is either a **blocker** or a **note**. A single blocker keeps a design from being ready. A note turns its check amber and tells you something about the build, like the order the screws go in, but doesn't change the verdict.

A check that stops on an error or runs out of time counts as a blocker. If any check hasn't finished, the header won't show an old “Ready to build”.

## Why the agent's word doesn't count

If the agent tells you a servo is strong enough, the Servo torque check still measures the load at a 30° crouch.

The agent sees the same problems you do, and after each change Basecase tells it about any new blockers. To have the agent try to fix them, turn on **Have the agent fix new blockers** in **Settings** ▸ **Build**. The agent then makes up to 2 follow-ups per message. Each follow-up reads like "Fix what the last change added: 2 problems." and quotes the problems from **Checks**.

If the agent thinks a check is wrong, it can dispute it. Its reason appears on the row, and the blocker still counts.

## Only you can set a blocker aside

To set one problem aside, right-click its row and choose **Ignore**. To set aside every problem of that kind, including problems on parts you add later, choose **Ignore All ⟨kind⟩**. The menu shows the name of the kind in place of ⟨kind⟩.

Because you made the call, an ignored problem stays ignored when the parts change. The agent sees what you've ignored and leaves those problems alone.

To see everything you've set aside, look under **Ignored**, below the list. You can put any of it back from there.

## What Ready to build doesn't promise

Checks measure the design as you modeled it. Anything you add by hand, like a strap or zip tie, isn't in the model. Its row is a note, and you check it yourself.

Some checks have limits:

- Range of motion samples each joint every 15°. A clash narrower than one step can fall between samples.
- Peak torque waits for a trained walk policy.
- Falls waits until the agent tips the robot over.
- Prices are estimates until you add the prices you see, or until a print service quotes the printed parts.

For every check and what makes it fail, see [Build tab checks](/help/build-checks).
