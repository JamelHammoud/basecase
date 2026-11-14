---
title: The design agent
date: 2026-11-13
updated: 2026-11-14
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

Describe a robot or show the agent a photo, and it models that robot in your scene with real servos, boards and screws you can buy.

The agent is Claude Code, Codex or Gemini CLI. It runs on your computer inside the desktop app and uses your own login. If you're in the web studio, download the desktop app.

## What it does

The agent builds in the open scene, so you can watch it work. Along with your words, photos, sketches and files, it looks up the robot's published model if one exists. Before shaping any part, the agent plans where the joints go and blocks out the robot. Then it models each part as code and checks its work.

Parts come from the same catalog as the **Parts** view, with their real sizes, mounting holes and prices. Parts you [own](/help/count-the-parts-you-already-own) come first. If the catalog lacks a part, the agent can add one it found on the web, and you'll see it marked Added by Agent in the bill of materials.

The agent can pose and animate the robot, run it in the simulation, write and run a Case, write a Routine, and teach the robot a skill. You can ask it to:

- Change how a ready Motor Kit skill moves. The agent drops the change if Arena fails it.
- Test whether a ready skill holds up on tile. You get the numbers at which the skill fails.
- Write a Routine. The agent proves each switch between skills and names any that fell.
- Compare two open scenes on a Case to see which robot passes more often.
- Choose a servo to buy. The agent runs the Case on each catalog version and reports passes, cost and mass.

To design an arm, tell the agent where the arm must reach and what it carries. It starts by sizing the arm's links and servos. For a leg or finger, give the agent the path to trace, and it fits a four-bar linkage to that path. If you ask for fewer parts, the agent merges printed parts that bolt together on one link into a single print.

Tell the agent what you want to do with a robot, such as play a game on a gamepad, and it builds a Case for that. The Case opens already running. To learn more, see [Run a Case](/help/run-a-case).

- In a [scanned room](/help/import-a-scanned-room), the agent aims the Case at a door or a piece of furniture you name, such as under the table.
- If the Case's panels lack a control it needs, like a joystick or a piano, the agent draws one as a code panel. It marks any object that code moves, such as a target to whack, as movable.
- After each write, the agent reads the panel's errors and a capture of the window, then fixes whatever broke.
- Name a movement, such as a wave, and the Case reacts to it as a gesture. If the movement isn't built in, the agent asks you to teach it.

For the steps, see [Build a Case app with the agent](/help/build-a-case-app-with-the-agent).

## What it cares about

The agent judges its work in this order:

1. You can assemble and service the robot, and pull a battery or board out of the torso without taking the robot apart.
2. Each part costs no more than the job needs.
3. Parts look like an expert designed them.

The agent ranks matching the silhouette in a photo below all three.

## How it checks its work

After each edit, the agent sees the same Checks as the **Build** tab. It never passes a check by narrowing a joint's range, hiding or deleting a part, or editing a Case. If a check seems wrong, the agent tells you.

If the agent's change adds a new blocker, the agent follows up on its own, up to twice per message. You'll see the follow-up in the chat as “Fix what the last change added: 2 problems.” above the new problems. To turn this off, go to **Settings** ▸ **Build**.

If the scene has Cases, the agent runs each one and keeps working until they all pass. For the steps, see [Make a Case pass with the agent](/help/make-a-case-pass-with-the-agent).

## What you keep control of

You can undo any change the agent makes in one step. To learn how, see [Undo what the agent changed](/help/undo-agent-changes).

While the agent works, you can steer it, queue your next request or stop it. You can also edit any part yourself, and your edits take priority over the agent's.

**Note:** The agent can't run commands, open files you haven't attached, or reach your hardware. For more, see [Agent limits](/help/agent-limits).
