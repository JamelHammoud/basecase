---
title: Choose the agent
date: 2026-11-12
collection: agent
type: task
popular: true
covers:
  - src/components/SettingsWindow.tsx
  - src/agent/agentKinds.ts
  - src/components/agent/ConnectionBanner.tsx
---

Pick which agent designs with you in the Agent tab: Claude Code, Codex or Gemini CLI on your computer with your own login, or Offline, the built-in outline tracer.

1. Press ⌘, (Ctrl+, on Windows) to open Settings, then choose **Agent**. ⌘K → **Agent Settings** opens the same pane.
2. Under **Run with**, pick **Claude**, **Codex**, **Gemini** or **Offline**. Basecase reconnects right away, and the line under **Command** reads “Connected to Claude Code” once it's ready.
3. If that line asks you to sign in, open the **Agent** tab and click the sign-in button in the banner at its top. For Gemini with a personal Google account, click **Add API Key** and paste a Gemini API key instead.
4. Set **Target height** to how tall you want the agent's designs, in millimeters. Leave it at 0 to let the agent estimate.

![The Agent pane in Settings](/help/choose-the-agent/agent-pane.png)
