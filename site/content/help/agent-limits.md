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

The agent edits the scene you're working in. It can't run commands, open your files, or move real motors.

## It only edits the scene

The agent has three tools: the CAD tools, a to-do list, and web search. It can't run shell commands, read or write files on your computer, or change Basecase's settings. If it tries to use any other tool, Basecase blocks it and shows a “Blocked” toast with the tool's name.

You decide what the agent sees by attaching files. It can't see your selection, your other scenes, or your other chats.

## It works on your login and your computer

Each agent runs on your computer and uses your Claude, ChatGPT, or Google login, so its usage counts against your own plan. The agent needs an internet connection. The web studio doesn't include an agent.

Offline works without AI. It traces one outline from an image, or works from your words, to make a single extruded model. It can't edit the scene or use tools. If you send it a slash command or a problem from **Checks**, it answers in one line that points to **Settings** ▸ **Agent**.

## It reaches only the public web

The agent can read public web pages up to 8 MB and images up to 20 MB. It can't reach your local network or any private address.

## It has time and size limits

- A part's code gets 90 seconds to build, and the agent can raise that to 300 seconds. If the build takes longer, Basecase asks the agent to simplify the part.
- Basecase cuts off a part's name at 60 characters and its note at 400.
- You can run up to 4 chats at once in each scene.

When a run hits a limit, it ends in one of two ways:

- **Stopped**, with a **Continue** button.
- “Couldn’t finish”, with a **Retry** button.

## It doesn't drive hardware

**/operate** moves the robot in the simulation while Basecase keeps real motors locked. The agent can slice plates and report the print time and grams, but it never sends a print to a printer.

If the agent doesn't connect at all, see [Agent doesn't connect](/help/troubleshoot-app-agent-not-connected).
