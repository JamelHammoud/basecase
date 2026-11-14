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

You can drive your robot through an open Case while Basecase records the try. When you stop, Basecase tells you whether the try passed, and you can watch it again.

1. Click **Play** in the view rail, then click **Cases**.
2. Click a Case under **New Case**. The Case and its brief open at the top of the **Simulate** tab.
3. Under **Try**, click **Try It**. A clock shows how much of the Case's time limit you've used, and the keys for your kind of robot appear below it.
4. Click the canvas so it receives your key presses.
5. Use the keys shown under **Try** to drive the robot to the goal. To start over, press [[R]].

![A try running, with the clock, Stop Try and the keys](/help/try-a-case/trying.png)

6. Click **Stop Try**, or wait for the clock to run out.
7. Find the new try under **Results**. It shows **Passed** or **Missed**, how long the try took, and four frames from it.
8. To watch a try again, click **Replay** (▷) on it.

![Results with the latest run and one try](/help/try-a-case/results.png)

You can also drive with a gamepad instead of the keys, or start a try from [[⌘K]] by choosing **Try ⟨Case⟩**. To stop driving and end the try, press [[Esc]].

**Note:** If you don't see a Case under **New Case**, [make a Case](/help/make-a-case) first.

To drive a humanoid or an arm with your own arms, press [[⌘K]] and choose **Drive with Camera** before you click **Try It**. See [Drive a robot with your camera](/help/drive-a-robot-with-your-camera).

To judge your real wheeled or legged robot on a printed mat, click **Try on Real Robot** instead of **Try It**. Then follow the steps in [Try a Case on your real robot](/help/try-a-case-on-your-real-robot).

If the robot can't drive, **Teach It to Move** appears under **Try It**. Click it to train a **Walk** skill. See [Train Stand and Walk with the Motor Kit](/help/train-stand-and-walk-with-the-motor-kit).

Instead of driving the robot yourself, you can teach it the Case's task. Go to **Train**, between **Control** and **Results**, and type a goal after **Teach it to**. For the steps, see [Teach a robot a skill](/help/teach-a-robot-a-skill).

## Whether the robot can do it

The icon next to the Case's name shows the Case's row in **Build** ▸ **Checks**. To see how many of 20 runs passed, hold your pointer over the icon. To open the row, click the icon.

![The Simulate tab with Touch the Dots open and its Checks icon beside the name](/help/try-a-case/case.png)

Basecase checks the robot before it runs the Case. The row names the first thing that stops the robot:

| What stops the robot | What the row says |
|---|---|
| The robot lacks what the Case needs | What the Case needs and what the robot has, such as "This Case needs driven wheels. This robot has a fixed base." |
| MuJoCo can't build the model | MuJoCo's error |
| It falls on hold during its first 1.5 s | When it fell, such as **Fell at 0.4 s** |
| A robot with four or more legs and no **Walk** falls during a 5-second walk | **Falls on its walk** |

![A Checks row saying the arm needs driven wheels for Reach a Spot, with New Case on its note](/help/try-a-case/misfit.png)

If the robot doesn't have what the Case needs, hold your pointer over the row's note and click **New Case**. Basecase builds a Case the robot can do.

## Results

After a run, **Results** shows whether the robot stayed up and which joints worked hardest. Below that is the list of tries, sorted worst first so misses are at the top. A replay includes anything the Case's code moved, lit or hid during the try.

- To delete a try, right-click it, choose **Delete**, then confirm.
- To tag a try, right-click it and choose **Tag**. See [Label the segments of a try](/help/label-the-segments-of-a-try).

Basecase marks tries from your real robot **Real**. When you click **Replay** on one, Basecase draws its path over the path of the best sim try.

If a try passed, its menu also has **Multiply**. This makes up to 50 varied passing tries from the one you chose. The try's row shows how many it made, such as **50 variations**. Deleting the try also deletes its variations. For the steps, see [Multiply a try into demonstrations](/help/multiply-a-try-into-demonstrations).

If you [compare two robots on a Case](/help/compare-two-robots-on-a-case), their rows appear above the tries. [Explore servo versions](/help/explore-servo-versions-on-a-case) puts its rows there too, below any comparison.

## Learn more

- Basecase saves tries on this computer and leaves them out of shared `.basecase` files.
- The Library lists tries from every scene. See [Open a try from any scene](/help/open-a-try-from-any-scene).
- After a try passes, you can [export the passed tries as a dataset](/help/export-a-lerobot-dataset).
- Once five tries have passed, you can train a policy from them. See [Train a policy from your tries](/help/train-a-policy-from-your-tries).
