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
  - src/workspace/slashPaletteCommands.tsx
  - electron/cad-agent-prompt.mjs
---

The six commands you can start a message with to give the agent a job other than designing.

Type / at the start of a message to list them, then press Enter or Tab to pick one and add what you want after it. They're also under **Commands** in the composer's **+** menu, and in ⌘K by their names.

| Command | Name | What the agent does |
|---|---|---|
| `/train` | **Teach a Skill** | Writes the skill as a contract, shows it to you, and trains it once you agree |
| `/routine` | **Make a Routine** | Builds or changes a Routine |
| `/case` | **Make a Case** | Adds a Case: a world and a goal for the robot to try |
| `/simulate` | **Simulate the Scene** | Runs the scene in the simulation and reports what happened |
| `/operate` | **Operate the Robot** | Does a task by watching the robot's cameras, one step at a time in the simulation |
| `/check` | **Run Checks** | Checks the design is ready to build |

None of them changes the design unless your words ask for it. For example, `/case reach the cup on the shelf` adds a Case and leaves the robot alone.

`/pass` followed by a Case's name is the one that does change the design: the agent changes the robot until that Case passes. It isn't in the list; [Make a Case pass with the agent](/help/make-a-case-pass-with-the-agent) shows how to start it.

`/coach` followed by a ready skill's name and your words changes how that skill moves. It isn't in the list either; [Coach how a ready skill moves](/help/coach-a-skill) shows how to start it.

**Ask the Agent** in **Play** ▸ **Cases** starts a message with `/case`, and **Teach** in the Simulate tab's **Train** section sends `/train` with your goal.
