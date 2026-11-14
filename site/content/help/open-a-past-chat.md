---
title: Open a past chat or start a new one
date: 2026-11-13
updated: 2026-11-13
collection: agent
type: task
order: 8
keywords:
  - history
  - conversations
  - new chat
  - previous chat
  - delete chat
  - parallel
related:
  - design-a-robot-with-the-agent
  - choose-a-model
covers:
  - src/workspace/RightPanelTabs.tsx
  - src/components/ChatHistory.tsx
  - src/components/agent/Composer.tsx
  - src/workspace/slashPaletteCommands.tsx
  - src/workspace/agentLanes.ts
---

Go back to an earlier conversation with the agent, or start a fresh one while the current chat keeps working.

## Open a past chat

1. Click **Agent** at the top of the right panel.
2. Click **Agent** again to open **History**.
3. Click the chat.

Chats are grouped by when you last used them, and **Running** lists the ones at work now. A chat's name is its first message.

To delete a chat, hover it in **History** and click **Delete**. Basecase asks first, and you can't undo it.

## Start a new chat

1. Click the **New chat** button beside the composer.

**New Chat** is also in [[⌘K]].

A chat that's still working keeps going in the background. Each scene runs up to 4 chats at once. A new chat starts with a clean memory, which helps once the **Context** bar in the model menu nears full.

Chats stay on your computer. They aren't in a shared `.basecase` file, and the web studio doesn't save them.
