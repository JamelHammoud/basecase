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

The banner at the top of the Agent tab says why the agent can't answer, and its button is usually the fix.

## “Downloading Claude Code…” stays on screen

Basecase downloads the agent the first time you use it. Claude Code is about 263 MB, Codex 340 MB and Gemini CLI 95 MB. The banner shows the percent.

1. Keep Basecase open until the bar fills.
2. Send your message once the banner is gone.

It only downloads again when the app updates to a newer agent.

## “Couldn’t download Claude Code. Check your connection, then reconnect.”

The download failed. It comes from the npm registry, registry.npmjs.org, which a firewall or proxy may block.

1. Check you're online, and that registry.npmjs.org isn't blocked.
2. Click **Reconnect** in the banner.

A message that the agent “didn’t match its checksum” means the download arrived damaged. Click **Reconnect** to fetch it again.

## “Agent isn’t connected.”

The agent stopped or never started. The text after it, when there is any, says why.

1. Click **Reconnect** in the banner.
2. If it still fails, press ⌘, (Ctrl+, on Windows) and choose **Agent**.
3. Under **Run with**, click the agent you want. That puts back its usual **Command** and reconnects.

“Couldn't start the agent:” means the **Command** in Settings is wrong, often after you edited it. Step 3 fixes it. A message that the agent “isn’t available for this computer” means there's no download for your system; pick another agent in **Run with**.

It worked when the line under **Command** reads “Connected to” and the agent's name.

## “Sign in to use Claude Code”

The agent runs with your own account, and it isn't signed in on this computer.

1. In the **Agent** tab, click the sign-in button in the banner.
2. Finish signing in in the browser window that opens.

For Gemini with a personal Google account, click **Add API Key** and paste a Gemini API key instead. On a Mac, if you deny Basecase access to its keychain item, a saved key reads as missing and the banner asks again.

## A reply ends with “Couldn’t finish.”

The agent stopped with an error of its own, such as a usage limit on your account. A toast starting “Agent error.” shows the same reason.

1. Read the reason after the message.
2. Click **Retry** under the reply once the cause is gone.

## “Up to 4 chats run at once. Stop one to start another.”

Four chats are already working. Stop one, or wait for it to finish, then send again.

Which agent to use, and how to switch, is in [Choose the agent](/help/choose-the-agent).

## Gemini won't sign in with a Google account

Google no longer signs personal accounts in to Gemini CLI.

1. Make a Gemini API key with your Google account.
2. In the banner, click **Add API Key**.
3. Paste the key and press Enter.

## “isn’t available for this computer”

That agent has no build for your computer. Pick another agent under **Run with** in **Settings** ▸ **Agent**.

## The Agent tab offers a download instead

You're in the web studio, which has no agent. [Install Basecase](/help/install-basecase) to use it.
