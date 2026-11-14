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

The agent is Claude Code, Codex or Gemini CLI, running on your computer with your own login. It works in the desktop app. In the web studio, you can download the desktop app to use it.

## What it does

The agent builds in the open scene, so you can watch it work. It reads your words, photos, sketches and files, and looks up the robot's published model if one exists. Before it shapes any part, it plans where the joints go. Then it blocks out the robot, models each part as code, and checks its work.

The agent picks parts from the same catalog as the **Parts** view, with their real sizes, mounting holes and prices. Parts you [own](/help/count-the-parts-you-already-own) come first. If the catalog lacks a part, the agent can add one it found on the web, and the bill of materials marks it Added by Agent.

The agent can also pose and animate the robot, run it in the simulation, write and run a Case, write a Routine, and teach the robot a skill. It can gather tries into a dataset, from a search or from a list of tries.

- If you ask it to change how a ready Motor Kit skill moves, it keeps the change only if Arena still passes it.
- For each Routine it writes, it proves each switch between skills and names any that fell.
- Given a Case and two open scenes, it tells you which robot passes more often.
- To choose a servo, ask the agent which one to buy. It runs the Case on each catalog version and answers with passes, cost and mass.

Tell the agent where an arm must reach and what it carries, and it sizes the arm's links and servos first. Give a leg or finger a path to trace, and it fits a four-bar linkage to it. If you ask for fewer parts, it merges printed parts bolted together on one link into a single print.

Say what you want to do with a robot, such as play a game on a gamepad, and the agent builds a Case for it. The Case opens running, as in [Run a Case](/help/run-a-case). In a [scanned room](/help/import-a-scanned-room), the agent aims the Case at a door or a piece of furniture you name, such as under the table.

If the Case's panels lack a control it needs, like a joystick or a piano, the agent draws one as a code panel. Any object that code moves, such as a target to whack, gets marked as movable. After each write, the agent reads the panel's errors and a capture of the window, then fixes what broke.

You can also name a movement, such as a wave, for the Case to react to as a gesture. If the Case doesn't have that movement built in, the agent asks you to teach it. For the steps, see [Build a Case app with the agent](/help/build-a-case-app-with-the-agent).

## What it cares about

The agent weighs its work in this order:

1. The robot can be put together and serviced. A battery or board inside the torso comes out without taking the robot apart.
2. Each part costs no more than the job needs.
3. Parts look like an expert designed them, not like plain blocks.

A photo's silhouette ranks below all three.

## How it checks its work

After each edit, the agent sees the same Checks as the **Build** tab. It never passes a check by narrowing a joint's range, hiding a part, deleting a part or editing a Case. If a check seems wrong, the agent tells you.

When a new blocker appears, the agent follows up on its own, up to twice per message. The follow-up shows in the chat as “Fix what the last change added: 2 problems.” above the new problems. To turn this off, go to **Settings** ▸ **Build**.

In a scene with Cases, the agent runs each one and keeps going until they all pass. For the steps, see [Make a Case pass with the agent](/help/make-a-case-pass-with-the-agent).

## What you keep control of

You can undo each change the agent makes in one step. See [Undo what the agent changed](/help/undo-agent-changes).

While the agent works, you can steer it, queue your next request, or stop it. Your edits win over the agent's, and it never blocks you from changing a part.

The agent can't run commands, open files you haven't attached, or reach your hardware. See [Agent limits](/help/agent-limits) for more.
