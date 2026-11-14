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

Drive your robot through an open Case and Basecase records the try. After you stop, you can see whether it passed and replay it.

1. Click **Play** in the view rail, then click **Cases**.
2. Click a Case under **New Case**. The Case and its brief open at the top of the **Simulate** tab. If you don't see any Cases, [make a Case](/help/make-a-case) first.
3. Under **Try**, click **Try It**. A clock shows how much of the Case's time limit you've used. Below the clock are the keys for your kind of robot.
4. Click the canvas so it receives your key presses.
5. Drive the robot to the goal using the keys under **Try** or a gamepad. To start over, press [[R]].

![A try running, with the clock, Stop Try and the keys](/help/try-a-case/trying.png)

6. To end the try, click **Stop Try** or press [[Esc]]. If the clock runs out or you choose another controller in **Control**, Basecase ends the try for you.
7. Find the new try under **Results**. It shows **Passed** or **Missed**, how long it took, and four frames from the try.
8. To watch the try, click **Replay** (▷) on it. The replay plays through the Case's cards. See [Play a try through its console](/help/play-a-try-through-its-console).

![Results with the latest run and one try](/help/try-a-case/results.png)

Or press [[⌘K]] and choose **Try ⟨Case⟩** to start a try.

To steer a humanoid or an arm with your own arms, press [[⌘K]] and choose **Drive with Camera** before you click **Try It**. Learn how to [drive a robot with your camera](/help/drive-a-robot-with-your-camera).

To judge your real wheeled or legged robot on a printed mat, click **Try on Real Robot** instead of **Try It**. Learn how to [try a Case on your real robot](/help/try-a-case-on-your-real-robot).

If the robot can't drive, you'll see **Teach It to Move** under **Try It**. Click it to train a **Walk** skill. See [Train Stand and Walk with the Motor Kit](/help/train-stand-and-walk-with-the-motor-kit).

If you'd rather teach the robot the Case's task than drive it yourself, go to **Train** (between **Control** and **Results**) and type a goal after **Teach it to**. See [Teach a robot a skill](/help/teach-a-robot-a-skill).

## Whether the robot can do it

The icon next to the Case's name stands for the Case's row in **Build** ▸ **Checks**. Hold your pointer over the icon to see how many of 20 runs passed. Click the icon to open the row.

![The Simulate tab with Touch the Dots open and its Checks icon beside the name](/help/try-a-case/case.png)

Before the robot runs the Case, Basecase tests it. The row names the first problem that stops the robot:

| Problem | The row shows |
|---|---|
| The robot lacks what the Case needs | What the Case needs and what the robot has, such as "This Case needs driven wheels. This robot has a fixed base." |
| MuJoCo can't build the model | MuJoCo's error |
| It falls on hold during its first 1.5 s | The time it fell, such as **Fell at 0.4 s** |
| A robot with four or more legs and no **Walk** falls during a 5-second walk | **Falls on its walk** |

![A Checks row saying the arm needs driven wheels for Reach a Spot, with New Case on its note](/help/try-a-case/misfit.png)

If the robot lacks what the Case needs, hold your pointer over the row's note and click **New Case**. Basecase builds a Case that the robot can do.

## Results

After a run, **Results** shows whether the robot stayed up and which joints worked hardest. Below that come the tries, worst first, so misses sit at the top. Replays include anything the Case's code moved, lit or hid during the try.

To delete a try, right-click it, choose **Delete**, then confirm.

Tries from your real robot show **Real**. When you click **Replay** on one of them, Basecase draws its path over the path of the best sim try.

A passed try has **Multiply** in its menu. Multiply makes up to 50 varied passing tries from that try. The try's row then shows the count, such as **50 variations**. Deleting the try deletes its variations with it. Learn how to [multiply a try into demonstrations](/help/multiply-a-try-into-demonstrations).

If you [compare two robots on a Case](/help/compare-two-robots-on-a-case), their rows appear above the tries. Rows from [Explore servo versions](/help/explore-servo-versions-on-a-case) appear in the same place, below any comparison.

## Where tries go

- Basecase saves tries on this computer and leaves them out of shared `.basecase` files.
- The Library shows tries from every scene. See [Open a try from any scene](/help/open-a-try-from-any-scene).
- To find tries by words, facts or motion, use [Search tries](/help/search-tries).
- After a try passes, you can [export the passed tries as a dataset](/help/export-a-lerobot-dataset).
- Once you have five passed tries, you can train a policy from them. See [Train a policy from your tries](/help/train-a-policy-from-your-tries).
