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

When the agent can't answer, the banner at the top of the Agent tab names the cause, and its button fixes most problems.

## “Downloading Claude Code…” stays on screen

Basecase downloads the agent the first time you use it: about 263 MB for Claude Code, 340 MB for Codex and 95 MB for Gemini CLI. The banner shows the progress as a percentage.

1. Keep Basecase open until the bar fills.
2. Send your message once the banner goes away.

After that, Basecase downloads the agent again only to update it to a newer version.

## “Couldn’t download Claude Code. Check your connection, then reconnect.”

The download didn't finish. Basecase gets the agent from the npm registry (registry.npmjs.org), so a firewall or proxy may be blocking it.

1. Make sure you're online and that registry.npmjs.org isn't blocked.
2. Click **Reconnect** in the banner.

If the message says the agent “didn’t match its checksum,” the download arrived damaged. Click **Reconnect** to download it again.

## “Agent isn’t connected.”

The agent stopped or never started. If any text follows the message, it gives the reason.

1. Click **Reconnect** in the banner.
2. If that doesn't work, press [[⌘,]] and choose **Agent**.
3. Under **Run with**, click the agent you want. This restores its usual **Command** and reconnects.

A message that starts with “Couldn't start the agent:” means the **Command** in Settings is wrong, often because someone edited it. Step 3 fixes it.

If the message says the agent “isn’t available for this computer,” there's no download of it for your system. Pick a different agent in **Run with**.

Once the agent connects, the line under **Command** reads “Connected to” followed by the agent's name.

[Choose the agent](/help/choose-the-agent) covers which agent to use and how to switch.

## “Sign in to use Claude Code”

The agent runs on your own account, and you haven't signed in to it on this computer.

1. In the **Agent** tab, click the sign-in button in the banner.
2. Finish signing in using the browser window that opens.

If you use Gemini with a personal Google account, click **Add API Key** and paste a Gemini API key instead.

On a Mac, if you deny Basecase access to its keychain item, Basecase can't read your saved key, so it treats the key as missing and the banner asks for it again.

## A reply ends with “Couldn’t finish.”

The agent hit an error and stopped, often because your account reached a usage limit. A toast starting with “The agent couldn’t finish.” gives the same reason.

1. Read the reason after the message.
2. Once you've dealt with the cause, click **Retry** under the reply.

A reply that says “Stopped on an error” with no reason means the agent itself failed. If **Retry** fails again, go to **Settings** ▸ **Agent** and choose another agent under **Run with**.

## “Up to 4 chats run at once. Stop one to start another.”

Four chats are already working. Stop one or wait for one to finish, then send your message again.

## Gemini won't sign in with a Google account

Gemini CLI no longer accepts sign-in from personal Google accounts, so use an API key instead.

1. Create a Gemini API key with your Google account.
2. In the banner, click **Add API Key**.
3. Paste the key and press [[↩]].

## “isn’t available for this computer”

Basecase doesn't have a build of that agent for your computer. Go to **Settings** ▸ **Agent** and pick a different agent under **Run with**.

## The Agent tab offers a download instead

You're using the web studio, which doesn't include the agent. To use the agent, see [Install Basecase](/help/install-basecase).
