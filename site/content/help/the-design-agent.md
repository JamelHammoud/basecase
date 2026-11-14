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

Describe a robot or show the agent a photo, and it models that robot in your scene with real servos, boards and screws you can buy.

The agent is Claude Code, Codex or Gemini CLI. It runs on your computer, signs in with your own login and works in the desktop app. In the web studio, you can download the desktop app instead.

## What it does

The agent builds in the open scene, so you can watch it work. It reads what you write and any photos, sketches and files you give it, and it looks up the robot's published model if one exists. It plans where the joints go before it shapes any part. Then it blocks out the robot, models each part as code and checks its work.

The agent picks parts from the same catalog as the **Parts** view, with their real sizes, mounting holes and prices. Parts you [own](/help/count-the-parts-you-already-own) come first. If the catalog doesn't have a part, the agent can add one it found on the web. The bill of materials marks that part Added by Agent.

The agent can pose and animate the robot, run it in the simulation, write and run a Case, write a Routine, and teach the robot a skill.

Ask it to change how a ready Motor Kit skill moves, and it keeps the change only if Arena still passes it. For each Routine it writes, it proves every switch between skills and tells you about any that fell. With a Case and two scenes open, it tells you which robot passes more often. To choose a servo, ask the agent: it runs the Case on each catalog version and answers with passes, cost and mass.

Tell the agent where an arm must reach and what it carries, and it sizes the arm's links and servos first. Give it a path for a leg or finger to trace, and it fits a four-bar linkage to that path. If you ask for fewer parts, it merges the printed parts bolted together on one link into a single print.

To do something specific with a robot, such as play a game on a gamepad, describe it to the agent and it builds a Case for it. The Case opens running, as described in [Run a Case](/help/run-a-case). In a [scanned room](/help/import-a-scanned-room), the agent aims the Case at a door or a piece of furniture you name, such as "under the table."

If the Case's panels lack a control the agent needs, like a joystick or a piano, it draws one as a code panel. If that code moves an object, such as a target to whack, the agent marks the object as movable. After each write, it reads the panel's errors and a capture of the window, then fixes anything that broke.

You can name a movement, like a wave, for the Case to react to as a gesture. For a movement that isn't built in, the agent asks you to teach it. [Build a Case app with the agent](/help/build-a-case-app-with-the-agent) walks through it step by step.

## What it cares about

The agent weighs its work in this order:

1. The robot can be put together and serviced. A battery or board inside the torso comes out without taking the robot apart.
2. Each part costs no more than the job needs.
3. Parts look like an expert designed them, not like plain blocks.

Matching the silhouette in a photo matters less than any of these.

## How it checks its work

After each edit, the agent sees the same Checks as the **Build** tab. It never makes a check pass by narrowing a joint's range, hiding a part, deleting a part or editing a Case. If a check seems wrong, the agent tells you instead.

If a new blocker appears, the agent follows up on its own, up to twice per message. You can turn this off in **Settings** ▸ **Build**.

If the scene has Cases, the agent runs each one and isn't done until they pass. For step-by-step instructions, see [Make a Case pass with the agent](/help/make-a-case-pass-with-the-agent).

## What you keep control of

Each change the agent makes is a single undo step. [Undo what the agent changed](/help/undo-agent-changes) shows how to take changes back.

While the agent works, you can steer it, queue your next request or stop it. Your own edits take priority, and the agent never blocks you from changing a part.

The agent can't run commands, open files you haven't attached, or reach your hardware. [Agent limits](/help/agent-limits) lists the rest of what it can't do.
