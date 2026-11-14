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

Checks run on their own about 1.5 seconds after your last change. While they run, the header shows **Checking…**. When they finish, it shows **Ready to build** or the number of problems you have left to fix.

Basecase does the heavy measuring in the background, so you can keep working. On a robot with 225 parts, you get the verdict about 5 seconds after an edit.

Each problem is either a **blocker** or a **note**. A single blocker keeps a design from being ready. A note turns a check amber and tells you something about the build, like the order the screws go in, but it never changes the verdict.

A check that stops on an error or runs out of time counts as a blocker. The header won't keep showing an old “Ready to build” while a check is unfinished.

## Why the agent's word doesn't count

The agent can't change the verdict. If it tells you a servo is strong enough, Servo torque still measures the load at a 30° crouch.

The agent sees the same problems you do and hears about any new blockers after each change. To have it try to fix them, turn on **Have the agent fix new blockers** in **Settings** ▸ **Build**. The agent then makes up to 2 follow-ups per message. Each follow-up reads like "Fix what the last change added: 2 problems." and quotes the problems from **Checks**.

If the agent thinks a check is wrong, it can dispute it. You'll see its reason on the row, but the blocker still counts.

## Only you can set a blocker aside

To set aside a single problem, open its **⋯** menu and choose **Ignore**. To set aside every problem of that kind, choose **Ignore All ⟨kind⟩**, where ⟨kind⟩ names the kind of problem. That choice also covers problems on parts you add later.

An ignored problem stays ignored when the parts change, because you made that call. The agent sees what you ignored and leaves it alone. You'll find everything you've set aside in **Ignored**, below the list, and you can put any of it back from there.

## What Ready to build doesn't promise

Checks measure the design as you modeled it. Anything you'll add by hand, like a strap or zip tie, isn't in the model, so its row is a note for you to check yourself.

Range of motion samples each joint every 15°, so a clash thinner than one step can fall between samples. Peak torque waits for a trained walk policy, and Falls waits for the agent to tip the robot over. Prices are estimates until you add the prices you see, or until a print service quotes the printed parts.

For every check and what makes it fail, see [Build tab checks](/help/build-checks).
