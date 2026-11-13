---
title: Choose the agent
date: 2026-11-12
updated: 2026-11-13
collection: agent
type: task
order: 1
keywords:
  - claude code
  - codex
  - gemini cli
  - offline
  - switch agent
  - sign in
  - login
  - api key
related:
  - the-design-agent
  - choose-a-model
covers:
  - src/components/SettingsWindow.tsx
  - src/agent/agentKinds.ts
  - src/components/agent/ConnectionBanner.tsx
  - electron/backend/agentRuntimes.mjs
  - electron/backend/agentKeys.mjs
---

Pick which agent designs with you: Claude Code, Codex or Gemini CLI with your own login, or Offline, which traces outlines without AI.

1. Press [[⌘,]] to open Settings, then choose **Agent**.
2. Under **Run with**, click **Claude**, **Codex**, **Gemini** or **Offline**.
3. Wait for the line under **Command** to read “Connected to” and the agent's name.

![The Agent pane in Settings](/help/choose-the-agent/agent-pane.png)

The first time you pick an agent, Basecase downloads it: 263 MB for Claude Code, 340 MB for Codex and 95 MB for Gemini CLI. The Agent tab shows the progress.

## Sign in

Each agent uses your own account: Claude Code your Claude login, Codex your ChatGPT login, and Gemini CLI your Google login.

1. If Settings says to sign in, open the **Agent** tab.
2. Click the sign-in button in the banner at the top, and finish signing in in your browser.

Google no longer signs personal accounts in to Gemini CLI. With a personal account, click **Add API Key** in the banner, paste a Gemini API key, and press Enter. Basecase keeps the key encrypted on your computer.

## Set a height

1. In **Target height**, type how tall the agent's designs should be, in millimeters.

Leave it at 0 to let the agent estimate. Basecase resets it to 0 each time it starts.

To pick a model within the agent, see [Choose a model and effort](/help/choose-a-model).
