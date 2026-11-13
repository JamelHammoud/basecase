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

Describe the controls you want for your robot, watch the agent build them into a running Case, and ask for changes while it runs.

The agent works in the desktop app. Its panels can't move one joint on its own, drive a second robot or save a file in this version.

1. In the **Agent** tab, describe the app, such as “Make a remote for the rover with big Wave, Dance, Sit and Stop buttons, and its speed over the canvas.”
2. Wait while the agent writes it. The Case opens running, and a panel reloads each time the agent fixes an error in it.

![The rover Case running with a remote on the left, its speed over the canvas and the agent on the right](/help/build-a-case-app-with-the-agent/app.png)

3. Use the app: press its buttons, or click **Try It** to start a try.
4. In the **Agent** tab beside the Case, type a change, such as “Add a Spin button”, and press Enter. Only the panel it changes reloads, so the robot and a running try keep going.
5. Click **Undo** at the top right to take back the agent's last change. Each change it makes is one step.
6. Click **Done** or press [[Esc]] to go back to the scene.

Outside a panel and a text field, [[⌘Z]] works like **Undo**, and [[⌘I]] shows or hides the agent.

[Run a Case](/help/run-a-case) explains the panels a Case can show and how a code panel reaches the robot.
