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

The agent edits the scene you're in and nothing else: it can't run commands, open your files or move real motors.

## It only edits the model

The agent has the CAD tools, a to-do list and web search, and no others. It can't run shell commands, read or write files on your computer, or change Basecase's settings. When it tries another tool, Basecase blocks it and a toast says “Blocked”, with the tool's name.

It sees only files you attach. Your selection, other scenes and other chats are invisible to it.

## It works on your login and your computer

Each agent runs on your computer with your Claude, ChatGPT or Google login, so its usage counts against your own plan. It needs an internet connection. The web studio has no agent.

Offline isn't an AI. It traces one outline from an image, or works from your words, and makes a single extruded model. It can't edit the scene or use tools.

## It reaches only the public web

The agent can read public web pages and images, up to 8 MB a page and 20 MB an image. It can't reach your local network or private addresses.

## It has time and size limits

- A part's code gets 90 seconds to build, and the agent can raise that to 300 seconds. Past that, the agent is asked to simplify the part.
- A part's name is cut at 60 characters and its note at 400.
- Each scene runs up to 4 chats at once.

## It doesn't drive hardware

**/operate** moves the robot in the simulation, and Basecase locks real motors. The agent never sends a print to a printer; it can slice plates to report time and grams.

When a run hits a limit, it ends with **Stopped** and a **Continue** button, or “Couldn’t finish” and **Retry**. If the agent doesn't connect at all, see [Agent doesn't connect](/help/troubleshoot-app-agent-not-connected).
