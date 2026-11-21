---
title: Compare robot revisions
date: 2026-11-20
collection: simulate-and-train
type: task
hub_open_a_try_from_any_scene: |
  Frozen evaluation failures reopen their recorded scene and model. [Compare robot revisions](/help/compare-robot-revisions) on identical Cases and seeds, then import a failure.
hub_open_a_try_from_any_scene_order: 40
covers:
  - tools/cli/basecase.mjs
  - tools/cli/evaluationFreeze.mjs
  - tools/cli/evaluationRun.mjs
  - tools/cli/evaluationReport.mjs
  - src/cases/evaluationExecution.ts
  - src/cases/evaluationReplay.ts
  - src/workspace/tryFileActions.ts
---

Compare two robot revisions on identical Cases and seeds, then inspect recorded failures offline.

You must use a Basecase checkout with Node installed.

1. With **Export** ▸ **Scene**, save each revision as a `.basecase` file with the same Cases.
2. In the checkout, freeze the revisions and ordered seeds:

   ```sh
   node tools/cli/basecase.mjs evaluation freeze baseline.basecase --candidate candidate.basecase --package evaluation --seeds 7,3 --conditions fixed
   ```

3. Run the frozen evaluation into a new folder:

   ```sh
   node tools/cli/basecase.mjs evaluation run evaluation --output comparison
   ```

4. Open `comparison/report.html` to read the paired outcomes and margins.

   ![Two rover trials with passing baseline and failed candidate results](/help/compare-robot-revisions/report.png)

5. In the studio, press [[⌘K]] and choose **Import**.
6. Select a `.tries.zip` failure file linked from the report.
7. In **Library**, open the imported robot under **Tries**.
8. Select the failed try to open its timeline.

   ![The imported rover failure open in the ordinary timeline](/help/compare-robot-revisions/failure.png)

You open the frozen source scene when you import a failure. In the timeline, you can inspect the retained model, Case, seed, trace and effort measurements. If you open the failure from a different scene, Basecase opens its recorded source in a new tab and keeps your working scene intact.

Use `--conditions fixed` to keep world objects fixed while the seed draws physics conditions. Use `--conditions randomized` to vary the world as well. Add `--randomization nominal` for preset physics without those variations.

You use reference controllers by default. Use `--policy policy.json` for an existing Basecase policy, or `--candidate-policy policy.json` to change only the candidate's controller. Basecase refuses unsupported robot/controller combinations. Your Cases need one robot slot and no code panels.

A completed comparison exits 1 if a passing baseline trial fails in the candidate. Exit 0 means no paired pass losses. Exit 2 means execution couldn’t complete. You still need Checks and skill retention in addition to these results.

You can evaluate up to 16 Cases, 32 distinct seeds and 600 simulated seconds across both revisions. You can simulate each Case for up to 30 seconds and record up to eight failures within a shared 16 MiB budget.

To cancel an evaluation on any platform, pass `--stop-file stop-evaluation` when running, then create that file. If you interrupt the evaluation, its output remains incomplete.

To verify a copied report without running physics, use `node tools/cli/basecase.mjs evaluation inspect comparison`.

Copy the whole comparison folder to keep its frozen inputs and failure recordings together.
