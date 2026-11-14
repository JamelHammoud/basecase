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

If the agent can't answer, the banner at the top of the Agent tab tells you why. Clicking the button in the banner fixes most problems. To pick an agent or switch to another, see [Choose the agent](/help/choose-the-agent).

## “Downloading Claude Code…” stays on screen

Basecase downloads the agent the first time you use it. Claude Code is about 263 MB, Codex 340 MB and Gemini CLI 95 MB. The banner shows how much of the download is done as a percentage.

1. Keep Basecase open until the bar fills.
2. Send your message once the banner goes away.

After the first download, Basecase downloads the agent again only to update it to a newer version.

## “Couldn’t download Claude Code. Check your connection, then reconnect.”

The download failed. Basecase gets the agent from the npm registry (registry.npmjs.org), so a firewall or proxy may be blocking it.

1. Check that you're online and that registry.npmjs.org isn't blocked.
2. Click **Reconnect** in the banner.

If the message says the agent “didn’t match its checksum,” the download arrived damaged. Click **Reconnect** to download it again.

## “Agent isn’t connected.”

The agent stopped or never started. If there's text after the message, it gives the reason.

1. Click **Reconnect** in the banner.
2. If that doesn't work, press [[⌘,]] and choose **Agent**.
3. Under **Run with**, click the agent you want. Basecase restores its usual **Command** and reconnects.

If the message starts with “Couldn't start the agent:”, the **Command** in Settings is wrong, most often because someone edited it. Choosing the agent again in step 3 puts it back.

When the agent connects, the line under **Command** reads “Connected to” followed by the agent's name.

## “Sign in to use Claude Code”

The agent runs on your own account, and that account isn't signed in on this computer.

1. In the **Agent** tab, click the sign-in button in the banner.
2. Finish signing in through the browser window that opens.

On a Mac, if you deny Basecase access to its keychain item, Basecase treats your saved key as missing and asks for it again in the banner.

## A reply ends with “Couldn’t finish.”

The agent hit an error and stopped. A usage limit on your account is one example. A toast starting “The agent couldn’t finish.” also shows the reason.

1. Read the reason after the message.
2. When you've dealt with the cause, click **Retry** under the reply.

## “Up to 4 chats run at once. Stop one to start another.”

Four chats are already working. Stop one or wait for one to finish, then send your message again.

## Gemini won't sign in with a Google account

Gemini CLI no longer accepts sign-in from personal Google accounts. Use an API key instead.

1. Create a Gemini API key with your Google account.
2. In the banner, click **Add API Key**.
3. Paste the key and press [[↩]].

## “isn’t available for this computer”

Basecase has no build of that agent for your computer. Open **Settings** ▸ **Agent** and choose a different agent under **Run with**.

## The Agent tab offers a download instead

You're in the web studio, which doesn't include the agent. To use the agent, see [Install Basecase](/help/install-basecase).
