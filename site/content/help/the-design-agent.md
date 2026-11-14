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

Describe a robot or show the agent a photo, and it models the robot in your scene with real servos, boards and screws that you can buy.

The agent is Claude Code, Codex or Gemini CLI, running on your computer with your own login. It works in the desktop app. If you're using the web studio, download the desktop app to use it.

## What it does

The agent builds in the scene you have open, so you can watch it work. It reads your words, photos, sketches and files, and if the robot has a published model, it looks that up too. Before it shapes any part, it plans where the joints go. Then it blocks out the robot, models each part as code, and checks its work.

Parts come from the same catalog as the **Parts** view, with their real sizes, mounting holes and prices, and parts you [own](/help/count-the-parts-you-already-own) come first. If a part isn't in the catalog, the agent can add one it found on the web. That part shows as Added by Agent in the bill of materials.

The agent can also:

- Pose and animate the robot.
- Run the robot in the simulation.
- Write and run a Case.
- Write a Routine. The agent proves each switch between skills and names any that fell.
- Teach the robot a skill. If you ask it to change how a ready Motor Kit skill moves, it keeps the change only if Arena still passes it.

With a Case and two open scenes, the agent tells you which robot passes more often. To choose between servos, ask the agent. It runs the Case on each catalog version and answers with passes, cost and mass.

How you describe the robot changes where the agent starts:

- If you say where an arm must reach and what it carries, the agent starts by sizing the arm's links and servos.
- If you show or name a motion, it starts by fitting the skeleton and servos to that motion.
- If you describe the path a leg or finger should trace, it fits a four-bar linkage to that path.
- If you ask for fewer parts, it merges printed parts that are bolted together on one link into a single print.

Tell the agent what you want to do with a robot, such as play a game on a gamepad, and it builds a Case for it. The Case opens already running, as in [Run a Case](/help/run-a-case). In a [scanned room](/help/import-a-scanned-room), the agent aims the Case at a door or piece of furniture you name, for example “under the table”.

If the Case's panels don't have a control it needs, like a joystick or a piano, the agent draws one as a code panel. When that code moves an object, such as a target to whack, the agent marks the object as movable. After each write, it reads the panel's errors and a capture of the window, then fixes anything that broke.

You can also name a movement, such as a wave, and the Case reacts to it as a gesture. If the movement isn't built in, the agent asks you to teach it.

For the steps, see [Build a Case app with the agent](/help/build-a-case-app-with-the-agent).

## What it cares about

The agent weighs its work in this order:

1. The robot can be put together and serviced. A battery or board inside the torso comes out without taking the robot apart.
2. Each part costs no more than the job needs.
3. Parts look like an expert designed them.

Matching the silhouette in a photo matters less than any of these.

## How it checks its work

After each edit, the agent sees the same Checks as the **Build** tab. It never makes a check pass by narrowing a joint's range, hiding or deleting a part, or editing a Case. If a check seems wrong, it tells you.

When a new blocker appears, the agent follows up on its own, up to twice per message. To turn this off, go to **Settings** ▸ **Build**.

If the scene has Cases, the agent runs each one and isn't done until they pass. For the steps, see [Make a Case pass with the agent](/help/make-a-case-pass-with-the-agent).

## What you keep control of

Each change the agent makes is one undo step. To take changes back, see [Undo what the agent changed](/help/undo-agent-changes).

While the agent works, you can steer it, queue your next request, or stop it. Your edits take priority over the agent's, and it never blocks you from changing a part.

The agent can't run commands, open files you haven't attached, or reach your hardware. For everything else it can't do, see [Agent limits](/help/agent-limits).
