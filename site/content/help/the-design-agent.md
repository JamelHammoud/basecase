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

Describe a robot or show the agent a photo, and it models the robot in your scene using real servos, boards and screws that you can buy.

The agent runs Claude Code, Codex or Gemini CLI on your computer with your own login. It works in the desktop app, which you can download from the web studio.

## What it does

The agent builds in the open scene, so you can watch it work. It reads your words, photos, sketches and files, and if the robot has a published model, it looks that up as well. It plans where the joints go before it shapes any part. Then it blocks out the robot, models each part as code, and checks its work.

The agent picks parts from the same catalog you see in the **Parts** view, with their real sizes, mounting holes and prices. Parts you [own](/help/count-the-parts-you-already-own) come first. If a part isn't in the catalog, the agent can add one it found on the web. The bill of materials lists that part as Added by Agent.

The agent can also pose and animate the robot, run it in the simulation, write and run a Case, write a Routine, and teach the robot a skill. It labels your tries and names each task in words a person would say.

- If you ask the agent to change how a ready Motor Kit skill moves, it keeps the change only if Arena still passes it.
- For each Routine it writes, the agent proves each switch between skills and names any that fell.
- If you have a Case and two open scenes, the agent tells you which robot passes more often.
- To choose a servo, ask the agent which one to buy. It runs the Case on each catalog version and answers with passes, cost and mass.

Tell the agent where an arm needs to reach and what it carries, and it sizes the arm's links and servos before anything else. For a leg or finger, give it the path to trace, and it fits a four-bar linkage to that path. If you ask for fewer parts, it merges printed parts bolted together on one link into a single print.

Tell the agent what you want to do with a robot, like play a game on a gamepad, and it builds a Case for it. The Case is running when it opens, as described in [Run a Case](/help/run-a-case). While the agent builds the Case:

- In a [scanned room](/help/import-a-scanned-room), it aims the Case at a door or a piece of furniture you name, such as under the table.
- If the Case's panels don't have a control it needs, like a joystick or a piano, it draws one as a code panel. If that code moves an object, such as a target to whack, the agent marks the object as movable.
- After each write, it reads the panel's errors and a capture of the window, then fixes anything that broke.

You can also name a movement, such as a wave, and the Case reacts to it as a gesture. If the movement isn't built in, the agent asks you to teach it.

For step-by-step instructions, see [Build a Case app with the agent](/help/build-a-case-app-with-the-agent).

## What it cares about

The agent weighs its work in this order:

1. The robot can be put together and serviced. A battery or board inside the torso comes out without taking the robot apart.
2. Each part costs no more than the job needs.
3. Parts look like an expert designed them.

Matching the silhouette in a photo matters less than any of these.

## How it checks its work

After each edit, the agent sees the same Checks you see in the **Build** tab. It never gets a check to pass by narrowing a joint's range, hiding or deleting a part, or editing a Case. If a check seems wrong, the agent tells you.

If a new blocker appears, the agent follows up on its own, up to twice per message. In the chat, the follow-up appears as “Fix what the last change added: 2 problems.” above the new problems. You can turn this off in **Settings** ▸ **Build**.

If the scene has Cases, the agent runs each one and isn't finished until they all pass. For step-by-step instructions, see [Make a Case pass with the agent](/help/make-a-case-pass-with-the-agent).

## What you keep control of

Each change the agent makes is a single undo step. To take changes back, see [Undo what the agent changed](/help/undo-agent-changes).

While the agent works, you can steer it, queue your next request, or stop it. Your edits come first, and the agent never stops you from changing a part.

**Note:** The agent can't run commands, open files you haven't attached, or reach your hardware. For more information, see [Agent limits](/help/agent-limits).
