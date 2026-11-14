---
title: Agent isn't connected or asks you to sign in
date: 2026-11-13
updated: 2026-11-13
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

When the agent can't answer, the banner at the top of the Agent tab tells you why. Most of the time, clicking the button in the banner fixes it.

## “Downloading Claude Code…” stays on screen

The first time you use the agent, Basecase downloads it. Claude Code is about 263 MB, Codex is 340 MB, and Gemini CLI is 95 MB. The banner shows the download's progress as a percentage.

1. Keep Basecase open until the bar fills.
2. When the banner goes away, send your message.

After that, the agent downloads again only when Basecase updates to a newer version of it.

## “Couldn’t download Claude Code. Check your connection, then reconnect.”

The download failed. Basecase gets the agent from the npm registry (registry.npmjs.org), and a firewall or proxy may be blocking it.

1. Make sure you're online and that registry.npmjs.org isn't blocked.
2. Click **Reconnect** in the banner.

If the message says the agent “didn’t match its checksum,” the download arrived damaged. Click **Reconnect** to download it again.

## “Agent isn’t connected.”

The agent stopped, or it never started. If there's more text after the message, it tells you why.

1. Click **Reconnect** in the banner.
2. If that doesn't work, press [[⌘,]] and choose **Agent**.
3. Under **Run with**, click the agent you want. This puts back its usual **Command** and reconnects.

If the message starts with “Couldn't start the agent:”, the **Command** in Settings is wrong, usually because someone edited it. Step 3 puts it back.

If the message says the agent “isn’t available for this computer,” there's no download for your system. Pick another agent in **Run with**.

Once the agent connects, the line under **Command** reads “Connected to” followed by the agent's name.

## “Sign in to use Claude Code”

The agent runs with your own account, and that account isn't signed in on this computer.

1. In the **Agent** tab, click the sign-in button in the banner.
2. Finish signing in through the browser window that opens.

If you use Gemini with a personal Google account, click **Add API Key** and paste a Gemini API key instead.

On a Mac, if you deny Basecase access to its keychain item, your saved key counts as missing and the banner asks for it again.

## A reply ends with “Couldn’t finish.”

The agent ran into an error and stopped. For example, your account may have hit a usage limit. A toast that starts with “The agent couldn’t finish.” shows the same reason.

1. Read the reason after the message.
2. Once you've fixed the cause, click **Retry** under the reply.

## “Up to 4 chats run at once. Stop one to start another.”

Four chats are already working. Stop one, or wait for one to finish, then send your message again.

To learn which agent to use and how to switch, see [Choose the agent](/help/choose-the-agent).

## Gemini won't sign in with a Google account

Gemini CLI no longer lets personal Google accounts sign in. Use an API key instead.

1. Create a Gemini API key with your Google account.
2. In the banner, click **Add API Key**.
3. Paste the key and press [[↩]].

## “isn’t available for this computer”

There's no build of that agent for your computer. Go to **Settings** ▸ **Agent** and pick another agent under **Run with**.

## The Agent tab offers a download instead

You're using the web studio, which doesn't include the agent. To use the agent, see [Install Basecase](/help/install-basecase).
