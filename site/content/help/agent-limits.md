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

The agent has three tools: the CAD tools, a to-do list and web search. It can't run shell commands, read or write files on your computer, or change Basecase's settings. If the agent tries to use any other tool, Basecase blocks it and shows a toast that says “Blocked” with the tool's name.

The agent sees only the files you attach. Your selection, your other scenes and your other chats stay hidden from it.

## It works on your login and your computer

Each agent runs on your computer and uses your Claude, ChatGPT or Google login, so its usage counts against your own plan. The agent needs an internet connection. If it doesn't connect at all, see [Agent doesn't connect](/help/troubleshoot-app-agent-not-connected). The web studio doesn't have an agent.

Offline works without AI. It traces one outline from an image, or works from your words, to make a single extruded model. Offline can't edit the scene or use tools.

## It reaches only the public web

The agent can read public web pages up to 8 MB and images up to 20 MB. It can't reach your local network or private addresses.

## It has time and size limits

- A part's code has 90 seconds to build, and the agent can raise this to 300 seconds. If the build takes longer, the agent is asked to simplify the part.
- A part's name is cut off at 60 characters, and its note at 400.
- Each scene can run up to 4 chats at the same time.

When a run hits a limit, it ends with **Stopped** and a **Continue** button, or with “Couldn’t finish” and a **Retry** button.

## It doesn't drive hardware

**/operate** moves the robot in the simulation, and Basecase locks the real motors. The agent can slice plates to report the print time and grams, but it never sends a print to a printer.
