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
  - src/workspace/agentCostRequests.ts
---

Take back one step of the agent's work, or everything it changed in its last run.

## Undo one step

1. Press [[⌘Z]].

Each change the agent makes, such as adding parts, reshaping one or writing a Case's code panel, is one undo step. Press [[⌘Z]] again to go further back, up to 50 steps. While a Case runs, [[⌘Z]] steps back through code panel changes only and stops at any other change.

Counts of parts you own, which the agent records from an order you paste, aren't undo steps. Change those on their bill of materials line, as in [Count the parts you already own](/help/count-the-parts-you-own).

## Revert a whole run

1. Under the agent's last reply, click **Revert Changes**.

Only the parts that run changed go back; your own edits stay. Code panels it wrote stay too; undo those step by step. A toast reads “Reverted agent changes”, with **Undo** if you change your mind.

**Revert Changes** shows under the last reply only, and doesn't survive a reload. Earlier runs can still be undone step by step.

To stop the agent before it changes more, see [Steer or queue messages while the agent works](/help/steer-or-queue-messages).
