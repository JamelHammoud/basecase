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

The Checks in the Build tab decide whether a design is ready to build. They measure the scene itself, so a claim about the design doesn't change the result.

![The Checks list for a single cube, every check green and Ready to build in the header](/help/get-a-robot-ready-to-build/build-tab.png)

## Where the verdict comes from

Checks run on their own about 1.5 seconds after your last change. The header reads **Checking…** as they run, then **Ready to build** or the number of problems left to fix.

The heavy measuring runs in the background, so you can keep working. On a 225-part robot, you get the verdict about 5 seconds after an edit.

Each problem is either a **blocker** or a **note**. One blocker is enough to keep a design from being ready. A note turns its check amber and tells you something about the build, like the order the screws go in, but it doesn't change the verdict.

A check that stops on an error or runs out of time counts as a blocker. The header won't show an old “Ready to build” while a check is unfinished.

## Why the agent's word doesn't count

If the agent tells you a servo is strong enough, Servo torque goes on measuring the load at a 30° crouch.

The agent sees the same problems you do, and it hears about any new blockers after each change. To have it try to fix them, turn on **Have the agent fix new blockers** in **Settings** ▸ **Build**. The agent makes up to 2 follow-ups per message. Each one reads like "Fix what the last change added: 2 problems.", with the problems quoted from **Checks**.

If the agent thinks a check is wrong, it can dispute it. Its reason shows on the row, and the blocker keeps counting.

## Only you can set a blocker aside

To set one problem aside, right-click its row and choose **Ignore**. To ignore every problem of that kind, including problems on parts you add later, choose **Ignore All ⟨kind⟩**, where ⟨kind⟩ is the name of the problem's kind.

An ignored problem stays ignored when the parts change, because you made that call. The agent sees what you ignored and leaves those problems alone. Everything you've set aside is in **Ignored**, below the list, and you can put any of it back from there.

## What Ready to build doesn't promise

Checks measure the design as you modeled it. A strap or zip tie you'll add by hand isn't in the model, so its row is a note for you to check yourself.

Range of motion samples each joint every 15°, and a clash thinner than one step can fall between samples. Peak torque waits for a trained walk policy, and Falls waits for the agent to tip the robot over. Prices stay estimates until you add the prices you see or a print service quotes the printed parts.

The full list of checks, with what makes each one fail, is in [Build tab checks](/help/build-checks).
