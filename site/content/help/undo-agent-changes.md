---
title: Undo what the agent changed
date: 2026-11-13
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

Board edits also undo saved placements and mounting-hardware references alongside the scene parts. See [Fit an electronics board](/help/fit-an-electronics-board).

A batch of [shared parameter edits](/help/link-dimensions-with-shared-parameters) is one undo step. Undo restores its declarations, dimensional requirements, bindings and regenerated parts together. Manufacturing deviations return with their parameters.

While a Case is running, [[⌘Z]] only steps back through code panel changes, and it stops when it reaches any other kind of change.

## Revert a whole run

1. Under the agent's last reply, click **Revert Changes**.

Each part returns to its state before the run first changed it. Required design dependencies go back with it. A conflicting later edit blocks the revert, so it stays untouched.

A toast appears that says “Reverted agent changes.” If you change your mind, click **Undo** in the toast.

**Revert Changes** remains available after reopening a completed chat when its touched-part list was saved. Interrupted runs without that list remain recoverable through [Scene History](/help/save-and-merge-robot-versions).

To stop the agent before it makes more changes, see [Steer or queue messages while the agent works](/help/steer-or-queue-messages).
