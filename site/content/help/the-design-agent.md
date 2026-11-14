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

The agent is Claude Code, Codex or Gemini CLI, running on your computer with your own login. It works in the desktop app, which you can download from the web studio.

## What it does

The agent builds in the open scene, so you can watch it work. It reads your words, photos, sketches and files, and looks up the robot's published model if there is one. Before it shapes any part, it plans where the joints go. Then it blocks out the robot, models each part as code, and checks its work.

Parts come from the same catalog as the **Parts** view, with their real sizes, mounting holes and prices. Parts you [own](/help/count-the-parts-you-already-own) come first. If the catalog doesn't have a part, the agent can add one it found on the web. The bill of materials shows that part as Added by Agent.

The agent can also pose and animate the robot, run it in the simulation, write and run a Case, write a Routine, or teach the robot a skill.

If you ask it to change how a ready Motor Kit skill moves, it keeps the change only if Arena still passes it. For a Routine, it proves each switch between skills and tells you which ones failed. With a Case and two open scenes, it tells you which robot passes more often. To help you choose which servo to buy, it runs the Case on each catalog version and reports passes, cost and mass. Like the Library's search, it can search tries across every scene, so you can ask it to find last week's failed grasps.

If you tell the agent where an arm needs to reach and what it carries, it sizes the arm's links and servos first. Give it the path a leg or finger should trace, and it fits a four-bar linkage to that path. To use fewer parts, it merges printed parts that bolt together on the same link into a single print.

The agent can also build a Case from a description of what you want a robot to do, like play a game on a gamepad. The Case opens already running, as described in [Run a Case](/help/run-a-case). In a [scanned room](/help/import-a-scanned-room), name a door or a piece of furniture, such as under the table, and the agent aims the Case at it.

If a Case needs a control its panels don't have, like a joystick or a piano, the agent draws one as a code panel. Any object the code moves, such as a target to whack, is marked as movable. After each write, the agent reads the panel's errors and a capture of the window, then fixes anything that broke.

You can name a movement, such as a wave, and the Case reacts to it as a gesture. If the movement isn't built in, the agent asks you to teach it. For the steps, see [Build a Case app with the agent](/help/build-a-case-app-with-the-agent).

## What it cares about

The agent weighs design choices in this order:

1. You can put the robot together and service it. You can pull a battery or board out of the torso without taking the robot apart.
2. Each part costs no more than the job needs.
3. Parts look like an expert designed them.

Matching the silhouette in a photo matters less than any of these.

## How it checks its work

After each edit, the agent sees the same Checks as the **Build** tab. It never passes a check by narrowing a joint's range, hiding or deleting a part, or editing a Case. If it thinks a check is wrong, it tells you instead.

If a new blocker appears, the agent follows up on its own, up to twice per message. The follow-up shows in the chat as “Fix what the last change added: 2 problems.” over the new problems. You can turn this off in **Settings** ▸ **Build**.

In a scene with Cases, the agent runs each Case and keeps going until they all pass. For the steps, see [Make a Case pass with the agent](/help/make-a-case-pass-with-the-agent).

## What you keep control of

Each change the agent makes is one undo step. To take changes back, see [Undo what the agent changed](/help/undo-agent-changes).

You can steer the agent in the middle of a task, queue your next request, or stop it. Your own edits win, and the agent never blocks you from changing a part.

The agent can't run commands, open files you haven't attached, or reach your hardware. For everything else it can't do, see [Agent limits](/help/agent-limits).
