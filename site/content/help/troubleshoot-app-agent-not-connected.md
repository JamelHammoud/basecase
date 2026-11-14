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

If the agent can't answer, a banner at the top of the Agent tab gives the cause. Try the banner's button first, since it fixes most of these.

## “Downloading Claude Code…” stays on screen

Basecase downloads the agent the first time you use it. Claude Code is about 263 MB, Codex 340 MB and Gemini CLI 95 MB. The banner shows the download's progress as a percentage.

1. Keep Basecase open until the bar fills.
2. Send your message once the banner goes away.

After that first download, Basecase downloads the agent again only to update it to a newer version.

## “Couldn’t download Claude Code. Check your connection, then reconnect.”

Basecase fetches the agent from the npm registry (registry.npmjs.org). A firewall or proxy can block it.

1. Make sure you're online and that registry.npmjs.org isn't blocked.
2. Click **Reconnect** in the banner.

If the message says the agent “didn’t match its checksum,” the download arrived damaged. Click **Reconnect** to fetch it again.

## “Agent isn’t connected.”

The agent stopped or never started. Any text after the message gives the reason.

1. Click **Reconnect** in the banner.
2. If that doesn't work, press [[⌘,]] and choose **Agent**.
3. Under **Run with**, click the agent you want. Basecase restores its usual **Command** and reconnects.

If the message starts with “Couldn't start the agent:”, the **Command** in Settings is wrong, most often because someone edited it by hand. Step 3 fixes it.

If the message says the agent “isn’t available for this computer,” no download of that agent exists for your system. Pick another agent in **Run with**.

Once the agent connects, the line under **Command** reads “Connected to” followed by the agent's name.

## “Sign in to use Claude Code”

The agent runs on your own account, and this computer isn't signed in to it.

1. In the **Agent** tab, click the sign-in button in the banner.
2. Sign in using the browser window that opens.

If you use Gemini with a personal Google account, click **Add API Key** and paste a Gemini API key instead.

**Note:** On a Mac, if you deny Basecase access to its keychain item, Basecase can't read your saved key and the banner asks you for it again.

## A reply ends with “Couldn’t finish.”

The agent hit an error, such as a usage limit on your account, and stopped. A toast starting with “The agent couldn’t finish.” shows the same reason.

1. Read the reason after the message.
2. Fix the cause, then click **Retry** under the reply.

A reply that says “Stopped on an error” with no reason means the agent failed. If **Retry** fails again, choose another agent under **Run with** in **Settings** ▸ **Agent**.

## “Up to 4 chats run at once. Stop one to start another.”

Stop one of the four running chats or wait for one to finish, then send your message again.

To pick an agent and switch between them, see [Choose the agent](/help/choose-the-agent).

## Gemini won't sign in with a Google account

Gemini CLI has dropped sign-in for personal Google accounts. Use an API key instead.

1. Create a Gemini API key with your Google account.
2. Click **Add API Key** in the banner.
3. Paste the key and press [[↩]].

## “isn’t available for this computer”

No build of that agent exists for your computer. In **Settings** ▸ **Agent**, pick another agent under **Run with**.

## The Agent tab offers a download instead

You're in the web studio, which doesn't include the agent. To get the agent, see [Install Basecase](/help/install-basecase).
