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

Run two arms in one simulation, where one touches a point and the other takes over, and record the tries as one dataset.

1. Open each arm's scene in its own tab. The second arm can be a copy of the first: right-click its tab and choose **Duplicate**.
2. In the first arm's tab, open Play ▸ **Cases** and click **New Case**.
3. Choose **Hand Off to a Spot**. Set how far ahead and how high the point sits, and how close counts, then click **Create**.

![The New Case card with Hand Off to a Spot chosen](/help/put-two-robots-in-one-case/new-case.png)

The second arm now stands facing the first, the same distance from the point on the other side. It's the robot from the other tab, at its own size and weight. Edit it there, and the next try uses the change.

![Both arms on the canvas with the point between them](/help/put-two-robots-in-one-case/case.png)

4. Click **Try It** in the Simulate tab. You drive the first arm with W A S D, Q and E. Touch the point within the first 3 seconds and pull away: at 3 seconds the second arm reaches for it.

![The second arm on the point after the first pulled away](/help/put-two-robots-in-one-case/try.png)

The try passes when the first arm held the point and the second then held it while the first was clear. **Export Dataset** puts both arms' joints in one `observation.state` and one `action`, each joint named after its arm (`a.` or `b.`), with one group per arm in `modality.json`.

If you close the second arm's tab, the Case stays, but tries fail until an arm is open in another tab again.
