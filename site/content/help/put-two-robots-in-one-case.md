---
title: Put two robots in one Case
date: 2026-11-13
collection: simulate-and-train
type: task
covers:
  - src/cases/handoffGoal.ts
  - src/cases/handoffLayout.ts
  - src/cases/handoffReference.ts
  - src/cases/handoffReach.ts
  - src/cases/probes.ts
  - src/cases/caseCast.ts
  - src/cases/slots.ts
  - src/workspace/useCaseBuilder.ts
  - src/workspace/useCaseTry.ts
  - src/app/tabModel.ts
---

Pick up a block with one gripper, pass it to the other arm, and place it on a floor spot while both arms' joints are recorded together.

Both arms must have grippers and be open in separate scene tabs.

1. Open each arm's scene in its own tab.
2. In the first arm's tab, open **Play** ▸ **Cases** and click **New Case**.
3. Choose **Hand Off to a Spot**.

![The New Case card with Hand Off to a Spot chosen](/help/put-two-robots-in-one-case/new-case.png)

4. Set **Distance** for the transfer's distance ahead, **Height** for its height, **Radius** for placement tolerance, and **Time** for the try's length.
5. Click **Make Case**.

![Both gripper arms with a block on the floor and a destination spot](/help/put-two-robots-in-one-case/case.png)

The second arm faces the first. The block has room for each gripper to hold a separate end, and its width fits both jaw openings. Each arm keeps the size and weight of the robot in its tab. If you edit the second arm there, the next try uses the change.

6. In the **Simulate** tab, click **Try It**.

Drive the first arm with [[W A S D]], [[Q]] and [[E]], and hold [[Space]] to grip the near end of the block. Lift the block to the transfer height and hold it for the second arm.

![The donor gripper supporting the raised block](/help/put-two-robots-in-one-case/donor.png)

The second arm follows the Case's reference. Keep holding until its jaws close on the far end, then release [[Space]] and move the first arm clear.

![Both grippers holding separate ends of the block](/help/put-two-robots-in-one-case/transfer.png)

![The recipient holding the block after the donor withdrew](/help/put-two-robots-in-one-case/try.png)

The second arm carries the block to the spot, lowers it and opens its gripper.

![The block placed on the floor spot with both arms clear](/help/put-two-robots-in-one-case/placed.png)

The try passes only when the block is lifted, held by both grippers, supported by the second arm alone, then placed and released on the spot. The exact conditions are in [Case goals, worlds and contracts](/help/case-goals-worlds-and-contracts#how-a-try-is-judged).

Older saved Hand Off Cases keep their point-touch task. Make a new Case to get the block transfer.

> [!NOTE]
> If you close the second arm's tab, the Case stays. Tries fail until you open a compatible arm with a gripper in another tab.

7. In **Results**, click **Make Dataset** to keep the passed tries together.

The second arm can be a copy of the first. To make one, right-click its tab and choose **Duplicate**.

**Export Dataset** puts both arms' joints in one `observation.state` and one `action`. It names each joint after its arm (`a.` or `b.`), and `modality.json` has one group per arm. The export steps are in [Export a LeRobot dataset](/help/export-a-lerobot-dataset).
