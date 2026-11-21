---
title: Grade a class
date: 2026-11-16
collection: simulate-and-train
type: task
covers:
  - src/classroom/ClassroomApp.tsx
  - src/classroom/SubmissionTile.tsx
  - src/classroom/grading.ts
  - src/classroom/ClassroomReplay.tsx
related:
  - assign-a-case
  - submit-a-robot
hub_run_a_case: |
  Assign a starter robot and grade submitted designs locally with [Grade a class](/help/grade-a-class).
---

Compare submitted robots against the same task, then inspect their Checks or replay their weakest seeded run.

1. In the browser studio, press [[⌘K]].
2. Choose **Classroom**.
3. In **Assignment file**, select your original `.caseclass` file.
4. In **Submission files**, select your students' `.casesubmit` files.
5. Click **Grade**.
6. On a submission, click **Open Scene** to inspect its design and failing Check.

![Two graded submissions with cost, mass, Case results and engineering Checks](/help/grade-a-class/results.png)

You can drop submission files onto Classroom. Click **Replay** to open the weakest seeded run and use the existing playback controls.

Use the teacher's original assignment to grade submissions. You can’t grade submissions from a different assignment revision. You can use fingerprints to detect changed content, but you can’t use them to authenticate authorship.

You evaluate the design with the reference controller. You don’t evaluate a student's learned controller through this result.

You get cost estimates without your personal inventory or checked purchase prices. If pricing is incomplete, you won’t get a Budget evaluation unless the known subtotal exceeds the budget.

You can keep up to 30 submissions and 64 MB of submission files in Classroom in this browser. Each file can be at most 8 MB.

You’ll see one submission for repeated files. You’ll see changed robot revisions as separate submissions, even if their display names match.

Click **Cancel** to release grading workers. Click **Delete** and confirm to remove a saved submission. You can open a robot and keep Classroom available in its original tab.

Use **Annotate** in the opened scene for feedback. You don’t gain Ready to build status or retain a skill through Classroom results.
