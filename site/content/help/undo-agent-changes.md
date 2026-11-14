---
title: Undo what the agent changed
date: 2026-11-13
updated: 2026-11-13
collection: agent
type: task
order: 7
keywords:
  - undo
  - revert
  - roll back
  - restore
  - mistake
related:
  - steer-or-queue-messages
  - the-design-agent
covers:
  - src/components/agent/ReplyActions.tsx
  - src/workspace/useLaneControls.ts
  - src/workspace/applyAgentOps.ts
  - src/workspace/docHistory.ts
---

You can take back one step of the agent's work, or everything it changed in its last run.

## Undo one step

1. Press [[⌘Z]].

Each change the agent makes, such as adding parts, reshaping a part or writing a Case's code panel, is one undo step. To go further back, press [[⌘Z]] again, up to 50 steps.

While a Case is running, [[⌘Z]] only steps back through code panel changes, and it stops when it reaches any other kind of change.

## Revert a whole run

1. Under the agent's last reply, click **Revert Changes**.

Only the parts that the run changed go back. Your own edits stay, and so do any code panels the agent wrote, so undo those step by step.

A toast appears that says “Reverted agent changes.” If you change your mind, click **Undo** in the toast.

**Note:** **Revert Changes** only appears under the last reply, and it's gone after you reload. You can still undo earlier runs step by step.

To stop the agent before it makes more changes, see [Steer or queue messages while the agent works](/help/steer-or-queue-messages).
