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

Correct the agent mid-run, or line up your next requests, without waiting for it to finish.

## Steer the agent

1. While the agent works, type the correction, such as “Make the legs longer”.
2. Press [[↩]].

With Claude and Codex, the agent reads it right away and changes course. Gemini can't be steered, so the message waits at the front of the queue instead.

## Queue a message

1. While the agent works, type the next request.
2. Press [[⌘↩]].

You can also right-click the send button and choose **Queue**. Queued messages show above the composer and send one at a time after the run. Click one to edit it. Hover one to click **Send now** or **Delete**. Delete asks first. Drag a message to change the order.

## Stop the agent

1. Click the round stop button in the composer.

Pressing [[Esc]] in an empty composer stops it too. Stopping also pauses the queue. Queued messages are lost if Basecase reloads.

To take back what the agent changed, see [Undo what the agent changed](/help/undo-agent-changes).
