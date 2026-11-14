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

The agent is Claude Code, Codex or Gemini CLI, running on your computer with your own login. It works in the desktop app, so if you're in the web studio, download the desktop app instead.

## What it does

The agent builds in the open scene, so you can watch it work. It reads your words, photos, sketches and files, and looks up the robot's published model if there is one. Before it shapes any part, it plans where the joints go. Then it blocks out the robot, models each part as code, and checks its work.

Parts come from the same catalog as the **Parts** view, with their real sizes, mounting holes and prices. Parts you [own](/help/count-the-parts-you-already-own) come first. If a part isn't in the catalog, the agent can add one it found on the web, and the bill of materials shows that part as Added by Agent.

The agent can also:

- Pose and animate the robot.
- Run the robot in the simulation.
- Write and run a Case.
- Write a Routine. It proves each switch between skills and names any that fell.
- Teach the robot a skill. If you ask it to change how a ready Motor Kit skill moves, it keeps the change only if Arena still passes it.
- Compare two robots. With a Case and two open scenes, it tells you which robot passes more often.
- Help you choose a servo. Ask it which one to buy, and it runs the Case on each catalog version, then answers with passes, cost and mass.

Some requests change where the agent starts:

- Tell it where an arm must reach and what it carries, and it sizes the arm's links and servos first.
- If you attach or link a `.bvh` clip of a motion the robot must perform, it fits the joints and servos to that motion first.
- Give it the path a leg or finger should trace, and it fits a four-bar linkage to that path.
- When you ask for fewer parts, it merges printed parts that are bolted together on one link into a single print.

When you tell the agent what you want to do with a robot, such as play a game on a gamepad, it builds a Case for it. The Case opens running, as in [Run a Case](/help/run-a-case). In a [scanned room](/help/import-a-scanned-room), the agent aims the Case at a door or a piece of furniture you name, such as under the table.

If the Case's panels don't have a control it needs, like a joystick or a piano, the agent draws one as a code panel. When that code moves an object, for example a target to whack, the agent marks the object as movable. After each write, it reads the panel's errors and a capture of the window, then fixes what broke.

To have the Case react to a gesture, name the movement, such as a wave. If the movement isn't built in, the agent asks you to teach it. For the steps, see [Build a Case app with the agent](/help/build-a-case-app-with-the-agent).

## What it cares about

The agent weighs its work in this order:

1. The robot can be put together and serviced. A battery or board inside the torso comes out without taking the robot apart.
2. Each part costs no more than the job needs.
3. Parts look like an expert designed them, not like plain blocks.

Matching a photo's silhouette matters less than any of these.

## How it checks its work

After each edit, the agent sees the same Checks as the **Build** tab. It never passes a check by narrowing a joint's range, hiding or deleting a part, or editing a Case. If a check seems wrong, it tells you instead.

When a new blocker appears, the agent follows up on its own, up to twice per message. To turn this off, go to **Settings** ▸ **Build**.

If the scene has Cases, the agent runs each one and isn't done until they pass. For the steps, see [Make a Case pass with the agent](/help/make-a-case-pass-with-the-agent).

## What you keep control of

Each change the agent makes is one undo step. To take changes back, see [Undo what the agent changed](/help/undo-agent-changes).

While the agent works, you can steer it, queue your next request, or stop it. Your own edits always win, and the agent never blocks you from changing a part.

The agent can't run commands, open files you haven't attached, or reach your hardware. For the rest, see [Agent limits](/help/agent-limits).
