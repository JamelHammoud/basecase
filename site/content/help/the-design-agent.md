---
title: The design agent
date: 2026-11-13
updated: 2026-11-13
collection: agent
type: concept
order: 1
keywords:
  - ai
  - assistant
  - claude
  - codex
  - gemini
  - chat
  - copilot
  - generate
related:
  - design-a-robot-with-the-agent
  - agent-limits
covers:
  - docs/guide/agent.md
  - electron/cad-mcp/caseTools.mjs
  - electron/cad-agent-prompt.mjs
  - electron/cad-mcp-server.mjs
  - electron/backend/sessionParams.mjs
  - src/workspace/applyAgentOps.ts
---

Describe a robot, or show the agent a photo, and it models it in your scene with real servos, boards and screws you can buy.

The agent is Claude Code, Codex or Gemini CLI, running on your computer with your own login. It works in the desktop app; the web studio offers the download instead.

## What it does

The agent builds in the open scene, in front of you. It reads your words, photos, sketches and files, and looks up the robot's published model when there is one. It plans where the joints go before it shapes any part. Then it blocks the robot out, models each part as code, and checks its work.

It chooses parts from the same catalog as the **Parts** view, with their real sizes, mounting holes and prices. When a part isn't in the catalog, it can add one it found on the web. Those show as Added by Agent in the bill of materials.

It can also pose and animate the robot, run it in the simulation, write and run a Case, write a Routine, and teach it a skill. When it writes a Routine, it proves each switch between skills and names any that fell. Given a Case and two open scenes, it says which robot passes more often. Asked which servo to buy, it runs the Case on each catalog version and answers with passes, cost and mass.

Tell it what you want to do with a robot, such as play a game on a gamepad, and it builds a Case for it. The Case opens running, as in [Run a Case](/help/run-a-case).

## What it cares about

The agent's work is judged in this order:

1. The robot can be put together and serviced. A battery or board inside the torso comes out without taking the robot apart.
2. Each part costs no more than the job needs.
3. Parts look like an expert designed them, not like plain blocks.

Matching a photo's silhouette matters less than these three.

## How it checks its work

After each edit, the agent sees the same Checks as the **Build** tab. To pass a check, the agent never narrows a joint's range, hides a part, deletes one or edits a Case. It tells you about a check that seems wrong instead. When a new blocker appears, it follows up on its own, up to twice per message. You can turn that off in **Settings** ▸ **Build**.

When the scene has Cases, the agent runs each one and isn't done until they pass. [Make a Case pass with the agent](/help/make-a-case-pass-with-the-agent) has the steps.

## What you keep control of

Each change the agent makes is one undo step, and [Undo what the agent changed](/help/undo-agent-changes) has the ways to take changes back. You can steer it while it works, queue the next request, or stop it. Your own edits always win: the agent never blocks you from changing a part.

The agent can't run commands, open files you haven't attached, or reach your hardware; [Agent limits](/help/agent-limits) has the rest.
