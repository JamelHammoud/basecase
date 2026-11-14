---
title: Agent isn't connected or asks you to sign in
date: 2026-11-13
updated: 2026-11-14
collection: troubleshooting
type: troubleshooting
order: 7
keywords:
  - agent not responding
  - claude code
  - codex
  - gemini
  - reconnect
  - download failed
  - login
  - api key
  - usage limit
related:
  - choose-the-agent
  - troubleshoot-app-web-studio-limits
covers:
  - src/components/agent/ConnectionBanner.tsx
  - src/components/SettingsWindow.tsx
  - src/components/settings/AgentPane.tsx
  - src/agent/agentKinds.ts
  - electron/backend/agentRuntimes.mjs
  - electron/backend/acpAgent.mjs
  - electron/backend/agentKeys.mjs
  - src/workspace/useAgentRun.ts
  - src/workspace/useAgentChat.ts
---

The banner at the top of the Agent tab tells you why the agent can't answer. For most problems, the button in the banner fixes it.

## “Downloading Claude Code…” stays on screen

Basecase downloads the agent the first time you use it. Claude Code is about 263 MB, Codex 340 MB and Gemini CLI 95 MB. The banner shows the download's progress as a percentage.

1. Keep Basecase open until the bar fills.
2. When the banner goes away, send your message.

After that, Basecase downloads the agent again only to update it to a newer version.

## “Couldn’t download Claude Code. Check your connection, then reconnect.”

Basecase gets the agent from the npm registry (registry.npmjs.org). A firewall or proxy may be blocking it.

1. Make sure you're online and that registry.npmjs.org isn't blocked.
2. Click **Reconnect** in the banner.

If the message says the agent “didn’t match its checksum,” the file arrived damaged. Click **Reconnect** to download a fresh copy.

## “Agent isn’t connected.”

The agent stopped or never started. Any text after the message gives the reason.

1. Click **Reconnect** in the banner.
2. If that doesn't work, press [[⌘,]] and choose **Agent**.
3. Under **Run with**, click the agent you want. This restores its usual **Command** and reconnects.

If the message starts with “Couldn't start the agent:”, the **Command** in Settings is wrong, usually because it was edited. Step 3 fixes it.

If the message says the agent “isn’t available for this computer,” there's no download for your system. Choose a different agent in **Run with**.

When the agent connects, the line under **Command** reads “Connected to” followed by the agent's name.

## “Sign in to use Claude Code”

The agent runs on your own account, and you haven't signed in to it on this computer.

1. In the **Agent** tab, click the sign-in button in the banner.
2. Complete the sign-in in the browser window that opens.

If you use Gemini with a personal Google account, click **Add API Key** and paste in a Gemini API key instead.

**Note:** On a Mac, if you deny Basecase access to its keychain item, Basecase treats your saved key as missing and the banner asks for it again.

## A reply ends with “Couldn’t finish.”

The agent hit an error, such as a usage limit on your account, and stopped. A toast starting with “The agent couldn’t finish.” gives the same reason.

1. Read the reason after the message.
2. When you've taken care of the cause, click **Retry** under the reply.

If the reply says “Stopped on an error” with no reason, the agent itself failed. If **Retry** fails again, choose a different agent under **Run with** in **Settings** ▸ **Agent**.

## “Up to 4 chats run at once. Stop one to start another.”

Stop one of the four running chats or wait for one to finish, then send your message again.

To learn which agent to use and how to switch, see [Choose the agent](/help/choose-the-agent).

## Gemini won't sign in with a Google account

Gemini CLI no longer lets personal Google accounts sign in. Use an API key instead.

1. Create a Gemini API key with your Google account.
2. In the banner, click **Add API Key**.
3. Paste the key and press [[↩]].

## “isn’t available for this computer”

That agent has no build for your computer. Go to **Settings** ▸ **Agent** and choose a different agent under **Run with**.

## The Agent tab offers a download instead

The web studio you're using doesn't include the agent. To use the agent, see [Install Basecase](/help/install-basecase).
