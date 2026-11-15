---
title: The design agent
date: 2026-11-13
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
hub_sort: order
---

Describe a robot or show the agent a photo, and it models the robot in your scene with real servos, boards and screws you can buy.

The agent is Claude Code, Codex or Gemini CLI. It runs on your computer in the desktop app and signs in with your own login. To use it from the web studio, download the desktop app.

## What it does

The agent builds in the open scene, so you can watch it work. It reads your words, photos, sketches and files, and looks up the robot's published model if one exists. Before it shapes any part, it plans where the joints go. Then it blocks out the robot, models each part as code, and checks its work.

The agent picks parts from the same catalog as the **Parts** view, with their real sizes, mounting holes and prices. Parts you [own](/help/count-the-parts-you-already-own) come first. If the catalog doesn't have a part, the agent can add one it found on the web, and the bill of materials lists it as Added by Agent.

The agent can pose and animate the robot, run it in the simulation, write and run a Case, write a Routine, and teach the robot a skill. It can gather tries into a dataset from a search or from a list of tries. For example:

{{help-hub}}

## What it cares about

The agent weighs its work in this order:

1. You can assemble and service the robot. For example, you can pull a battery or board out of the torso without taking the robot apart.
2. Each part costs no more than the job needs.
3. Parts look like an expert designed them.

Matching the silhouette in a photo matters less than any of these.

## How it checks its work

After each edit, the agent sees the same Checks as the **Build** tab. It never passes a check by narrowing a joint's range, hiding a part, deleting a part or editing a Case. If a check seems wrong, it tells you.

If an edit adds a blocker, the agent follows up on its own, up to twice per message. The follow-up shows in the chat as “Fix what the last change added: 2 problems.” above the new problems. To turn this off, go to **Settings** ▸ **Build**.

## What you keep control of

Each change the agent makes is one undo step. To take changes back, see [Undo what the agent changed](/help/undo-agent-changes).

While the agent works, you can steer it, queue your next request, or stop it. Your edits come first, and the agent never blocks you from changing a part.

The agent can't run commands, open files you haven't attached, or reach your hardware. For the rest of its limits, see [Agent limits](/help/agent-limits).
