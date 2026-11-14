---
title: Agent slash commands
date: 2026-11-13
updated: 2026-11-13
collection: agent
type: reference
order: 1
keywords:
  - slash
  - commands
  - /train
  - /case
  - /check
  - /simulate
  - /routine
  - /operate
  - /pass
  - /coach
related:
  - design-a-robot-with-the-agent
  - agent-tools
covers:
  - src/agent/slashCommands.ts
  - src/components/agent/useSlashMenu.ts
  - src/components/agent/CommandList.tsx
  - src/workspace/slashPaletteCommands.tsx
  - electron/cad-agent-prompt.mjs
---

Slash commands give the agent a job other than designing. There are six of them, and you use one by starting a message with it.

To see the commands and their names, type / at the start of a message. Press [[↩]] or [[Tab]] to pick one, then add what you want after it. You can also find the commands under **Commands** in the composer's **+** menu, or search for them by name in [[⌘K]].

| Command | Name | What the agent does |
|---|---|---|
| `/train` | **Teach a Skill** | Writes the skill as a contract, shows it to you, and trains it once you agree |
| `/routine` | **Make a Routine** | Builds or changes a Routine |
| `/case` | **Make a Case** | Adds a Case: a world and a goal for the robot to try |
| `/simulate` | **Simulate the Scene** | Runs the scene in the simulation and reports what happened |
| `/operate` | **Operate the Robot** | Does a task by watching the robot's cameras, one step at a time in the simulation |
| `/check` | **Run Checks** | Checks whether the design is ready to build |

These commands change the design only when your words ask for it. For example, `/case reach the cup on the shelf` adds a Case and leaves the robot alone.

`/pass` is the one command that does change the design. Follow it with a Case's name, and the agent changes the robot until that Case passes. You won't find `/pass` in the list. To learn how to start it, see [Make a Case pass with the agent](/help/make-a-case-pass-with-the-agent).

`/coach` changes how a ready skill moves. Follow it with the skill's name and your words. Like `/pass`, it doesn't appear in the list. Learn how to start it in [Coach how a ready skill moves](/help/coach-a-skill).

Some buttons start a command for you. In **Play** ▸ **Cases**, **Ask the Agent** starts a message with `/case`. In the Simulate tab's **Train** section, **Teach** sends `/train` with your goal.
