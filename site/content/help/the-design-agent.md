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

Describe a robot or show the agent a photo, and it models the robot in your scene using real servos, boards and screws you can buy.

The agent is Claude Code, Codex or Gemini CLI, running on your computer with your own login. It works in the desktop app. From the web studio, you can download the desktop app instead.

## What it does

The agent builds in the open scene, so you can watch it work. It reads your words, photos, sketches and files, and looks up the robot's published model if one exists. Before it shapes any part, it plans where the joints go. Then it blocks out the robot, models each part as code, and checks its work.

Parts come from the same catalog as the **Parts** view, with their real sizes, mounting holes and prices, and parts you [own](/help/count-the-parts-you-already-own) come first. If a part isn't in the catalog, the agent can add one it found on the web. The bill of materials lists these parts as Added by Agent.

The agent can also pose and animate the robot, run it in the simulation, write and run a Case, write a Routine, and teach the robot a skill. If you ask it to change how a ready Motor Kit skill moves, it keeps the change only if Arena still passes it. When it writes a Routine, it proves each switch between skills and names any that fell. With a Case and two open scenes, it tells you which robot passes more often. To choose a servo, ask the agent which one to buy. It runs the Case on each catalog version and answers with passes, cost and mass.

When you tell it where an arm must reach and what it carries, the agent sizes the arm's links and servos first. Give it the path a leg or finger should trace, and it fits a four-bar linkage to that path. To get fewer parts, ask for them: the agent merges printed parts that are bolted together on one link into a single print.

Tell the agent what you want to do with a robot, such as play a game on a gamepad, and it builds a Case for it. The Case opens already running, as described in [Run a Case](/help/run-a-case). In a [scanned room](/help/import-a-scanned-room), the agent aims the Case at a door or a piece of furniture you name, such as under the table.

If the Case's panels don't have a control it needs, like a joystick or a piano, the agent draws one as a code panel. When that code moves an object, for example a target to whack, the agent marks the object as movable. After each write, it reads the panel's errors and a capture of the window, then fixes anything that broke. If you [arranged the console](/help/arrange-a-case-console) yourself, the agent reads your layout and keeps it.

You can also name a movement, such as a wave, and the Case reacts to it as a gesture. If the movement isn't built in, the agent asks you to teach it. For the steps, see [Build a Case app with the agent](/help/build-a-case-app-with-the-agent).

## What it cares about

The agent weighs its work in this order:

1. The robot can be put together and serviced. A battery or board inside the torso comes out without taking the robot apart.
2. Each part costs no more than the job needs.
3. Parts look like an expert designed them.

Matching the silhouette in a photo matters less than any of these.

## How it checks its work

After each edit, the agent sees the same Checks as the **Build** tab. It never passes a check by narrowing a joint's range, hiding a part, deleting a part or editing a Case. If a check seems wrong, it tells you instead.

When a new blocker appears, the agent follows up on its own, up to twice per message. To turn this off, go to **Settings** ▸ **Build**.

If the scene has Cases, the agent runs each one and isn't done until they all pass. For the steps, see [Make a Case pass with the agent](/help/make-a-case-pass-with-the-agent).

## What you keep control of

Each change the agent makes is one undo step. To take changes back, see [Undo what the agent changed](/help/undo-agent-changes).

While the agent works, you can steer it, queue your next request, or stop it. Your own edits always win, and the agent never blocks you from changing a part.

The agent can't run commands, open files you haven't attached, or reach your hardware. For the rest of what it can't do, see [Agent limits](/help/agent-limits).
