---
title: Link a build repair to Fleet
date: 2026-11-20
collection: build-and-print
type: task
order: 13
related:
  - repair-a-robot-build
covers:
  - src/components/build/BuildRepairFleet.tsx
  - src/fleet/buildReference.ts
  - src/fleet/browser/FleetBuildLink.tsx
  - src/fleet/browser/buildReference.ts
---

You can attach a saved build repair to an existing Fleet robot through authenticated inventory.

Before you begin, configure the Fleet address. Your Fleet account needs inventory read and manage access to the selected robot.

1. In **Builds**, open the build with a saved repair.
2. Under **Fleet**, click **Link Fleet Robot**.
3. In the Fleet browser, sign in to the robot's organization.
4. In the inventory, select the existing robot.
5. Click **Link Build**.

![Fleet inventory shows the existing Arm one robot with its saved build repair reference](/help/link-a-build-repair-to-fleet/inventory.png)

6. Save the downloaded reference file.
7. In the original build's **Fleet** section, click **Import Fleet Reference**.
8. Choose the downloaded file.

![Arm one’s Fleet section stores its organization and existing robot UUIDs](/help/link-a-build-repair-to-fleet/linked.png)

The reference contains identifiers and revision hashes, without credentials. During import, Basecase checks that the reference names this exact build and repair.

Fleet remains the authority for identity and access. You can't use a local reference to gain access after Fleet denies or revokes your permission.

You keep the existing robot, controller permissions and operational state when you link a build repair. You send no robot commands during linking.

You can [repair a robot build](/help/repair-a-robot-build) without a Fleet account.
