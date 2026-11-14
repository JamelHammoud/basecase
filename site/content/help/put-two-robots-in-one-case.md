---
title: Put two robots in one Case
date: 2026-11-13
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

You can run two arms in the same simulation, where one arm touches a point and the other takes over. Basecase records the tries as one dataset.

1. Open each arm's scene in its own tab. The second arm can be a copy of the first. To make a copy, right-click its tab and choose **Duplicate**.
2. In the first arm's tab, open **Play** ▸ **Cases** and click **New Case**.
3. Choose **Hand Off to a Spot**. Set how far ahead and how high the point sits, and how close counts, then click **Make Case**.

![The New Case card with Hand Off to a Spot chosen](/help/put-two-robots-in-one-case/new-case.png)

The second arm stands facing the first, the same distance from the point but on the other side. It's the robot from the other tab, at its own size and weight. If you edit it in that tab, the next try uses the change.

![Both arms on the canvas with the point between them](/help/put-two-robots-in-one-case/case.png)

4. Click **Try It** in the Simulate tab. Drive the first arm with [[W A S D]], [[Q]] and [[E]]. Touch the point within the first 3 seconds, then pull away. At 3 seconds, the second arm reaches for it.

![The second arm on the point after the first pulled away](/help/put-two-robots-in-one-case/try.png)

The try passes when the first arm held the point and the second arm then held it while the first was clear.

**Export Dataset** puts both arms' joints in one `observation.state` and one `action`. It names each joint after its arm (`a.` or `b.`), and `modality.json` has one group per arm.

**Note:** If you close the second arm's tab, the Case stays. Tries fail until you open an arm in another tab.
