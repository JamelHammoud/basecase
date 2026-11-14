---
title: Build a Case app with the agent
date: 2026-11-13
collection: simulate-and-train
type: task
order: 6
keywords:
  - app
  - code panel
  - remote
  - controls
  - write_case_code
  - live edit
  - undo
related:
  - run-a-case
  - make-a-case
  - arrange-a-case-console
covers:
  - src/workspace/agentCaseCodeRequests.ts
  - src/cases/console/codeEdits.ts
  - src/cases/console/codeReports.ts
  - src/workspace/RightPanel.tsx
  - src/workspace/useAgentRun.ts
  - electron/cad-mcp/caseCodeTools.mjs
  - electron/cad-agent-prompt.mjs
---

Tell the agent what controls you want for your robot, and it builds them into a running Case. You can keep asking for changes while the Case runs.

**Note:** The agent works in the desktop app. In this version, the panels it builds can't move a single joint on its own, drive a second robot, or save a file.

1. In the **Agent** tab, describe the app you want. For example: “Make a remote for the rover with big Wave, Dance, Sit and Stop buttons, and its speed over the canvas.”
2. Wait while the agent writes the app. When it's done, the Case opens and starts running. If the agent fixes an error in a panel, that panel reloads.

![The rover Case running with a remote on the left, its speed over the canvas and the agent on the right](/help/build-a-case-app-with-the-agent/app.png)

3. Use the app. Press its buttons, or click **Try It** to start a run of it.
4. In the **Agent** tab beside the Case, type a change, such as “Add a Spin button”, then press [[↩]]. Only the panel that changes reloads. The robot and any running try keep going.
5. To undo the agent's last change, click **Undo** at the top right. Each change the agent makes counts as one undo step.
6. To go back to the scene, click **Done** or press [[Esc]].

Outside a panel or text field, [[⌘Z]] does the same thing as **Undo**, and [[⌘I]] shows or hides the agent.

To move, resize, add or delete panels yourself, see [Arrange a Case's console](/help/arrange-a-case-console). The agent reads your layout and keeps it when it changes a panel.

To learn which panels a Case can show and how a code panel reaches the robot, see [Run a Case](/help/run-a-case).
