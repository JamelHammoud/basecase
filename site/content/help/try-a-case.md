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

When you drive your robot through an open Case, Basecase records the try. After you stop, you can see whether the try passed and replay it.

1. Click **Play** in the view rail, then click **Cases**.
2. Click a Case under **New Case**. The Case opens at the top of the **Simulate** tab, with its brief. If no Cases appear, [make a Case](/help/make-a-case) first.
3. Under **Try**, click **Try It**. A clock shows how much of the Case's time limit you've used. The keys for your kind of robot appear below it.
4. Click the canvas so it receives your key presses.
5. Drive the robot to the goal with the keys under **Try** or with a gamepad. To start over, press [[R]].

![A try running, with the clock, Stop Try and the keys](/help/try-a-case/trying.png)

6. To end the try, click **Stop Try** or press [[Esc]]. The try also ends when the clock runs out or when you choose another controller in **Control**.
7. Find the new try under **Results**. It's marked **Passed** or **Missed**, with how long it took and four frames from the try.
8. To watch a try, click **Replay** (▷) on it. The replay plays through the Case's cards, as in [Play a try through its console](/help/play-a-try-through-its-console).

![Results with the latest run and one try](/help/try-a-case/results.png)

You can also press [[⌘K]] and choose **Try ⟨Case⟩** to start a try.

To steer a humanoid or an arm with your own arms, press [[⌘K]] and choose **Drive with Camera** before you click **Try It**. See [Drive a robot with your camera](/help/drive-a-robot-with-your-camera).

To judge your real wheeled or legged robot on a printed mat, click **Try on Real Robot** instead of **Try It**. See [Try a Case on your real robot](/help/try-a-case-on-your-real-robot).

If the robot can't drive, **Teach It to Move** appears under **Try It**. Click it to train a **Walk** skill. See [Train Stand and Walk with the Motor Kit](/help/train-stand-and-walk-with-the-motor-kit).

To teach the robot the Case's task instead of driving it, go to **Train** (between **Control** and **Results**) and type a goal after **Teach it to**. See [Teach a robot a skill](/help/teach-a-robot-a-skill).

## Whether the robot can do it

The icon beside the Case's name stands for the Case's row in **Build** ▸ **Checks**. To see how many of 20 runs passed, hold your pointer over the icon. To open the row, click the icon.

![The Simulate tab with Touch the Dots open and its Checks icon beside the name](/help/try-a-case/case.png)

Basecase tests the robot before it runs the Case. The row names the first problem that stops it:

| Problem | The row shows |
|---|---|
| The robot lacks what the Case needs | What the Case needs and what the robot has, such as "This Case needs driven wheels. This robot has a fixed base." |
| MuJoCo can't build the model | MuJoCo's error |
| It falls on hold during its first 1.5 s | The time it fell, such as **Fell at 0.4 s** |
| A robot with four or more legs and no **Walk** falls during a 5-second walk | **Falls on its walk** |

![A Checks row saying the arm needs driven wheels for Reach a Spot, with New Case on its note](/help/try-a-case/misfit.png)

If the robot lacks what the Case needs, hold your pointer over the row's note and click **New Case**. Basecase builds a Case the robot can do.

## Results

After a run, **Results** shows whether the robot stayed up and which joints worked hardest. The tries are listed below that, worst first, so misses are at the top. Replays include anything the Case's code moved, lit or hid during the try.

To delete a try, right-click it, choose **Delete**, then confirm.

Tries from your real robot are marked **Real**. When you click **Replay** on one, Basecase draws its path over the path of the best sim try.

A passed try has **Multiply** in its menu. It makes up to 50 varied passing tries from that try, and the try's row then shows the count, such as **50 variations**. Deleting the try also deletes its variations. See [Multiply a try into demonstrations](/help/multiply-a-try-into-demonstrations).

If you [compare two robots on a Case](/help/compare-two-robots-on-a-case), their rows appear above the tries. Rows from [Explore servo versions](/help/explore-servo-versions-on-a-case) appear in the same place, below any comparison.

## Where tries go

- Tries are saved on this computer and aren't included in shared `.basecase` files.
- The Library shows tries from every scene. See [Open a try from any scene](/help/open-a-try-from-any-scene).
- To find tries by words, facts or motion, use [Search tries](/help/search-tries).
- After a try passes, you can [export the passed tries as a dataset](/help/export-a-lerobot-dataset).
- Once you have five passed tries, you can train a policy from them. See [Train a policy from your tries](/help/train-a-policy-from-your-tries).
