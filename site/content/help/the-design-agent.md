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

Describe a robot or show the agent a photo, and it models that robot in your scene using real servos, boards and screws that you can buy.

The agent is Claude Code, Codex or Gemini CLI. It runs on your computer inside the desktop app and signs in with your own login. If you're using the web studio, download the desktop app to use the agent.

## What it does

The agent builds in the scene you have open, so you can watch it work. It reads your words, photos, sketches and files, and looks up the robot's published model when there is one. Before it shapes any part, it plans where the joints go. Then it blocks out the robot, models each part as code and checks its work.

Parts come from the same catalog as the **Parts** view, with their real sizes, mounting holes and prices. The agent tries the parts you [own](/help/count-the-parts-you-already-own) first. When a part isn't in the catalog, the agent can add one it found on the web, and the bill of materials lists that part as Added by Agent.

The agent can also pose and animate the robot, run it in the simulation, write and run a Case, write a Routine, or teach the robot a skill. For example, you can ask it to:

- Change how a ready Motor Kit skill moves. The agent keeps the change only if it passes Arena.
- Write a Routine. The agent proves each switch between skills and names any that fell.
- Compare two open scenes on a Case to see which robot passes more often.
- Explain what happened in a try. The agent reads the try's recording and answers with times and values.
- Find tries from every scene. It searches with the same words as the [Library's search](/help/search-tries).
- Run the Case on each catalog version of a servo you're thinking of buying. The agent answers with passes, cost and mass.

When you tell the agent where an arm needs to reach and what it carries, it sizes the arm's links and servos first. For a leg or finger, give it a path to trace, and it fits a four-bar linkage to that path. Ask for fewer parts, and the agent merges the printed parts that bolt together on one link into a single print.

Tell the agent what you want to do with a robot, like play a game on a gamepad, and it builds a Case for it. The Case opens running, as described in [Run a Case](/help/run-a-case). In a [scanned room](/help/import-a-scanned-room), the agent aims the Case at a door or piece of furniture you name, such as under the table.

If the Case's panels don't have a control you need, like a joystick or a piano, the agent draws one as a code panel. Any object the code moves, such as a target to whack, is marked as movable. After each write, the agent reads the panel's errors and a capture of the window, then fixes anything that broke.

When you name a movement, such as a wave, the Case reacts to it as a gesture. If no built-in gesture matches, the agent asks you to teach it. For the steps, see [Build a Case app with the agent](/help/build-a-case-app-with-the-agent).

## What it cares about

The agent weighs its work in this order:

1. You can assemble and service the robot. For example, you can pull a battery or board out of the torso without taking the robot apart.
2. Each part costs no more than the job needs.
3. Parts look like an expert designed them.

Matching the silhouette in a photo matters less than any of these.

## How it checks its work

After each edit, the agent sees the same Checks as the **Build** tab. It never makes a check pass by narrowing a joint's range, hiding or deleting a part, or editing a Case. If a check looks wrong, the agent tells you.

When an edit adds a blocker, the agent follows up on its own, up to twice per message. The chat shows the follow-up as “Fix what the last change added: 2 problems.” above the new problems. To turn this off, go to **Settings** ▸ **Build**.

In a scene with Cases, the agent runs each Case and keeps working until they all pass. Learn more in [Make a Case pass with the agent](/help/make-a-case-pass-with-the-agent).

## What you keep control of

Each change the agent makes is a single undo step. To take a change back, see [Undo what the agent changed](/help/undo-agent-changes).

While the agent works, you can steer it, queue your next request or stop it. Your edits always come first, and the agent never blocks you from changing a part.

The agent can't run commands, open files you haven't attached or reach your hardware. For the full list, see [Agent limits](/help/agent-limits).
