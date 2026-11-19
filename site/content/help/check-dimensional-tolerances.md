---
title: Check dimensional tolerances
date: 2026-11-18
collection: engineer
type: task
covers:
  - src/components/inspector/ParameterTolerance.tsx
  - src/components/inspector/DimensionalRequirements.tsx
  - src/readiness/tolerances.ts
  - src/sheet/drawingTolerances.ts
hub_checks_and_blockers: |
  [Check dimensional tolerances](/help/check-dimensional-tolerances) compares authored manufacturing deviations with a declared clearance interval.
  Missing deviations leave a requirement unresolved. Passing one establishes only its declared dimensional interval.
hub_troubleshoot_build_check_blocks_ready_to_build_order: 30
hub_troubleshoot_build_check_blocks_ready_to_build: |
  ## Dimensional tolerances is red

  An authored clearance requirement exceeds its acceptable interval or lacks manufacturing data.

  1. In **Checks**, open **Dimensional tolerances**.
  2. Click **Edit Parameters** to select the contributing parts and reopen their declarations.
  3. Correct the declared dimensions or supply their explicit manufacturing deviations.

  ![The spacer clearance fails its declared interval](/help/check-dimensional-tolerances/failed-stack.png)

  [Check dimensional tolerances](/help/check-dimensional-tolerances) explains the requirement controls. A passing requirement doesn’t establish physical fit or clear other blockers.
---

Check whether linked dimensions can exceed a declared clearance interval as manufactured sizes vary.

Start with editable dimensions [linked to shared parameters](/help/link-dimensions-with-shared-parameters) in the desktop app. Enter explicit manufacturing deviations for each contributor. Passing a requirement doesn’t establish physical fit or build readiness.

1. In the command palette, choose **Edit Parameters**.
2. Under **Parameters**, enter the signed **Lower deviation** for a numeric mm parameter.
3. In **Upper deviation**, enter its upper deviation and press [[↩]].
4. Repeat for each contributing numeric dimension.
5. Under **Parameters**, open **Dimensional tolerances**.
6. In **Name**, enter a requirement name such as `clearance`.
7. In **Expression**, enter the stack, such as `outer - inner`.
8. In **Minimum**, enter the lowest acceptable value in mm.
9. In **Maximum**, enter the highest acceptable value in mm.
10. Turn on the contributing part dimensions.
11. Click **Add**.
12. In **Build**, open **Dimensional tolerances**.

![Spacer dimensions with explicit deviations and the authored clearance requirement](/help/check-dimensional-tolerances/parameters.png)

For a 30.3 mm opening and a 30 mm spacer, nominal clearance is 0.3 mm. With opening deviations of −0.1/+0.2 mm and spacer deviations of −0.05/+0.25 mm, the clearance ranges from −0.05 to 0.55 mm.

This range fails a 0 to 1 mm interval, despite the positive nominal clearance.

![The spacer clearance fails its declared interval](/help/check-dimensional-tolerances/failed-stack.png)

In the failing result, click **Edit Parameters** to select its parts and reopen their declarations. Change `inner` to `29.8` and press [[↩]]. The clearance ranges from 0.15 to 0.75 mm. Use Undo to restore the failed requirement.

![The edited spacer passes its dimensional requirement](/help/check-dimensional-tolerances/passed-stack.png)

You can use addition, subtraction, and multiplication or division by a unitless constant in expressions. Shared references cancel before the bounds calculation. Use separate parameters for separate manufactured dimensions to represent independent variation.

Select an existing requirement's name to edit it, then click **Save**. Remove requirements before freezing or deleting their parameters. Supply missing deviations to resolve a requirement. You can’t use Fit Test choices as manufacturing tolerance data.

[Export dimensioned drawings](/help/export-dimensioned-drawings) to include the declarations and results with their frozen source. You get the same evidence in Kit. To add dimension annotations, you need an unambiguous authored box dimension. Keep mesh approximation limits separate.
