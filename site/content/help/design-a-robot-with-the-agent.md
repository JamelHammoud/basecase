---
title: Design a robot with the agent
date: 2026-11-13
updated: 2026-11-13
collection: agent
type: task
order: 3
popular: true
keywords:
  - prompt
  - generate a robot
  - ask ai
  - text to cad
  - describe
  - build from photo
related:
  - requests-that-get-good-results
  - get-a-robot-ready-to-build
covers:
  - src/components/agent/Composer.tsx
  - src/components/agent/CyclingPlaceholder.tsx
  - src/components/agent/ReplyActions.tsx
  - src/workspace/useAgentRun.ts
---

Describe the robot you want in a sentence or two, and the agent models it in the scene with real parts.

The agent works in the desktop app. Before you start, set it up. See [Choose the agent](/help/choose-the-agent).

1. Click **+** after the last tab to start a blank scene.
2. Click **Agent** at the top of the right panel.
3. Type what you want the agent to build. Include its size and what it should do. For example: “Pan-tilt camera mount for a Raspberry Pi camera, two STS3215 servos, 15 cm tall.”
4. To show it what you mean, click **+** in the composer and choose **Attach Images**.
5. Press [[↩]].
6. Watch the scene while the agent works. Each step shows up in the chat as it happens.
7. When it's done, read its summary, which ends with two or three suggestions for what to do next.
8. To change the design, type a follow-up such as “Use M3 screws” or “Thicker brackets”, then press [[↩]].

A bigger robot can take many steps, so you can keep working in another tab while you wait. If the agent finishes in a scene you're not looking at, a toast shows the name of the chat. Click **Show** to go back to it.

If a run stops partway, click **Continue** under the reply. If it fails, click **Retry**.

For ways to get better results, see [Requests that get good results](/help/requests-that-get-good-results). When your design is done, [get it ready to build](/help/get-a-robot-ready-to-build).
