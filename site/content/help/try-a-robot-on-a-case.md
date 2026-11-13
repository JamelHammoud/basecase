---
title: Try a robot on a Case
date: 2026-11-12
updated: 2026-11-13
collection: simulate-and-train
type: task
order: 4
covers:
  - src/components/SimulatePanel.tsx
  - src/components/simulate/CaseSections.tsx
  - src/components/simulate/ResultsSection.tsx
  - src/components/simulate/TrainSection.tsx
  - src/utils/engineeringSimModel.ts
---

Give your robot a task in a simulated world, drive it through, and keep the tries that passed as training data.

1. Click **Play** in the left rail, then **Cases**.
2. Click **New Case** to pick a world and a goal. The Simulate tab opens with the Case at the top: its name, its brief, **Check Fit** and the × that closes it.
3. Click **Check Fit** to see whether the robot fits this Case, compiles and stays up.

![The Simulate tab with Touch the Dots open and its fit checked](/help/try-a-robot-on-a-case/case.png)

4. Click **Try It**. The clock counts down the Case's time, and the keys for your kind of robot appear under it.
5. Click the canvas and drive with W A S D. R starts over and Esc stops.

![A try running, with the clock, End Try and the keys](/help/try-a-robot-on-a-case/trying.png)

6. Click **End Try**, or let the time run out.
7. Read **Results** at the bottom of the tab: how the latest run went, then every try with Passed or Missed and a filmstrip. Click **Replay** on a try to watch it again, or right-click it to delete it.
8. Once a try passes, click **Export Dataset** under the tries, or choose it in ⌘K.

![Results with the latest run and one try](/help/try-a-robot-on-a-case/results.png)

To teach the robot instead of driving it, use **Train**, between Control and Results: type a goal after **Teach it to**, or click a trained policy to run it.

What the simulation has to guess is in **Build ▸ Checks**. **Torque estimates** names the joints without a servo, whose strength is estimated from the weight they hold, and **Servo models** names servos the simulation has no measured model for. Click a part under either to select it.

![Checks with Torque estimates open on a joint without a servo](/help/try-a-robot-on-a-case/checks.png)

A connected emulated robot shows its live status in **Play ▸ Operate**, beside the Simulate tab.
