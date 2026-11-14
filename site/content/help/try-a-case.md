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

You can drive your robot through an open Case while Basecase records the try. When you stop, Basecase shows whether the try passed, and you can replay it.

1. Click **Play** in the view rail, then click **Cases**.
2. Click a Case under **New Case**. The Case and its brief open at the top of the **Simulate** tab.
3. Under **Try**, click **Try It**. A clock shows how much of the Case's time limit you've used. The keys for your kind of robot appear below it.
4. Click the canvas so it receives your key presses.
5. Use the keys under **Try** to drive the robot to the goal. To start over, press [[R]].

![A try running, with the clock, Stop Try and the keys](/help/try-a-case/trying.png)

6. Click **Stop Try**, or wait for the clock to run out.
7. Find the new try under **Results**. It shows **Passed** or **Missed**, how long the try took, and four frames from it.
8. To watch a try again, click **Replay** (▷) on it.

![Results with the latest run and one try](/help/try-a-case/results.png)

You can also drive with a gamepad instead of the keys. To stop driving and end the try, press [[Esc]]. **Try ⟨Case⟩** is also in [[⌘K]].

**Note:** If you don't see a Case under **New Case**, [make a Case](/help/make-a-case) first.

You can also try a Case in these ways:

- **Drive with your own arms.** For a humanoid or an arm, press [[⌘K]] and choose **Drive with Camera** before you click **Try It**. See [Drive a robot with your camera](/help/drive-a-robot-with-your-camera).
- **Use your real robot.** To judge your real wheeled or legged robot on a printed mat, click **Try on Real Robot** instead of **Try It**. Then follow [Try a Case on your real robot](/help/try-a-case-on-your-real-robot).
- **Teach it to move first.** If the robot can't drive, **Teach It to Move** appears under **Try It**. It trains a **Walk** skill. See [Train Stand and Walk with the Motor Kit](/help/train-stand-and-walk-with-the-motor-kit).
- **Let the robot learn the task.** Instead of driving it yourself, type a goal after **Teach it to** in **Train**, between **Control** and **Results**. [Teach a robot a skill](/help/teach-a-robot-a-skill) has the steps.

## Whether the robot can do it

The icon beside the Case's name stands for the Case's row in **Build** ▸ **Checks**. To see how many of 20 runs passed, hold your pointer over the icon. To open the row, click it.

![The Simulate tab with Touch the Dots open and its Checks icon beside the name](/help/try-a-case/case.png)

Before the robot runs the Case, Basecase checks whether the robot can do it. The row names the first thing that stops it:

| What stops the robot | What the row says |
|---|---|
| The robot lacks what the Case needs | What the Case needs and what the robot has, such as "This Case needs driven wheels. This robot has a fixed base." |
| The model can't be built | MuJoCo's error |
| It falls on hold during its first 1.5 s | When it fell, such as **Fell at 0.4 s** |
| A robot with four or more legs and no **Walk** falls during a 5-second walk | **Falls on its walk** |

![A Checks row saying the arm needs driven wheels for Reach a Spot, with New Case on its note](/help/try-a-case/misfit.png)

If the robot doesn't have what the Case needs, hold your pointer over the row's note and click **New Case**. Basecase builds a Case the robot can do.

## Results

After a run, **Results** shows whether the robot stayed up and which joints worked hardest. Below that, Basecase lists the tries worst first, so misses are at the top. A replay includes anything the Case's code moved, lit or hid during the try.

To delete a try, right-click it, choose **Delete**, then confirm.

Tries from your real robot have a **Real** mark. When you click **Replay** on one, Basecase draws its path over the path of the best sim try.

A passed try's menu also has **Multiply**. It makes up to 50 varied passing tries from that try, and the try's row then shows the count, such as **50 variations**. Deleting the try deletes its variations too. [Multiply a try into demonstrations](/help/multiply-a-try-into-demonstrations) has the steps.

If you [compare two robots on a Case](/help/compare-two-robots-on-a-case), their two rows appear above the tries. [Explore servo versions](/help/explore-servo-versions-on-a-case) adds its rows there too, below any comparison.

### Where tries are kept

- Basecase saves tries on this computer. Shared `.basecase` files don't include them.
- The Library lists tries from every scene. See [Open a try from any scene](/help/open-a-try-from-any-scene).
- Once a try passes, click **Make Dataset** under the tries to gather the passed tries into a dataset ([Make a dataset from tries](/help/make-a-dataset-from-tries)).
- From there, you can [export the dataset](/help/export-a-lerobot-dataset), or [train a policy](/help/train-a-policy-from-your-tries) once five tries have passed.
