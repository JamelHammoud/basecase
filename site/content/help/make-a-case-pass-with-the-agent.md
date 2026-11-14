---
title: Make a Case pass with the agent
date: 2026-11-13
collection: simulate-and-train
type: task
order: 12
keywords:
  - /pass
  - make it pass
  - fix
  - redesign
  - run_case
  - failing case
related:
  - try-a-case
  - build-checks
covers:
  - src/workspace/slashPaletteCommands.tsx
  - src/workspace/agentCaseRun.ts
  - src/workspace/caseChecks.ts
  - electron/cad-mcp/caseTools.mjs
  - electron/cad-agent-prompt.mjs
---

You can ask the agent to change your robot until a Case that fails in Checks passes at least 18 of its 20 runs.

Before you start, make sure the scene has a Case and that its row in **Checks** is red or amber. To learn what a Case tests, see [Cases](/help/cases).

1. In the **Build** tab, find the Case's row under **Checks**. The number on the right shows how many of the 20 runs passed.

   ![The Checks list with the Reach a Spot row red at 0 of 20 and Missed under it](/help/make-a-case-pass-with-the-agent/checks.png)

2. Click the row. The Case opens in the **Simulate** tab, and its failed runs show as red lines on the canvas.
3. Press [[⌘K]], type **Make It Pass**, then press [[↩]].

   ![The command palette with Make It Pass under Agent](/help/make-a-case-pass-with-the-agent/command.png)

4. After the Case's name, add anything the agent must keep, such as a servo you already own.

   ![The composer holding /pass Reach a Spot](/help/make-a-case-pass-with-the-agent/composer.png)

5. Press [[↩]] to send it.

The agent runs the Case the same way Checks does: 20 runs, each with different friction, mass, servo strength and delay. In a scanned room, each run also moves the furniture a little. If **Train from Tries** kept a skill for the Case, every run uses that skill, as it does in Checks.

The agent reads which rule failed in most runs and the frame where each failed run first failed, and looks at the start, middle and end of the worst run. It then changes the design, for example a servo, a link length, a wheel or foot size, or the gripper, and runs the Case again.

If neither the robot nor the Case has changed since Checks ran it, the agent gets that result right away. The agent never edits the Case to make it pass. If it can't make the Case pass, it tells you why.

Instead of using [[⌘K]], you can type `/pass` and the Case's name in the composer yourself. With the Case open, **Make It Pass** appears in [[⌘K]] only while the Case's row is red or amber.
