---
title: Try a Case
date: 2026-11-13
updated: 2026-11-14
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
  - src/cases/tryStore/
---

Drive your robot through an open Case while Basecase records the try. After you stop, Basecase shows whether the try passed, and you can replay it.

1. Click **Play** in the view rail, then click **Cases**.
2. Click a Case under **New Case**. The Case opens at the top of the **Simulate** tab, along with its brief.
3. Under **Try**, click **Try It**. A clock shows how much of the Case's time limit you've used. The keys for your kind of robot appear below it.
4. Click the canvas so it gets your key presses.
5. Use the keys under **Try** to drive the robot to the goal. To start over, press [[R]].

![A try running, with the clock, Stop Try and the keys](/help/try-a-case/trying.png)

6. Click **Stop Try**, or wait for the clock to run out.
7. Find the new try under **Results**. It shows **Passed** or **Missed**, how long the try took, and four frames from it.
8. To watch a try again, click **Replay** (▷) on it.

![Results with the latest run and one try](/help/try-a-case/results.png)

**Note:** If you don't see a Case under **New Case**, [make a Case](/help/make-a-case) first.

You can drive with a gamepad in place of the keys. To start a try from [[⌘K]], choose **Try ⟨Case⟩**. Press [[Esc]] to stop driving and end the try.

To drive a humanoid or an arm with your own arms, press [[⌘K]] and choose **Drive with Camera** before you click **Try It**. See [Drive a robot with your camera](/help/drive-a-robot-with-your-camera).

To judge your real wheeled or legged robot on a printed mat, click **Try on Real Robot** in place of **Try It**, then follow [Try a Case on your real robot](/help/try-a-case-on-your-real-robot).

If the robot can't drive, **Teach It to Move** appears under **Try It**. Use it to train a **Walk** skill. See [Train Stand and Walk with the Motor Kit](/help/train-stand-and-walk-with-the-motor-kit) for the steps.

To have the robot learn the Case's task rather than drive it yourself, type a goal after **Teach it to** in **Train**, the section between **Control** and **Results**. See [Teach a robot a skill](/help/teach-a-robot-a-skill).

## Whether the robot can do it

The icon next to the Case's name stands for the Case's row in **Build** ▸ **Checks**. Hold your pointer over the icon to see how many of 20 runs passed, or click it to open the row.

![The Simulate tab with Touch the Dots open and its Checks icon beside the name](/help/try-a-case/case.png)

Basecase checks the robot before it runs the Case, and the row shows the first thing that stops it:

| What stops the robot | What the row says |
|---|---|
| The robot lacks what the Case needs | What the Case needs and what the robot has, such as "This Case needs driven wheels. This robot has a fixed base." |
| MuJoCo can't build the model | MuJoCo's error |
| It falls on hold during its first 1.5 s | When it fell, such as **Fell at 0.4 s** |
| A robot with four or more legs and no **Walk** falls during a 5-second walk | **Falls on its walk** |

![A Checks row saying the arm needs driven wheels for Reach a Spot, with New Case on its note](/help/try-a-case/misfit.png)

If the robot lacks what the Case needs, hold your pointer over the row's note and click **New Case** to build a Case the robot can do.

## Results

After a run, **Results** shows whether the robot stayed up and which joints worked hardest. Below that, the list of tries starts with the worst, so misses sit at the top. A replay includes anything the Case's code moved, lit, or hid during the try.

To delete a try, right-click it, choose **Delete**, then confirm.

Tries from your real robot have a **Real** label. Click **Replay** on one and Basecase draws its path over the path of the best sim try.

A passed try has one more item in its menu, **Multiply**, which makes up to 50 varied passing tries from the one you picked. The try's row then shows how many it made, such as **50 variations**. Deleting the try deletes its variations with it. See [Multiply a try into demonstrations](/help/multiply-a-try-into-demonstrations) for the steps.

If you [compare two robots on a Case](/help/compare-two-robots-on-a-case), their rows sit above the tries. [Explore servo versions](/help/explore-servo-versions-on-a-case) puts its rows in the same place, below any comparison.

Basecase saves tries on this computer and leaves them out of shared `.basecase` files. The Library lists tries from every scene. See [Open a try from any scene](/help/open-a-try-from-any-scene).

Once a try passes, click **Make Dataset** under the tries to gather the passed tries into a dataset. See [Make a dataset from tries](/help/make-a-dataset-from-tries). You can then [export the dataset](/help/export-a-lerobot-dataset), or [train a policy](/help/train-a-policy-from-your-tries) once five tries have passed.
