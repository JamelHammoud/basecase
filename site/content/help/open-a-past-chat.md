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

You can go back to an earlier conversation with the agent, or start a new one while your current chat keeps working.

## Open a past chat

1. Click **Agent** at the top of the right panel.
2. Click **Agent** again to open **History**.
3. Click the chat you want to open.

History groups your chats by when you last used them. Chats that are working appear under **Running**. Each chat takes its name from its first message.

To delete a chat, hover over it in **History**, then click **Delete**. Basecase asks you to confirm first. You can't undo a delete.

## Start a new chat

1. Click the **New chat** button beside the composer.

You can also find **New Chat** in [[⌘K]].

If your current chat is still working, it keeps going in the background. Each scene can run up to 4 chats at once.

A new chat starts with a clean memory, which helps when the **Context** bar in the model menu is nearly full.

**Note:** Chats save on your computer. A `.basecase` file you share doesn't include them, and the web studio doesn't save them.
