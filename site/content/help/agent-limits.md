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

The agent can edit only the scene you're working in. It can't run commands, open your files or move real motors.

## It only edits the scene

The agent has three things to work with: the CAD tools, a to-do list and web search. It can't run shell commands, read or write files on your computer, or change Basecase's settings. If it tries any other tool, Basecase blocks it and shows a toast that says “Blocked” with the name of the tool.

The agent sees only the files you attach. It can't see your selection, your other scenes or your other chats.

## It works on your login and your computer

Each agent runs on your computer and uses your Claude, ChatGPT or Google login, so its usage counts against your own plan. The agent needs an internet connection. The web studio doesn't have an agent.

Offline works without AI and can't edit the scene or use tools. It makes a single extruded model, either by tracing one outline from an image or by working from your words. If you send it a slash command or a problem from **Checks**, it answers in one line that points to **Settings** ▸ **Agent**.

## It reaches only the public web

The agent can read public web pages up to 8 MB and images up to 20 MB. It can't reach your local network or any private address.

## It has time and size limits

- A part's code has 90 seconds to build, and the agent can raise this limit to 300 seconds. If the build takes longer than that, the agent is asked to simplify the part.
- Part names are cut off at 60 characters, and notes at 400.
- Each scene can run up to 4 chats at the same time.

## It doesn't drive hardware

**/operate** moves the robot in the simulation, and Basecase locks real motors. The agent can slice plates to report the time and grams, but it never sends a print to a printer.

When a run hits a limit, it ends in one of two ways: **Stopped** with a **Continue** button, or “Couldn’t finish” with a **Retry** button. If the agent doesn't connect at all, see [Agent doesn't connect](/help/troubleshoot-app-agent-not-connected).
