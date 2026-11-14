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

Ask the agent to change the robot until a Case that fails in Checks passes at least 18 of its 20 runs.

The scene must have a Case, and its row in **Checks** must be red or amber. [Cases](/help/cases) explains what a Case tests.

1. In the **Build** tab, find the Case's row under **Checks**. The number on the right is how many of 20 runs passed.

   ![The Checks list with the Reach a Spot row red at 0 of 20 and Missed under it](/help/make-a-case-pass-with-the-agent/checks.png)

2. Click the row to open the Case in the **Simulate** tab.
3. Press ⌘K, type **Make It Pass**, and press Enter.

   ![The command palette with Make It Pass under Agent](/help/make-a-case-pass-with-the-agent/command.png)

4. Add anything the agent must keep after the Case's name, such as a servo you already own.

   ![The composer holding /pass Reach a Spot](/help/make-a-case-pass-with-the-agent/composer.png)

5. Press Enter to send it.

The agent runs the Case the way Checks does: 20 runs, each with different friction, mass, servo strength and delay. In a scanned room, each run also moves the furniture a little. A skill kept for the Case by **Train from Tries** runs in them, as it does in Checks. It reads which rule failed in most runs and looks at the worst run's start, middle and end. Then it changes the design, such as a servo, a link length, a wheel or foot size or the gripper, and runs the Case again.

When the robot and the Case haven't changed since Checks ran it, the agent gets that result at once. It never edits the Case to make it pass. When it can't make the Case pass, it says why.

You can also type `/pass` and the Case's name yourself. With the Case open, ⌘K shows **Make It Pass** only while its row is red or amber.
