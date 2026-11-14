---
title: Steer or queue messages while the agent works
date: 2026-11-13
updated: 2026-11-13
collection: agent
type: task
order: 5
keywords:
  - interrupt
  - stop
  - queue
  - steer
  - change course
  - send later
  - cancel
related:
  - design-a-robot-with-the-agent
  - undo-agent-changes
covers:
  - src/components/agent/Composer.tsx
  - src/components/agent/SendControls.tsx
  - src/components/agent/queue/QueuedMessages.tsx
  - src/workspace/useAgentRun.ts
---

While the agent works, you can correct it in the middle of a run or line up your next requests.

## Steer the agent

1. While the agent works, type your correction. For example, “Make the legs longer”.
2. Press [[↩]].

With Claude and Codex, the agent reads your message right away and changes course. You can't steer Gemini, so your message waits at the front of the queue instead.

## Queue a message

1. While the agent works, type your next request.
2. Press [[⌘↩]].

You can also right-click the send button and choose **Queue**.

Queued messages appear above the composer. When the run ends, Basecase sends them one at a time.

- To edit a queued message, click it.
- To send a message right away or remove it, hover over it, then click **Send now** or **Delete**. Basecase asks before it deletes a message.
- To change the order, drag a message.

## Stop the agent

1. Click the round stop button in the composer.

You can also press [[Esc]] when the composer is empty. Stopping the agent also pauses the queue.

**Note:** If Basecase reloads, you lose any queued messages.

To take back what the agent changed, see [Undo what the agent changed](/help/undo-agent-changes).
