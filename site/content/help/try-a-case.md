---
title: Try a Case
date: 2026-11-13
covers:
  - src/components/SimulatePanel.tsx
  - src/components/simulate/CaseSections.tsx
  - src/components/simulate/ResultsSection.tsx
  - src/components/simulate/RunResult.tsx
  - src/workspace/caseCommands.tsx
---

Drive your robot through a Case's task in the simulator and keep each try, so you can see whether the design can do the job and export the passing tries as training data.

1. Open the Play view, choose Cases and click a Case, or click New Case to make one. The Simulate tab opens with the Case at the top: its name, then what the robot has to do.
2. Click Check Fit beside the name. The rows under the brief say whether the robot fits this Case, compiles, settles and stays up.

![The Simulate tab with Touch the Dots open and its fit rows under the brief](/help/try-a-case/case.png)

3. Click Try It under Try, or choose Try ⟨Case⟩ in ⌘K. The clock counts down the Case's time, and the keys for your robot are listed under it.
4. Click the canvas and drive with the keys. Press R to start over. Click End Try when you're done, or let the clock run out.

![A try running, with the clock, End Try and the arm's keys](/help/try-a-case/try.png)

5. Read Results at the bottom of the tab. Peak torque lists the joints that worked hardest in the last run; click one to select its link. Each try is listed with Passed or Missed, its time and a filmstrip. Click the play button on a try to replay it, or right-click it to delete it.
6. Once a try passes, click Export Dataset to download the passing tries as a LeRobot dataset. It's also in ⌘K.

![Results with the last run's peak torque, a passed try and Export Dataset](/help/try-a-case/results.png)

Close Case, the × beside Check Fit, puts the tab back to Control, Train and Results. A connected emulated robot shows its status in Operate, in the Play view, while you try.
