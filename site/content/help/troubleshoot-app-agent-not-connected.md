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

If the agent can't answer, check the banner at the top of the Agent tab. The banner says what's wrong, and in most cases its button fixes the problem.

## “Downloading Claude Code…” stays on screen

The first time you use the agent, Basecase downloads it. The download is about 263 MB for Claude Code, 340 MB for Codex and 95 MB for Gemini CLI. The banner shows the progress as a percentage.

1. Keep Basecase open until the bar fills.
2. Once the banner goes away, send your message.

After that, Basecase downloads the agent again only when it updates to a newer version.

## “Couldn’t download Claude Code. Check your connection, then reconnect.”

The download failed. Basecase gets the agent from the npm registry (registry.npmjs.org), so a firewall or proxy may be blocking it.

1. Make sure you're online and that nothing is blocking registry.npmjs.org.
2. Click **Reconnect** in the banner.

If the message says the agent “didn’t match its checksum,” the downloaded file was damaged. Click **Reconnect** to download a fresh copy.

## “Agent isn’t connected.”

The agent stopped, or it never started. Any text after the message gives the reason.

1. Click **Reconnect** in the banner.
2. If the agent is still disconnected, press [[⌘,]] and choose **Agent**.
3. Under **Run with**, click the agent you want. Basecase restores its usual **Command** and reconnects.

If the message starts with “Couldn't start the agent:”, the **Command** in Settings is wrong. This often happens after someone edits it. Step 3 resets it.

If the message says the agent “isn’t available for this computer,” Basecase doesn't have a download for your system. Pick another agent in **Run with**.

Once the agent connects, the line under **Command** reads “Connected to” followed by the agent's name.

## “Sign in to use Claude Code”

The agent runs on your own account, and you haven't signed in to that account on this computer yet.

1. In the **Agent** tab, click the sign-in button in the banner.
2. Finish signing in through the browser window that opens.

If you use Gemini with a personal Google account, click **Add API Key** and paste a Gemini API key instead.

**Note:** On a Mac, if you deny Basecase access to its keychain item, Basecase treats your saved key as missing and asks for it again in the banner.

## A reply ends with “Couldn’t finish.”

The agent ran into an error and stopped. For example, your account may have reached a usage limit. A toast starting with “The agent couldn’t finish.” also appears with the same reason.

1. Read the reason after the message.
2. Once you've fixed the cause, click **Retry** under the reply.

If you see “Stopped on an error” with no reason, the agent failed on its own side. If **Retry** fails again, go to **Settings** ▸ **Agent** and choose another agent under **Run with**.

## “Up to 4 chats run at once. Stop one to start another.”

You already have four chats running. Stop one or wait for one to finish, then send your message again.

To learn which agent to use and how to switch, see [Choose the agent](/help/choose-the-agent).

## Gemini won't sign in with a Google account

Gemini CLI no longer accepts sign-in from personal Google accounts. Use an API key instead.

1. Create a Gemini API key with your Google account.
2. Click **Add API Key** in the banner.
3. Paste the key and press [[↩]].

## “isn’t available for this computer”

Basecase doesn't have a build of that agent for your computer. Go to **Settings** ▸ **Agent** and pick another agent under **Run with**.

## The Agent tab offers a download instead

You're using the web studio, which doesn't include the agent. To get it, see [Install Basecase](/help/install-basecase).
