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

If the agent can't answer, read the banner at the top of the Agent tab. It names the problem, and in most cases its button fixes it.

## “Downloading Claude Code…” stays on screen

Basecase downloads the agent the first time you use it: about 263 MB for Claude Code, 340 MB for Codex and 95 MB for Gemini CLI. The banner shows the download's progress as a percentage.

1. Keep Basecase open until the bar fills.
2. Send your message once the banner goes away.

After that, Basecase downloads the agent again only when it updates to a newer version.

## “Couldn’t download Claude Code. Check your connection, then reconnect.”

The download failed. Basecase gets the agent from the npm registry (registry.npmjs.org), and a firewall or proxy may be blocking it.

1. Check that you're online and that nothing blocks registry.npmjs.org.
2. Click **Reconnect** in the banner.

If the message says the agent “didn’t match its checksum,” the download arrived damaged. Click **Reconnect** to download a fresh copy.

## “Agent isn’t connected.”

The agent stopped or never started. Any text after the message gives the reason.

1. Click **Reconnect** in the banner.
2. If the agent stays disconnected, press [[⌘,]] and choose **Agent**.
3. Under **Run with**, click the agent you want. Basecase restores its usual **Command** and reconnects.

If the message starts with “Couldn't start the agent:”, the **Command** in Settings is wrong, often after an edit. Step 3 resets it.

If the message says the agent “isn’t available for this computer,” Basecase has no download for your system. Pick another agent in **Run with**.

Once the agent connects, the line under **Command** reads “Connected to” and the agent's name.

## “Sign in to use Claude Code”

The agent runs on your own account, and you haven't signed in to that account on this computer.

1. In the **Agent** tab, click the sign-in button in the banner.
2. Finish signing in through the browser window that opens.

For Gemini with a personal Google account, click **Add API Key** and paste a Gemini API key instead.

**Note:** On a Mac, if you deny Basecase access to its keychain item, Basecase treats your saved key as missing and the banner asks for it again.

## A reply ends with “Couldn’t finish.”

The agent hit an error and stopped. For example, your account may have reached a usage limit. A toast starting with “The agent couldn’t finish.” gives the same reason.

1. Read the reason after the message.
2. Once you've fixed the cause, click **Retry** under the reply.

“Stopped on an error” with no reason means the agent failed on its own side. If **Retry** fails again, go to **Settings** ▸ **Agent** and choose another agent under **Run with**.

## “Up to 4 chats run at once. Stop one to start another.”

Four chats are running. Stop one or let one finish, then resend your message.

To learn which agent to use and how to switch, see [Choose the agent](/help/choose-the-agent).

## Gemini won't sign in with a Google account

Gemini CLI no longer accepts sign-in from personal Google accounts, so use an API key.

1. Create a Gemini API key with your Google account.
2. Click **Add API Key** in the banner.
3. Paste the key and press [[↩]].

## “isn’t available for this computer”

Basecase has no build of that agent for your computer. Go to **Settings** ▸ **Agent** and pick another agent under **Run with**.

## The Agent tab offers a download instead

You're in the web studio, which doesn't include the agent. See [Install Basecase](/help/install-basecase) to get it.
