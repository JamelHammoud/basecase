---
title: Agent limits
date: 2026-11-13
updated: 2026-11-14
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

The agent can only edit the scene you're working in. It can't run commands or open your files, and it never moves real motors.

## It only edits the scene

The agent's only tools are the CAD tools, a to-do list and web search. It can't run shell commands, read or write files on your computer, or change Basecase's settings. If it tries any other tool, Basecase blocks it and shows a toast that says “Blocked” with the tool's name.

The agent sees only the files you attach. It doesn't see your selection, your other scenes or your other chats.

## It works on your login and your computer

Each agent runs on your computer and uses your Claude, ChatGPT or Google login, so its usage counts against your own plan. The agent needs an internet connection. The web studio has no agent.

Offline works without AI. It makes a single extruded model, either from one outline it traces in an image or from your words. It can't edit the scene or use tools. If you send it a slash command or a problem from **Checks**, it answers in one line that points to **Settings** ▸ **Agent**.

## It reaches only the public web

The agent can read public web pages up to 8 MB and images up to 20 MB. It can't reach your local network or private addresses.

## It has time and size limits

- A part's code has 90 seconds to build. The agent can raise this to 300 seconds. If a build runs longer, Basecase asks the agent to simplify the part.
- Basecase cuts a part's name off at 60 characters and its note at 400 characters.
- Each scene can run up to 4 chats at once.

## It doesn't drive hardware

**/operate** moves the robot in the simulation, and Basecase locks the real motors. The agent can slice plates to report the print time and grams, but it never sends a print to a printer.

A run that hits a limit ends in one of two ways: **Stopped** with a **Continue** button, or “Couldn’t finish” with a **Retry** button. If the agent doesn't connect at all, see [Agent doesn't connect](/help/troubleshoot-app-agent-not-connected).
