---
title: Agent limits
date: 2026-11-13
updated: 2026-11-13
collection: agent
type: concept
order: 3
keywords:
  - cannot
  - restrictions
  - privacy
  - permissions
  - offline
  - timeout
  - web search
  - what it can't do
related:
  - the-design-agent
  - troubleshoot-app-agent-not-connected
covers:
  - electron/backend/sessionParams.mjs
  - electron/cad-kernel/sandbox/policy.mjs
  - electron/publicFetch.mjs
  - src/workspace/agentLanes.ts
  - src/workspace/useAgentSession.ts
  - electron/acp-3d-agent.mjs
---

The agent can edit only the scene you're working in. It can't run commands, open your files or move real motors.

## It only edits the scene

The agent has three tools: the CAD tools, a to-do list and web search. It can't run shell commands, read or write files on your computer, or change Basecase's settings. If it tries to use any other tool, Basecase blocks it and shows a “Blocked” toast with the tool's name.

The agent sees only the files you attach. It can't see your selection, your other scenes or your other chats.

## It works on your login and your computer

Each agent runs on your computer with your Claude, ChatGPT or Google login, and its usage counts against your own plan. It needs an internet connection, and the web studio has no agent.

Offline works without AI. It makes a single extruded model, traced from one outline in an image or made from your words, and it can't edit the scene or use tools.

## It reaches only the public web

The agent can read public web pages up to 8 MB and images up to 20 MB, but it can't reach your local network or private addresses.

## It has time and size limits

- A part's code has 90 seconds to build, and the agent can raise this to 300 seconds. If the build takes longer, Basecase asks the agent to simplify the part.
- Basecase cuts a part's name off at 60 characters and its note at 400.
- You can run up to 4 chats at the same time in each scene.

## It doesn't drive hardware

**/operate** moves the robot in the simulation, and Basecase keeps real motors locked. The agent can slice plates to report the time and grams, but it never sends a print to a printer.

A run that hits a limit ends with **Stopped** and a **Continue** button, or with “Couldn’t finish” and a **Retry** button. If the agent doesn't connect at all, see [Agent doesn't connect](/help/troubleshoot-app-agent-not-connected).
