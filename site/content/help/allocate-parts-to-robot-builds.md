---
title: Allocate parts to robot builds
date: 2026-11-20
collection: build-and-print
type: task
order: 11
related:
  - resume-a-robot-build
  - count-the-parts-you-already-own
covers:
  - src/kit/buildDemand.ts
  - src/components/build/BuildAllocations.tsx
  - src/components/build/ComponentAllocation.tsx
  - src/components/build/PrintedAllocation.tsx
  - src/components/build/LegacyPrintQuantity.tsx
  - src/components/build/RetainedAllocations.tsx
  - electron/backend/buildAllocations.mjs
  - electron/backend/printAllocations.mjs
---

Reserve components you own and assign individual printed copies to keep each robot's materials and assembly progress separate.

You can make up to twenty builds per submission, within the existing limit of 100 saved builds and 256 MB of shared Kit content.

You can retain up to 200 print attempts across all designs. At that limit, you keep existing ownership but can’t add new attempt records.

1. In the right panel, click **Build**.
2. Under **Builds**, click **Make Build**.
3. In **Build name**, enter a name, such as Rover.
4. In **Quantity**, enter the number of robots.
5. Click **Make**.
6. Under **Builds**, click a build's name.
7. Under **Allocations**, beside a component, enter its **Quantity**.
8. Beside that component, click **Reserve**.

![The Make Build dialog requesting two independently named rovers](/help/allocate-parts-to-robot-builds/quantity.png)

![Rover 1 with one reserved motor and independent assembly progress](/help/allocate-parts-to-robot-builds/reserved.png)

For larger groups, you get numbered names, such as Rover 1 and Rover 2. You keep a separate position and record of completed steps for each build.

Reserve individual pieces, even if the supplier sells packs. In the available count, you won’t see stock reserved for other builds.

If you reserve the last motor for Rover 1, you can’t reserve it for Rover 2. If you correct the stock count to less than the existing reservations, you keep those reservations and see a shortage.

![Rover 2 refusing a reservation for the motor held by Rover 1](/help/allocate-parts-to-robot-builds/shortage.png)

## Assign printed copies

1. In Build Along, click **Done**.
2. Press [[⌘P]] to open Print.
3. After completing the displayed plate, click **Mark Printed**.
4. Press [[Esc]] to return to the design.
5. In **Builds**, click the build's name.
6. Under **Allocations**, beside the printed part, choose its **Printed copy**.
7. Click **Assign Copy**.

![Print controls after recording the completed rover plate](/help/allocate-parts-to-robot-builds/printed.png)

![One mounting-tab copy assigned to Rover 1](/help/allocate-parts-to-robot-builds/first-copy.png)

![The other mounting-tab copy assigned to Rover 2](/help/allocate-parts-to-robot-builds/second-copy.png)

You can trace each listed copy to one recorded print attempt. After you assign a copy to one build, you can’t choose it for another build.

You can assign copies that match the frozen source geometry, material and declared guide-letter revision. You can’t assign completed copies from failed, canceled, incomplete or pending-reprint records.

Reconcile older records before assigning copies.

1. Under **Allocations**, beside the printed part, click **Reconcile Quantity**.
2. In **Reconcile Quantity**, enter the number you produced in each part's named field.
3. Click **Confirm**.

![Explicit quantity reconciliation for the older rover chassis record](/help/allocate-parts-to-robot-builds/reconcile.png)

You can’t use records if you can’t establish their historical source geometry or guide-letter revision. Entering completion or receiving printer reports doesn’t confirm dimensional fit or mean you’ve inspected the physical parts.

## Return materials

1. In the build's **Allocations**, enter the component quantity to return.
2. Beside that component, click **Return**.
3. In the confirmation, click **Return** after checking the physical quantity.

![The confirmation to return one Feetech motor to stock](/help/allocate-parts-to-robot-builds/return.png)

For a printed copy:

1. In the build's **Allocations**, beside the printed part, click **Return Copy ⟨number⟩** for that copy.
2. In the confirmation, click **Return** after checking the physical copy.

## Return retained materials

If you delete a build, you keep its materials assigned. Under **Retained allocations**, you can see ownership for builds absent from this profile.

1. Under **Retained allocations**, find the build and material to return.
2. Beside a component, enter its **Quantity**. A printed-copy row returns one copy.
3. Beside the material, click **Return**.
4. In the confirmation, click **Return** after checking the physical quantity.

![Rover 1’s motor ownership retained after deleting its saved build](/help/allocate-parts-to-robot-builds/retained.png)

Completing assembly doesn’t release materials or change a Checks verdict. See [Resume a robot build](/help/resume-a-robot-build) to track progress for each build.

During [repair](/help/repair-a-robot-build), **Replacement parts** reserves target components and copies separately. Replaced materials stay held until an explicit return.
