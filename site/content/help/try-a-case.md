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

Drive the robot through an open Case while Basecase records it. When the try ends, Basecase shows whether it passed, and you can replay it.

1. Click **Play** in the view rail, then **Cases**.
2. Click a Case under **New Case**. Basecase opens the Case, with its brief at the top of the **Simulate** tab.
3. Under **Try**, click **Try It**. A clock shows how much of the Case's time limit you've used, and the keys for your kind of robot appear under it.
4. Click the canvas so it receives the keys.
5. Drive the robot to the goal with the keys shown under **Try**. To start over, press [[R]].

![A try running, with the clock, Stop Try and the keys](/help/try-a-case/trying.png)

6. Click **Stop Try**, or wait for the clock to run out.
7. Find your new try under **Results**. It shows **Passed** or **Missed**, how long it took, and four frames from the try.
8. To watch a try again, click **Replay** (▷).

![Results with the latest run and one try](/help/try-a-case/results.png)

You can also drive with a gamepad, or start a try from [[⌘K]] by choosing **Try ⟨Case⟩**. To stop driving and end the try, press [[Esc]]. If **New Case** lists no Case, [make a Case](/help/make-a-case) first.

To drive a humanoid or an arm with your own arms, press [[⌘K]] and choose **Drive with Camera** before you click **Try It**. See [Drive a robot with your camera](/help/drive-a-robot-with-your-camera).

To judge your real wheeled or legged robot on a printed mat, click **Try on Real Robot** instead of **Try It**. See [Try a Case on your real robot](/help/try-a-case-on-your-real-robot).

## Whether the robot can do it

The icon beside the Case's name shows its row in **Build** ▸ **Checks**. Hold your pointer over the icon to see how many of 20 runs passed, or click it to open the row.

![The Simulate tab with Touch the Dots open and its Checks icon beside the name](/help/try-a-case/case.png)

Basecase checks the robot before it runs the Case, and the row names the first thing that stops it:

| Stop | What the row says |
|---|---|
| The robot lacks what the Case needs | What the Case needs and what the robot has, such as "This Case needs driven wheels. This robot has a fixed base." |
| The model can't be built | MuJoCo's error |
| It falls on hold in its first 1.5 s | The moment it fell, such as **Fell at 0.4 s** |
| A robot with four or more legs and no **Walk** falls in a 5-second walk | **Falls on its walk** |

![A Checks row saying the arm needs driven wheels for Reach a Spot, with New Case on its note](/help/try-a-case/misfit.png)

If the robot lacks what the Case needs, hold your pointer over the row's note and click **New Case** to build a Case the robot can do.

## Results

After a run, **Results** shows whether the robot stayed up and which joints worked hardest. Below that, Basecase lists the tries worst first, so the misses worth a look are at the top. A replay shows what the Case's code moved, lit or hid during the try. To delete a try, right-click it, choose **Delete**, then confirm.

Tries from your real robot have a **Real** mark. Their **Replay** draws the real path over the path of the best sim try.

The menu of a passed try has **Multiply**, which makes up to 50 varied passing tries from it. The try's row shows the count, such as **50 variations**. If you delete the try, its variations are deleted with it. For steps, see [Multiply a try into demonstrations](/help/multiply-a-try-into-demonstrations).

If you [compare two robots on a Case](/help/compare-two-robots-on-a-case), their two rows appear above the tries. [Explore servo versions](/help/explore-servo-versions-on-a-case) adds its rows in the same spot, below any comparison.

If the robot can't drive, **Teach It to Move** appears under **Try It**. It trains a **Walk** skill. See [Train Stand and Walk with the Motor Kit](/help/train-stand-and-walk-with-the-motor-kit).

To teach the robot the Case's task instead of driving it yourself, type a goal after **Teach it to** in **Train**, between **Control** and **Results**. For steps, see [Teach a robot a skill](/help/teach-a-robot-a-skill).

Basecase saves tries on this computer and leaves them out of shared `.basecase` files. With one passed try, you can [export the passed tries as a dataset](/help/export-a-lerobot-dataset). With five, you can train a policy from them. See [Train a policy from your tries](/help/train-a-policy-from-your-tries).
