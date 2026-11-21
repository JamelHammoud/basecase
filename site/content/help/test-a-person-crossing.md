---
title: Test a person crossing
date: 2026-11-20
collection: simulate-and-train
keywords:
  - person
  - crossing
  - encounter
  - moving people
related:
  - make-a-case
  - scrub-a-try-on-the-timeline
covers:
  - src/components/cases/CaseWorldSection.tsx
  - src/components/cases/PersonEditor.tsx
  - src/components/cases/PersonRouteEditor.tsx
  - src/cases/personAuthoring.ts
  - src/cases/personEncounter.ts
  - src/cases/personGeometry.ts
  - src/sim/worldMoves.ts
  - src/sim/recordedFrames.ts
---

Test your robot against a person following a timed route through a Case world.

1. In **Cases**, open the Case you want to test.
2. In **Simulate**, under **World**, choose **Add Person**.
3. In **Width**, enter the body width in millimeters.
4. In **Height**, enter the body height in millimeters.
5. In **Depth**, enter the body depth in millimeters.
6. In **Speed**, enter the route speed in millimeters per second.
7. In **Start**, enter the delay in seconds.
8. For each waypoint, enter its **X** and **Z** coordinates in world millimeters.
9. In **Pause**, enter the wait time at that waypoint in seconds.
10. Choose **Try It**.
11. After the person crosses, choose **Stop Try**.
12. In **Library**, open the robot's tries.
13. Open the saved try.
14. On the timeline, drag the playhead to the crossing.

![A crossing person's route and delayed start in the World section](/help/test-a-person-crossing/route.png)

![The person moving through the robot's Case during a live try](/help/test-a-person-crossing/running.png)

![The saved encounter open from Library on the try timeline](/help/test-a-person-crossing/playback.png)

Choose **Add Waypoint** to extend the route. You can choose **Add Person** from the command palette.

You keep the original Case goal for task success when you add a person. You add a named contact failure and keep the required observations in the existing contract.

People use six rigid boxes for visible geometry and collision. They follow the route you set without reacting to the robot.

You can add 2 to 32 waypoints on one level and set a pause of up to 10 seconds at each waypoint. Keep the route and start delay within a total of 600 seconds, and finish the route before the Case ends.

Basecase rejects routes through static obstacle bounds before simulation. Because Basecase uses conservative bounds, it can reject a route that would clear the detailed mesh geometry.

You see recorded body poses during saved playback. If you edit a route after recording a try, you don't change the crossing in that recording.

You can use these encounters as simulation evidence. You can't use them to establish human biomechanics or physical safety.

You can't use continuation checkpoints or Branch Try with person encounters. You can use recorded playback and command replay.
