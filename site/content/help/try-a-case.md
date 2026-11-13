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
  - src/readiness/caseChecks.ts
  - src/cases/tries.ts
  - src/cases/tryStore.ts
---

Drive the robot through an open Case while Basecase records it, then see whether the try passed and replay it.

1. Click **Play** in the view rail.
2. Click a Case under **New Case**. It opens in the **Simulate** tab.
3. Under **Try**, click **Try It**. Recording starts and the robot is yours to drive.
4. Drive the robot to the goal with the keys listed under **Try**.
5. Click **End Try**, or let the clock run out.
6. Read the new try under **Results**: **Passed** or **Missed**, how long it took, and four frames from it.
7. Click **Replay** (▷) on a try to watch it again.

![Results with a passed try of Touch the Dots, and Export Dataset and Publish to Hugging Face under it](/help/publish-a-dataset-to-hugging-face/results.png)

**Try ⟨Case⟩** is also in [[⌘K]]. Pressing [[Esc]] stops driving, which ends the try too.

To drive a humanoid or an arm with your own arms, press [[⌘K]] and choose **Drive With Camera** before you click **Try It**. See [Drive a robot with your camera](/help/drive-a-robot-with-your-camera).

## Whether the robot can do it

The icon beside the Case's name is its row in **Build ▸ Checks**. Hover it for how many of 20 runs passed. Click it to open the row.

The row checks the robot before it runs the Case. It names the first thing that stops it:

| Stop | What the row says |
|---|---|
| The robot lacks what the Case needs | What the Case needs and what the robot has, such as "This Case needs driven wheels. This robot has a fixed base." |
| The model can't be built | MuJoCo's error |
| It falls on hold in its first 1.5 s | When it fell, such as **Fell at 0.4 s** |
| A robot with four or more legs and no **Walk** falls in a 5-second walk | **Falls on its walk** |

![A Checks row saying the arm needs driven wheels for Reach a Spot, with New Case on its note](/help/try-a-case/misfit.png)

When the robot lacks what the Case needs, point at the row's note and click **New Case** to build one it can do.

## Results

The **Results** header counts passed tries out of all of them. Tries are listed worst first, so the misses to look at are on top. To delete a try, right-click it and choose **Delete**, then confirm.

While you [compare two robots on a Case](/help/compare-two-robots-on-a-case), their two rows sit above the tries.

When the robot can't drive, **Teach It to Move** shows under **Try It**. It trains a **Walk** skill; see [Train Stand and Walk with the Motor Kit](/help/train-stand-and-walk-with-the-motor-kit).

Tries are kept on this computer, not in shared `.basecase` files. Once a try passes, you can [export the passed tries as a dataset](/help/export-a-lerobot-dataset). Once five pass, you can train a policy from them; see [Train a policy from your tries](/help/train-a-policy-from-your-tries).
