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

Describe a robot or show the agent a photo, and it models that robot in your scene from real servos, boards and screws you can buy.

The agent is Claude Code, Codex or Gemini CLI, running on your computer under your own login. It works in the desktop app. To use the agent from the web studio, download the desktop app.

## What it does

The agent builds in the open scene, so you can watch it work. It reads your words, photos, sketches and files, and looks up the robot's published model when one exists. Before it shapes any part, it plans where the joints go. Then it blocks out the robot, models each part as code and checks its work.

Parts come from the same catalog as the **Parts** view, with their real sizes, mounting holes and prices. Parts you [own](/help/count-the-parts-you-already-own) come first. When the catalog lacks a part, the agent can add one it found on the web, and the bill of materials shows that part as Added by Agent.

The agent can also:

- Pose and animate the robot.
- Run the robot in the simulation.
- Write and run a Case.
- Write a Routine. It proves each switch between skills and names any that fell.
- Teach the robot a skill. If you ask it to change how a ready Motor Kit skill moves, it keeps the change only if Arena still passes the skill.

To compare two robots, open both scenes with a Case. The agent tells you which one passes more often. When you ask which servo to buy, it runs the Case on each catalog version and answers with passes, cost and mass.

For an arm, tell the agent where it must reach and what it carries. It sizes the arm's links and servos first. For a leg or finger, give it the path to trace, and it fits a four-bar linkage to that path. If you ask for fewer parts, it merges printed parts bolted together on one link into a single print.

The agent builds a Case for whatever you want to do with a robot, such as play a game on a gamepad. The Case opens running, as in [Run a Case](/help/run-a-case). In a [scanned room](/help/import-a-scanned-room), the agent aims the Case at a door or a piece of furniture you name, such as under the table.

If the Case's panels lack a control the agent needs, like a joystick or a piano, it draws one as a code panel. It also marks any object that code moves as movable, for example a target to whack. After each write, the agent reads the panel's errors and a capture of the window, then fixes what broke.

Name a movement, such as a wave, and the Case reacts to it as a gesture. The agent asks you to teach any movement that isn't built in. For the steps, see [Build a Case app with the agent](/help/build-a-case-app-with-the-agent).

## What it cares about

The agent weighs its work in this order:

1. The robot can be put together and serviced. A battery or board inside the torso comes out without taking the robot apart.
2. Each part costs no more than the job needs.
3. Parts look like an expert designed them, not like plain blocks.

Matching a photo's silhouette ranks below all three.

## How it checks its work

After each edit, the agent sees the same Checks as the **Build** tab. It won't pass a check by narrowing a joint's range, hiding or deleting a part, or editing a Case. When a check looks wrong, it tells you.

The agent follows up on each new blocker on its own, up to twice per message. The follow-up shows in the chat as “Fix what the last change added: 2 problems.” over the new problems. You can turn that off in **Settings** ▸ **Build**.

In a scene with Cases, the agent runs each one and keeps going until they pass. For the steps, see [Make a Case pass with the agent](/help/make-a-case-pass-with-the-agent).

## What you keep control of

Each change the agent makes is one undo step. To take changes back, see [Undo what the agent changed](/help/undo-agent-changes).

While the agent works, you can steer it, queue your next request or stop it. Your edits win over the agent's, and it never blocks you from changing a part.

The agent can't run commands, open files you haven't attached or reach your hardware. For the rest of what it can't do, see [Agent limits](/help/agent-limits).
