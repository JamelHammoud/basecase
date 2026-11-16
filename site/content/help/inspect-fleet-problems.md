---
title: Inspect fleet problems
date: 2026-11-15
collection: operate
type: task
order: 5
related:
  - keep-a-robot-session-as-a-try
  - the-motor-lock-and-safety-ladder
  - case-goals-worlds-and-contracts
covers:
  - src/components/operate/FleetIncidents.tsx
  - src/components/operate/FleetRows.tsx
  - src/robot/fleetIncidents.ts
  - src/workspace/useOperateAlerts.ts
---

Find a robot's fault or Case alert, acknowledge it, and open the try that captured it.

1. In Play, choose **Operate**.
2. In the robot's fleet row, click **Inspect Problems**.

![Two emulated arms with a problem on arm-2](/help/inspect-fleet-problems/fleet.png)

![The active stall on arm-2 with its recorded try](/help/inspect-fleet-problems/active.png)

3. In the incident, click **Acknowledge**.

![The stall remains active after acknowledgment](/help/inspect-fleet-problems/acknowledged.png)

4. For an incident with a kept try, click **Open Try**.

![The stalled arm's try open in the timeline](/help/inspect-fleet-problems/try.png)

Or press [[⌘K]] and choose **Inspect Problems for ⟨unit⟩**.

Click Acknowledge to record that you saw the incident. The [motor lock and safety ladder](/help/the-motor-lock-and-safety-ladder) continue to control movement.

For task alerts, configure the Case's [contract conditions](/help/case-goals-worlds-and-contracts#operate-alerts).
