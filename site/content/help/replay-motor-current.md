---
title: Replay motor current
date: 2026-11-20
collection: engineer
type: task
covers:
  - src/components/build/PowerReplayInspection.tsx
  - src/components/build/PowerReplayFields.tsx
  - src/components/build/PowerReplayResult.tsx
  - src/wiring/powerReplayPreparation.ts
  - src/wiring/powerReplayRecord.ts
hub_the_design_agent: |
  [Replay motor current](/help/replay-motor-current) uses the modeled current windows retained by peak design verification.
  Enter source and conductor resistance to inspect voltage drop without changing motion or calibration.
hub_checks_and_blockers: |
  [Replay motor current](/help/replay-motor-current) locates modeled voltage drop using a frozen current trace and evidenced cable resistance.
  Replay preserves Checks as the build verdict.
related:
  - build-checks
  - servo-torque-and-sizing
---

Use modeled motor loads and explicit source and conductor resistance to locate voltage drop along the robot's power wiring.

Start with a saved modeled current trace from the agent's design verification with peak loads and a trained walk policy.
You can replay one DC source and paired cable trees. You can't use replay with regulators, carrier boards or ambiguous actuator allocations.

1. In **Build** ▸ **Electrical connections**, click **Inspect Current**.
2. For the source, enter **Source resistance (Ω)**, **Source evidence**, **Temperature (°C)**, **Maximum current (A)** and **Minimum voltage (V)**.
3. In **Junction evidence**, document outgoing and return continuity through each ideal harness junction.
4. For each cable, enter **Outgoing resistance (Ω)**, **Return resistance (Ω)**, **Temperature (°C)** and **Evidence**.
5. For each remaining electrical load, enter **Load current (A)** and **Load evidence**.
6. Click **Replay**.

![Current replay shows the generated pan-tilt's modeled trace and lowest endpoint voltage](/help/replay-motor-current/replay.png)

7. Click **Select Lowest Voltage** to select its part and trace time.
8. After changing a resistance, click **Compare** to replay the same frozen load trace.

![The resistance comparison selects the pan-tilt motor and overlays its endpoint voltage](/help/replay-motor-current/compare.png)

Reopen the inspection to reproduce its retained inputs. Switching scenes closes the inspection and keeps the saved runs.
If you edit the wiring or source, you keep the old result as historical evidence and can no longer compare results.

![Historical current replay preserves the original result after a wiring edit](/help/replay-motor-current/historical.png)

To start again after electrical edits:

9. In the inspection footer, click **Delete**.
10. In the confirmation, click **Delete** to clear the retained runs.

Repeat steps 2–6 to replay current inputs.
Or press [[⌘K]] and choose **Inspect Current** to open the inspection.

You can't establish resistance from cable length. If you enter zero, document evidence for that model assumption.
You keep the recorded window interval, but can't determine sub-window brownouts or switching transients from the replay.
You can replay current without changing motion, calibration or robot commands.
Use Checks for the build verdict. Read [Checks and blockers](/help/checks-and-blockers) for readiness requirements.
