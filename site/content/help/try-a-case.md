---
title: Try a Case
date: 2026-11-13
updated: 2026-11-13
collection: simulate-and-train
type: task
order: 4
keywords:
  - attempt
  - record
  - replay
  - results
  - pass
  - miss
  - robot fit
related:
  - make-a-case
  - export-a-lerobot-dataset
covers:
  - src/components/simulate/CaseSections.tsx
  - src/components/simulate/ResultsSection.tsx
  - src/workspace/useCaseTry.ts
  - src/workspace/useCases.ts
  - src/workspace/caseCommands.tsx
  - src/cases/fitCheck.ts
  - src/cases/tries.ts
  - src/cases/tryStore.ts
---

Drive the robot through an open Case while Basecase records it, then see whether the try passed and replay it.

1. Click **Play** in the view rail.
2. Click a Case under **In this scene**. It opens in the **Simulate** tab.
3. Under **Robot fit**, click **Check Fit**.
4. Under **Try**, click **Try It**. Recording starts and the robot is yours to drive.
5. Drive the robot to the goal with the keys listed under **Try**.
6. Click **End Try**, or let the clock run out.
7. Read the new try under **Results**: **Passed** or **Missed**, how long it took, and four frames from it.
8. Click **Replay** (▷) on a try to watch it again.

![Results with a passed try of Touch the Dots, and Export Dataset and Publish to Hugging Face under it](/help/publish-a-dataset-to-hugging-face/results.png)

**Try ⟨Case⟩** is also in [[⌘K]]. Pressing [[Esc]] stops driving, which ends the try too.

## Robot fit

**Check Fit** runs the robot in the simulation before you try it. Rows that don't apply to this robot are left out.

| Row | What it says |
|---|---|
| **Fits this Case** | **Yes**, or **No** when the robot lacks what the Case needs |
| **Compiles** | How many joints the model has, or why it can't be built |
| **Settles** | **Stays up** for 1.5 s on hold, or when it fell |
| **Body** | **Fixed base**, **Wheels**, **Legs** or **Wheels on legs** |
| **Fall check** | **Walks 5 s** for a walking robot, or **Falls on its walk** |

When the robot doesn't fit, **New Case** under the rows builds one it does.

## Results

Tries are listed worst first, so the misses to look at are on top. To delete a try, right-click it and choose **Delete**, then confirm.

Right-click a passed try and choose **Multiply** to replay it in 50 slightly moved worlds. The runs that pass show as a count on its row, such as "50 generated", and deleting the try deletes them too. Steps are in [Multiply a try into varied demonstrations](/help/multiply-a-try-into-varied-demonstrations).

When the robot can't drive, **Teach It to Move** shows under **Try It**. It trains a **Walk** skill; see [Train Stand and Walk with the Motor Kit](/help/train-stand-and-walk-with-the-motor-kit).

Tries are kept on this computer, not in shared `.basecase` files. Once a try passes, you can [export the passed tries as a dataset](/help/export-a-lerobot-dataset).
