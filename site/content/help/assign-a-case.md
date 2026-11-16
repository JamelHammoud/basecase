---
title: Assign a Case
date: 2026-11-16
collection: simulate-and-train
type: task
covers:
  - src/workspace/classroomActions.ts
  - src/workspace/classroomCommands.tsx
  - src/classroom/envelope.ts
related:
  - submit-a-robot
  - grade-a-class
---

Send students a starter robot with one task, a budget and a fixed set of grading seeds in a downloadable file.

1. In the browser studio, open the scene that contains your robot and Case.
2. In **Build**, set the **Budget**.
3. In **Cases**, click the Case you want to assign.
4. Press [[⌘K]].
5. Choose **Export Assignment**.
6. Send the downloaded `.caseclass` file to your students.

![Export Assignment in the command palette with a rover Case open](/help/grade-a-class/export.png)

The assignment uses the Case's reference controller for seeds 1 through 20. It includes the starter robot, task contract and required world assets.

The Case must have one robot slot. A file can contain up to 256 parts and 64 joints, with a size limit of 8 MB. Before you export, replace code-generated shapes with supported shapes or baked meshes.

Students follow [Submit a robot](/help/submit-a-robot). Collect their files with [Grade a class](/help/grade-a-class).
