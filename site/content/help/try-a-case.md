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
  - drive
  - filmstrip
related:
  - make-a-case
  - export-a-lerobot-dataset
covers:
  - src/components/SimulatePanel.tsx
  - src/components/simulate/CaseSections.tsx
  - src/components/simulate/ResultsSection.tsx
  - src/components/simulate/TrainSection.tsx
  - src/workspace/useCaseTry.ts
  - src/workspace/useCases.ts
  - src/workspace/caseCommands.tsx
  - src/cases/fitCheck.ts
  - src/readiness/caseChecks.ts
  - src/cases/tries.ts
  - src/cases/tryStore.ts
---

Drive the robot through an open Case while Basecase records it, then see whether the try passed and replay it.

1. Click **Play** in the view rail, then **Cases**.
2. Click a Case under **New Case**. It opens at the top of the **Simulate** tab, with its brief.
3. Under **Try**, click **Try It**. The clock shows the time used against the Case's limit, and the keys for your kind of robot show under it.
4. Click the canvas so it gets the keys.
5. Drive the robot to the goal with the keys under **Try**. [[R]] starts over.

![A try running, with the clock, Stop Try and the keys](/help/try-a-case/trying.png)

6. Click **Stop Try**, or let the clock run out.
7. Read the new try under **Results**: **Passed** or **Missed**, how long it took, and four frames from it.
8. Click **Replay** (▷) on a try to watch it again.

![Results with the latest run and one try](/help/try-a-case/results.png)

A gamepad drives the robot too. **Try ⟨Case⟩** is also in [[⌘K]]. Pressing [[Esc]] stops driving, which ends the try too. With no Case under **New Case**, [make a Case](/help/make-a-case) first.

To drive a humanoid or an arm with your own arms, press [[⌘K]] and choose **Drive with Camera** before you click **Try It**. See [Drive a robot with your camera](/help/drive-a-robot-with-your-camera).

To judge your real wheeled or legged robot on a printed mat, click **Try on Real Robot** instead. See [Try a Case on your real robot](/help/try-a-case-on-your-real-robot).

## Whether the robot can do it

The icon beside the Case's name is its row in **Build ▸ Checks**. Hover it for how many of 20 runs passed. Click it to open the row.

![The Simulate tab with Touch the Dots open and its Checks icon beside the name](/help/try-a-case/case.png)

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

After a run, **Results** shows how it went: whether the robot stayed up, and the joints that worked hardest. Tries are listed under it worst first, so the misses to look at are on top. A replay shows what the Case's code moved, lit or hid during the try. To delete a try, right-click it and choose **Delete**, then confirm.

A try from your real robot has a **Real** mark. Its **Replay** draws its path over the best sim try's path.

A passed try's menu also has **Multiply**, which makes up to 50 varied passing tries from it. Its row counts them, such as **50 variations**, and deleting the try deletes them too. Steps are in [Multiply a try into demonstrations](/help/multiply-a-try-into-demonstrations).

While you [compare two robots on a Case](/help/compare-two-robots-on-a-case), their two rows sit above the tries. [Explore servo versions](/help/explore-servo-versions-on-a-case) puts its rows there too, under any comparison.

When the robot can't drive, **Teach It to Move** shows under **Try It**. It trains a **Walk** skill; see [Train Stand and Walk with the Motor Kit](/help/train-stand-and-walk-with-the-motor-kit).

To teach the robot the Case's task instead of driving it, type a goal after **Teach it to** in **Train**, between **Control** and **Results**. Steps are in [Teach a robot a skill](/help/teach-a-robot-a-skill).

Tries are kept on this computer, not in shared `.basecase` files. Once a try passes, you can [export the passed tries as a dataset](/help/export-a-lerobot-dataset). Once five pass, you can train a policy from them; see [Train a policy from your tries](/help/train-a-policy-from-your-tries).
