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

Describe a robot or show the agent a photo, and it models the robot in your scene with real servos, boards and screws you can buy.

The agent is Claude Code, Codex or Gemini CLI. It runs on your computer inside the desktop app and is signed in with your own login. To use the agent from the web studio, download the desktop app.

## What it does

You can watch the agent build in the open scene. It reads your words, photos, sketches and files, and looks up the robot's published model when one exists. Before it shapes any part, the agent plans where the joints go. Then it blocks out the robot, models each part as code and checks its work.

The agent picks parts from the same catalog as the **Parts** view, with their real sizes, mounting holes and prices. Parts you [own](/help/count-the-parts-you-already-own) get tried first. If the catalog lacks a part, the agent can add one it found on the web, and the bill of materials lists that part as Added by Agent.

The agent can pose and animate the robot, run it in the simulation, write and run a Case, write a Routine, or teach the robot a skill:

- Ask it to change how a ready Motor Kit skill moves. The agent keeps the change if Arena passes it and drops it if Arena doesn't.
- For a Routine, it proves each switch between skills and names any that fell.
- Give it a Case and two open scenes, and it tells you which robot passes more often.
- To find out what happened in a try, ask. The agent reads the try's recording and answers with times and values.
- To find tries from every scene, ask the agent. It searches them with the same words as the [Library's search](/help/search-tries).
- When you're deciding which servo to buy, the agent can run the Case on each catalog version and answer with passes, cost and mass.

Tell the agent where an arm must reach and what it carries, and it sizes the arm's links and servos before anything else. For a leg or finger, give it a path to trace, and it fits a four-bar linkage to that path. If you ask for fewer parts, the agent merges the printed parts that bolt together on one link into a single print.

Say what you want to do with a robot, like play a game on a gamepad, and the agent builds a Case for it. The Case opens running, as described in [Run a Case](/help/run-a-case). In a [scanned room](/help/import-a-scanned-room), the agent aims the Case at a door or a piece of furniture you name, such as under the table.

If the Case's panels lack a control you need, like a joystick or a piano, the agent draws one as a code panel. It also marks any object that code moves, such as a target to whack, as movable. After each write, the agent reads the panel's errors and a capture of the window, then fixes anything that broke.

Name a movement, such as a wave, and the Case reacts to it as a gesture. If no built-in gesture matches, the agent asks you to teach it. For the steps, see [Build a Case app with the agent](/help/build-a-case-app-with-the-agent).

## What it cares about

The agent weighs its work in this order:

1. You can assemble and service the robot. For example, you can pull a battery or board out of the torso without taking the robot apart.
2. Each part costs no more than the job needs.
3. Parts look like an expert designed them.

Matching a photo's silhouette ranks below all three.

## How it checks its work

After each edit, the agent sees the same Checks as the **Build** tab. It never makes a check pass by narrowing a joint's range, hiding or deleting a part, or editing a Case. When a check seems wrong, the agent tells you.

If an edit adds a blocker, the agent follows up on its own, up to twice per message. In the chat, the follow-up appears as “Fix what the last change added: 2 problems.” above the new problems. You can turn this off in **Settings** ▸ **Build**.

In a scene with Cases, the agent runs each one and keeps going until they all pass. [Make a Case pass with the agent](/help/make-a-case-pass-with-the-agent) walks through it.

## What you keep control of

Each change the agent makes is one undo step. To take changes back, see [Undo what the agent changed](/help/undo-agent-changes).

While the agent works, you can steer it, queue your next request or stop it. Your edits come first, and the agent never blocks you from changing a part.

The agent can't run commands, open files you haven't attached or reach your hardware. For the full list, see [Agent limits](/help/agent-limits).
