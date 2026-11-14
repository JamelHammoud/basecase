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

The Checks in the Build tab decide whether a design is ready to build. They base the verdict only on what they measure in the scene.

![The Checks list for a single cube, every check green and Ready to build in the header](/help/get-a-robot-ready-to-build/build-tab.png)

## Where the verdict comes from

Checks start on their own about 1.5 seconds after your last change. While they run, the header reads **Checking…**. When they finish, it shows **Ready to build** or the number of problems left to fix.

Basecase does the heavy measuring in the background, so you can keep working while the checks run. On a robot with 225 parts, the verdict arrives about 5 seconds after an edit.

Each problem is a **blocker** or a **note**. A single blocker keeps a design from being ready. A note turns its check amber and tells you something about the build, like the order the screws go in, but it doesn't change the verdict.

A check that stops on an error or runs out of time counts as a blocker. While any check is unfinished, the header won't show an old “Ready to build.”

## Why the agent's word doesn't count

Even if the agent tells you a servo is strong enough, the Servo torque check still measures the load at a 30° crouch.

The agent sees the same problems you do, and Basecase tells it about new blockers after each change. To have the agent fix them, turn on **Have the agent fix new blockers** in **Settings** ▸ **Build**. The agent then makes up to 2 follow-ups per message. Each follow-up reads like "Fix what the last change added: 2 problems." and quotes the problems from **Checks**.

The agent can dispute a check it thinks is wrong. You'll see its reason on the row, but the blocker still counts against the verdict.

## Only you can set a blocker aside

To set one problem aside, right-click its row and choose **Ignore**. To set aside every problem of that kind, including ones on parts you add later, choose **Ignore All ⟨kind⟩**. The menu fills in the kind's name where ⟨kind⟩ sits.

Because the decision is yours, an ignored problem stays ignored when the parts change. The agent sees what you've ignored and leaves those problems alone.

Everything you've set aside appears under **Ignored**, below the list. You can put any of it back from there.

## What Ready to build doesn't promise

Checks measure the design as you modeled it. A strap or zip tie you'll add by hand isn't in the model, so its row is a note for you to check yourself.

Some checks also have limits:

- Range of motion samples each joint every 15°, so a clash narrower than one step can fall between samples.
- Peak torque waits for a trained walk policy, and Falls waits until the agent tips the robot over.
- Prices stay estimates until you add the prices you see or a print service quotes the printed parts.
- A part cut from sheet gets a flatness check, but nothing compares it with a cutting service's smallest hole size.

For every check and what makes it fail, see [Build tab checks](/help/build-checks).
