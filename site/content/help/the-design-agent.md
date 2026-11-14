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

Describe a robot or show the agent a photo, and the agent models it in your scene with real servos, boards and screws that you can buy.

The agent is Claude Code, Codex or Gemini CLI. It runs on your computer in the desktop app and signs in with your own login. To use the agent from the web studio, download the desktop app.

## What it does

The agent builds in the open scene, so you can watch it work. It reads your words, photos, sketches and files, and looks up the robot's published model if there is one. Before it shapes any part, it plans where the joints go. Then it blocks out the robot, models each part as code, and checks its work.

Parts come from the same catalog you see in the **Parts** view, with their real sizes, mounting holes and prices. The agent picks parts you [own](/help/count-the-parts-you-already-own) first. If a part isn't in the catalog, the agent can add one it found on the web, and the bill of materials lists that part as Added by Agent.

The agent can also pose and animate the robot, run it in the simulation, write and run a Case, write a Routine, and teach the robot a skill. For example:

- Ask the agent to change how a ready Motor Kit skill moves. It keeps the change if Arena passes it, and drops the change if Arena doesn't.
- For a Routine, the agent proves each switch between skills and names any that fell.
- With a Case and two open scenes, the agent tells you which robot passes more often.
- Ask what happened in a try. The agent reads the try's recording and answers with times and values.
- Ask for tries, such as failed grasps from last week, and the agent searches the tries from every scene and names the ones that match.
- Ask which servo to buy. The agent runs the Case on each catalog version and answers with passes, cost and mass.

Tell the agent where an arm must reach and what it carries, and it sizes the arm's links and servos first. For a leg or finger, give it the path to trace, and it fits a four-bar linkage to that path. If you ask for fewer parts, it merges printed parts bolted together on one link into a single print.

Say what you want to do with a robot, like play a game on a gamepad, and the agent builds a Case for it. The Case opens already running, as described in [Run a Case](/help/run-a-case). In a [scanned room](/help/import-a-scanned-room), the agent aims the Case at a door or a piece of furniture you name (for example, under the table).

When the agent needs a control that the Case's panels don't have, like a joystick or a piano, it draws one as a code panel. If that code moves an object, such as a target to whack, the agent marks the object as movable. After each write, it reads the panel's errors and a capture of the window, then fixes anything that broke.

Name a movement, such as a wave, and the Case reacts to it as a gesture. If no built-in gesture matches, the agent asks you to teach it. To learn how, see [Build a Case app with the agent](/help/build-a-case-app-with-the-agent).

## What it cares about

The agent weighs its work in this order:

1. You can assemble and service the robot. For example, you can pull a battery or board out of the torso without taking the robot apart.
2. Each part costs no more than the job needs.
3. Parts look like an expert designed them.

Matching the silhouette in a photo matters less than any of these.

## How it checks its work

After each edit, the agent sees the same Checks you see in the **Build** tab. It never passes a check by narrowing a joint's range, hiding a part, deleting a part or editing a Case. If a check seems wrong, it tells you.

When an edit adds a blocker, the agent follows up on its own, up to twice per message. The follow-up appears in the chat as “Fix what the last change added: 2 problems.” above the new problems. To turn this off, go to **Settings** ▸ **Build**.

If the scene has Cases, the agent runs each one and isn't done until they all pass. To learn how, see [Make a Case pass with the agent](/help/make-a-case-pass-with-the-agent).

## What you keep control of

Each change the agent makes is a single undo step. To take changes back, see [Undo what the agent changed](/help/undo-agent-changes).

While the agent works, you can steer it, queue your next request, or stop it. Your edits come first, and the agent never blocks you from changing a part.

The agent can't run commands, open files you haven't attached, or reach your hardware. For the rest of its limits, see [Agent limits](/help/agent-limits).
