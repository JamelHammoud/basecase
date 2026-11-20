---
title: Resume a robot build
date: 2026-11-20
collection: build-and-print
type: task
order: 10
hub_checks_and_blockers: |
  ## Checks in individual builds

  [Individual builds](/help/resume-a-robot-build) retain their original Checks and assembly-order limitations. Completing a step leaves blockers unchanged.
related:
  - build-along
  - build-checks
covers:
  - src/components/build/BuildRecordsSection.tsx
  - src/components/build/BuildCompletion.tsx
  - src/kit/buildRecords.ts
  - src/kit/frozenKit.ts
  - src/workspace/useFrozenBuildAlong.ts
---

You can track assembly progress for several robots made from the same design. For each build, you keep the geometry and instructions you started with.

Your design must meet the same part, actuator and plate requirements as a [manufacturing kit](/help/export-a-robot-kit).

1. In the right panel, click **Build**.
2. Under **Builds**, click **Make Build**.
3. In **Build name**, enter a name, such as Arm one.

![The Make Build dialog with Arm one entered as the build name](/help/resume-a-robot-build/name.png)

4. Click **Make**.
5. Under **Builds**, click the build's name.
6. After assembling the displayed step, click **Complete Step**.

![Arm one in Build Along with Mark Incomplete available after recording the first step](/help/resume-a-robot-build/completed.png)

7. Press [[→]] to move to the next step.

Basecase saves your place as you move between steps. You keep the same completed steps. Click **Mark Incomplete** to clear a step's completion.

![Arm two on its second step with Complete Step available and its own saved position](/help/resume-a-robot-build/navigation.png)

8. Click **Done** to return to the editable design.
9. After restarting Basecase, under **Builds**, click the build's name to resume.

![Builds lists Arm one and Arm two separately](/help/resume-a-robot-build/builds.png)

Repeat **Make Build** for another robot. Each build keeps its own name, position and completed steps. You can edit or rename the design without changing existing builds.

The saved Checks describe the design as it was when you created the build. Completing a step leaves blockers, print records, stock and robot movement permissions unchanged.

You can access your builds on this device, within this app or browser profile. You can store up to 100 builds and 256 MB of shared Kit content. Delete the last build using a Kit to free that content.

For temporary instructions without saved progress, use [Build Along](/help/build-along).
