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
covers:
  - src/workspace/agentCaseCodeRequests.ts
  - src/cases/console/codeEdits.ts
  - src/cases/console/codeReports.ts
  - src/workspace/RightPanel.tsx
  - src/workspace/useAgentRun.ts
  - electron/cad-mcp/caseCodeTools.mjs
  - electron/cad-agent-prompt.mjs
---

Tell the agent what controls you want for your robot, and it builds them into a running Case. While the Case runs, you can keep asking for changes.

**Note:** The agent works in the desktop app. In this version, the agent's panels can't move one joint on its own, drive a second robot, or save a file.

1. In the **Agent** tab, describe the app you want. For example: “Make a remote for the rover with big Wave, Dance, Sit and Stop buttons, and its speed over the canvas.”
2. Wait while the agent writes the app. The Case opens and runs. If the agent fixes an error in a panel, that panel reloads.

![The rover Case running with a remote on the left, its speed over the canvas and the agent on the right](/help/build-a-case-app-with-the-agent/app.png)

3. Use the app. Press its buttons, or click **Try It** to start a try.
4. To change the app, type a request in the **Agent** tab beside the Case, such as “Add a Spin button”, then press [[↩]]. Only the panel that changes reloads, so the robot and any running try keep going.
5. To take back the agent's last change, click **Undo** at the top right. Each change the agent makes is one undo step.
6. To go back to the scene, click **Done** or press [[Esc]].

When you're not in a panel or a text field, [[⌘Z]] works the same as **Undo**, and [[⌘I]] shows or hides the agent.

To learn which panels a Case can show and how a code panel reaches the robot, see [Run a Case](/help/run-a-case).
