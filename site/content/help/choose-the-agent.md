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
  - src/components/settings/AgentPane.tsx
  - src/agent/agentKinds.ts
  - src/components/agent/ConnectionBanner.tsx
  - electron/backend/agentRuntimes.mjs
  - electron/backend/agentKeys.mjs
---

You can design with Claude Code, Codex or Gemini CLI using your own login. Or choose Offline, which traces outlines without AI.

1. Press [[⌘,]] to open Settings, then choose **Agent**.
2. Under **Run with**, click **Claude**, **Codex**, **Gemini** or **Offline**.
3. Wait until the line under **Command** reads “Connected to” followed by the agent's name.

![The Agent pane in Settings](/help/choose-the-agent/agent-pane.png)

To open the same pane from [[⌘K]], choose **Agent Settings**.

The first time you pick an agent, Basecase downloads it. Claude Code is 263 MB, Codex is 340 MB and Gemini CLI is 95 MB. You can follow the download progress in the Agent tab.

## Sign in

Each agent signs in with a different account:

- Claude Code uses your Claude login.
- Codex uses your ChatGPT login.
- Gemini CLI uses your Google login.

To sign in:

1. If Settings tells you to sign in, open the **Agent** tab.
2. Click the sign-in button in the banner at the top, then finish signing in in your browser.

**Note:** Google no longer lets personal accounts sign in to Gemini CLI. If you have a personal account, click **Add API Key** in the banner, paste a Gemini API key, then press [[↩]]. Basecase keeps the key encrypted on your computer.

To pick a model within the agent, see [Choose a model and effort](/help/choose-a-model).
