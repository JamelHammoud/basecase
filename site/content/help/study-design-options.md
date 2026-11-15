---
title: Study design options
date: 2026-11-14
collection: simulate-and-train
type: task
order: 13
keywords:
  - study
  - explore
  - which servo to buy
  - servo version
  - servo model
  - battery
  - foot size
  - named dimension
  - supply voltage
  - frontier
  - study_design
related:
  - compare-two-robots-on-a-case
  - try-a-case
covers:
  - src/study/
  - src/workspace/useStudy.ts
  - src/workspace/studyRun.ts
  - src/components/simulate/StudySection.tsx
  - src/components/simulate/StudyKnobField.tsx
  - src/components/simulate/StudyCatalogField.tsx
  - src/components/simulate/StudyRows.tsx
  - src/components/simulate/StudyPlot.tsx
  - src/workspace/caseCommands.tsx
hub_the_design_agent_order: 100
hub_the_design_agent: |
  - Ask it to compare design choices. It runs [Study](/help/study-design-options) on combinations of servos, power supplies and part sizes, with Checks, cost, mass and optional Case passes.
---

Compare combinations of servos, power supplies and part sizes, then apply one design with its cost, weight and checks beside it.

1. Press [[⌘K]] and choose **Study**.
2. In **Study**, turn on the design choices you want to vary.
3. In each enabled choice, select the catalog options or enter numeric values separated by commas.

![Study configured with two foot length scales and three foot width scales](/help/study-design-options/configure.png)

4. In **Study**, click **Run Study**.

![Study results with a metric plot and six graded designs](/help/study-design-options/results.png)

5. Above the plot, choose the metrics for **Horizontal**, **Vertical** and **Color**.
6. Hover over a design to preview its robot on the canvas.

![A Study design previewed on the canvas beside its results](/help/study-design-options/preview.png)

7. Hold [[⇧]] and click up to four designs to compare them.

![Two Study designs selected for comparison](/help/study-design-options/compare.png)

8. On the design you want, click **Apply**.

![The applied Study design marked as the current robot](/help/study-design-options/applied.png)

A Study works on copies of any scene with parts. You need an available design choice, such as a joint with a catalog servo or a part with named dimensions. To include a Case's pass count, open that Case before you start. The Case must have one robot.

You can also right-click a selected robot and choose **Study**, or ask the agent to compare design options.

For another servo model, choose **Add Servo**.

**Foot length** and **Foot width** use scales such as `1, 1.25, 1.5`. A scale of 1 keeps the current size. Agent-made OpenSCAD parts offer the same named dimensions as the Inspector. You must use the desktop app to study named dimensions.

Each design keeps its check results, including failures. A design that couldn’t be measured stays in the table as **Failed**, with **Apply** disabled. Cost uses the bill of materials, including parts you own. Weight and runtime use the same calculations as Checks. Click **Checks**, **Cost** or **Weight** above the table to sort the designs.

With a Case, each design gets 8 seeded runs with small changes in friction, weight, servo strength and delay. The same seeds run on every design. A Study tries up to 64 combinations. Larger spaces use a repeatable sample.

The frontier marks designs that no other eligible design beats across cost, weight, runtime and available Case results. Designs with a failed check or a Case refusal stay visible but leave the frontier.

The Study saves with the scene, and its workers can continue while you edit. Closing the scene or app ends the run. Its results describe the robot when the Study started. Other edits mark the results out of date and disable **Apply**. Run the Study again to measure those changes.

**Apply** commits the complete design in one step. Press [[⌘Z]] to undo it. To compare robots with different layouts, see [Compare two robots on a Case](/help/compare-two-robots-on-a-case).
