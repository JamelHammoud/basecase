---
title: Put two robots in one Case
date: 2026-11-13
updated: 2026-11-14
collection: simulate-and-train
type: task
covers:
  - src/cases/handoffGoal.ts
  - src/cases/caseCast.ts
  - src/cases/slots.ts
  - src/workspace/useCaseBuilder.ts
  - src/workspace/useCaseTry.ts
  - src/app/tabModel.ts
---

You can run two arms in the same simulation: one arm touches a point, and then the other arm takes over. Basecase records the tries as one dataset.

1. Open each arm's scene in its own tab. The second arm can be a copy of the first. To make a copy, right-click the first arm's tab and choose **Duplicate**.
2. In the first arm's tab, open **Play** ▸ **Cases**, then click **New Case**.
3. Choose **Hand Off to a Spot**. Set how far ahead the point sits, how high it sits, and how close counts. Then click **Make Case**.

![The New Case card with Hand Off to a Spot chosen](/help/put-two-robots-in-one-case/new-case.png)

The second arm stands facing the first, on the other side of the point and the same distance from it. It's the robot from the other tab at its own size and weight, so if you edit it in that tab, the change applies to the next try.

![Both arms on the canvas with the point between them](/help/put-two-robots-in-one-case/case.png)

4. Click **Try It** in the Simulate tab. Drive the first arm with [[W A S D]], [[Q]] and [[E]]. Touch the point within the first 3 seconds, then pull away. At 3 seconds, the second arm reaches for the point.

![The second arm on the point after the first pulled away](/help/put-two-robots-in-one-case/try.png)

A try passes when the first arm held the point, and then the second arm held it while the first arm was clear.

To export your tries, click **Make Dataset** under **Results**, then click **Export Dataset**. The exported dataset puts the joints of both arms in one `observation.state` and one `action`. Each joint's name marks its arm with `a.` or `b.`, and `modality.json` has one group per arm.

**Note:** If you close the second arm's tab, the Case stays, but tries fail until you open an arm in another tab.
