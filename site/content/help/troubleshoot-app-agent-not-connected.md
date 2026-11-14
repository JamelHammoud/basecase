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
  - src/agent/agentKinds.ts
  - electron/backend/agentRuntimes.mjs
  - electron/backend/acpAgent.mjs
  - electron/backend/agentKeys.mjs
  - src/workspace/useAgentRun.ts
  - src/workspace/useAgentChat.ts
---

If the agent can't answer, read the banner at the top of the Agent tab. It names the cause, and its button fixes most of them.

## “Downloading Claude Code…” stays on screen

The first time you use the agent, Basecase downloads it. Claude Code is about 263 MB, Codex 340 MB and Gemini CLI 95 MB. The banner shows how much has downloaded as a percentage.

1. Keep Basecase open until the bar fills.
2. When the banner goes away, send your message.

After that, Basecase downloads the agent again only to update it to a newer version.

## “Couldn’t download Claude Code. Check your connection, then reconnect.”

The download failed. Basecase gets the agent from the npm registry (registry.npmjs.org), and a firewall or proxy may be blocking it.

1. Make sure you're online and that registry.npmjs.org isn't blocked.
2. Click **Reconnect** in the banner.

If the message says the agent “didn’t match its checksum,” the download arrived damaged. Click **Reconnect** to download it again.

## “Agent isn’t connected.”

The agent stopped or never started. Any text after the message gives the reason.

1. Click **Reconnect** in the banner.
2. If that doesn't work, press [[⌘,]] and choose **Agent**.
3. Under **Run with**, click the agent you want. Basecase puts back its usual **Command** and reconnects.

If the message starts with “Couldn't start the agent:”, the **Command** in Settings is wrong. Most often someone edited it. Step 3 fixes it.

If the message says the agent “isn’t available for this computer,” there's no download of it for your system. Pick another agent in **Run with**.

Once the agent connects, the line under **Command** reads “Connected to” followed by the agent's name.

## “Sign in to use Claude Code”

The agent runs on your own account, and you haven't signed in to that account on this computer.

1. In the **Agent** tab, click the sign-in button in the banner.
2. Finish signing in using the browser window that opens.

If you use Gemini with a personal Google account, click **Add API Key** and paste a Gemini API key.

On a Mac, if you deny Basecase access to its keychain item, Basecase treats your saved key as missing and the banner asks for it again.

## A reply ends with “Couldn’t finish.”

The agent hit an error and stopped. A usage limit on your account is a common cause. A toast starting with “The agent couldn’t finish.” gives the same reason.

1. Read the reason after the message.
2. When you've dealt with the cause, click **Retry** under the reply.

If you see “Stopped on an error” with no reason, the agent itself failed. If **Retry** fails again, go to **Settings** ▸ **Agent** and choose another agent under **Run with**.

## “Up to 4 chats run at once. Stop one to start another.”

You have four chats running. Stop one or wait for one to finish, then send your message again.

## Gemini won't sign in with a Google account

Gemini CLI no longer lets personal Google accounts sign in, so use an API key.

1. Create a Gemini API key with your Google account.
2. In the banner, click **Add API Key**.
3. Paste the key and press [[↩]].

## “isn’t available for this computer”

Your computer has no build of that agent. Go to **Settings** ▸ **Agent** and pick another agent under **Run with**.

See [Choose the agent](/help/choose-the-agent) for which agent to use and how to switch.

## The Agent tab offers a download instead

You're in the web studio, which doesn't include the agent. To use the agent, see [Install Basecase](/help/install-basecase).
