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

Basecase records each drive through an open Case as a try. After you stop, you can see whether the try passed and replay it.

If you don't see a Case under **New Case**, [make a Case](/help/make-a-case) first.

1. Click **Play** in the view rail, then click **Cases**.
2. Click a Case under **New Case**. Basecase opens the Case and shows its brief at the top of the **Simulate** tab.
3. Under **Try**, click **Try It**. A clock shows how much of the Case's time limit you've used, and the keys for your kind of robot appear below it.
4. Click the canvas so it receives your key presses.
5. Use the keys shown under **Try** to drive the robot to the goal. To start over, press [[R]].

![A try running, with the clock, Stop Try and the keys](/help/try-a-case/trying.png)

6. Click **Stop Try**, or wait for the clock to run out.
7. Find the new try under **Results**. It shows **Passed** or **Missed**, how long the try took, and four frames from it.
8. To watch a try again, click **Replay** (▷) on it.

![Results with the latest run and one try](/help/try-a-case/results.png)

You can drive with a gamepad instead of the keys. Press [[Esc]] to stop driving and end the try. You can start a try without opening the panel by choosing **Try ⟨Case⟩** in [[⌘K]].

You can drive a humanoid or an arm with your own arms. Before you click **Try It**, press [[⌘K]] and choose **Drive with Camera**. For details, see [Drive a robot with your camera](/help/drive-a-robot-with-your-camera).

**Try on Real Robot** judges your real wheeled or legged robot on a printed mat. Click it instead of **Try It**, then follow the steps in [Try a Case on your real robot](/help/try-a-case-on-your-real-robot).

**Teach It to Move** appears under **Try It** when the robot can't drive. Click it to train a **Walk** skill ([Train Stand and Walk with the Motor Kit](/help/train-stand-and-walk-with-the-motor-kit)).

You can also teach the robot the Case's task instead of driving it yourself. Go to **Train**, the section between **Control** and **Results**, and type a goal after **Teach it to**. The steps are in [Teach a robot a skill](/help/teach-a-robot-a-skill).

## Whether the robot can do it

The icon beside the Case's name matches the Case's row in **Build** ▸ **Checks**. Hold your pointer over the icon to see how many of 20 runs passed, or click it to open the row.

![The Simulate tab with Touch the Dots open and its Checks icon beside the name](/help/try-a-case/case.png)

Basecase checks the robot before it runs the Case, and the row names the first thing that stops it:

| What stops the robot | What the row says |
|---|---|
| The robot lacks what the Case needs | What the Case needs and what the robot has, such as "This Case needs driven wheels. This robot has a fixed base." |
| Basecase can't build the model | MuJoCo's error |
| The robot falls on hold during its first 1.5 s | When it fell, such as **Fell at 0.4 s** |
| A robot with four or more legs and no **Walk** falls during a 5-second walk | **Falls on its walk** |

![A Checks row saying the arm needs driven wheels for Reach a Spot, with New Case on its note](/help/try-a-case/misfit.png)

If the robot lacks what the Case needs, hold your pointer over the row's note and click **New Case**. Basecase then builds a Case the robot can do.

## Results

After a run, **Results** shows whether the robot stayed up and which joints worked hardest. Below that, the list of tries starts with the worst, so misses are at the top.

A replay includes anything the Case's code moved, lit, or hid during the try.

Tries from your real robot have a **Real** label. Click **Replay** on one, and Basecase draws its path over the path of the best sim try.

A passed try's menu has **Multiply**, which makes up to 50 varied passing tries from that try. The try's row then shows how many it made, such as **50 variations**. For steps, see [Multiply a try into demonstrations](/help/multiply-a-try-into-demonstrations).

To delete a try, right-click it, choose **Delete**, then confirm. Deleting a try deletes its variations with it.

If you [compare two robots on a Case](/help/compare-two-robots-on-a-case), their two rows appear above the tries. [Explore servo versions](/help/explore-servo-versions-on-a-case) puts its rows in the same place, below any comparison.

Basecase saves tries on this computer and leaves them out of shared `.basecase` files. With your tries, you can:

- Open tries from every scene in the Library ([Open a try from any scene](/help/open-a-try-from-any-scene)), and find them with search ([Search tries](/help/search-tries)).
- After a try passes, [export the passed tries as a dataset](/help/export-a-lerobot-dataset).
- Once five tries have passed, train a policy from them ([Train a policy from your tries](/help/train-a-policy-from-your-tries)).
