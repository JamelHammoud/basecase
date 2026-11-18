---
title: Link dimensions with shared parameters
date: 2026-11-17
collection: design
type: task
covers:
  - src/components/inspector/ParametersSection.tsx
  - src/components/inspector/ParameterRow.tsx
  - src/components/inspector/ParameterBindings.tsx
  - src/workspace/useDesignParameters.ts
  - src/utils/designParameters/
hub_the_design_agent: |
  [Link dimensions with shared parameters](/help/link-dimensions-with-shared-parameters) keeps editable parts and mounting patterns tied to the same named value.
hub_checks_and_blockers: |
  Shared dimensions block the build when their saved values disagree with their parameters or their geometry hasn't passed validation. [Link dimensions with shared parameters](/help/link-dimensions-with-shared-parameters) explains how to edit their declarations and bindings.
---

Use shared parameters to change the dimensions of a chassis, mounting plate and hole pattern together.

You must use the desktop app and have an editable part in the scene. You can’t bind catalog product dimensions.

1. In the command palette, choose **Edit Parameters**.
2. Under **Parameters**, enter `width` in **Name**.
3. In **Value**, enter `160`.
4. In **Unit**, choose **mm**.
5. Click **Add**.
6. In **Layers**, select the editable part.
7. In **Dimension**, choose the dimension to link.
8. In **Expression**, enter `width`.
9. Click **Bind**.
10. Under **Parameters**, change `width` to `200` and press [[↩]].

![A rover mounting plate bound to the shared width](/help/link-dimensions-with-shared-parameters/bindings.png)

Repeat steps 6 through 9 for related dimensions. For mounting spacing, you can use `width - 40 mm`. For a narrower plate, use `width - 16 mm`.

![The rover deck and mounting plate after changing width to 200](/help/link-dimensions-with-shared-parameters/width.png)

Open the command palette with [[⌘K]]. Use millimeters for primitive dimensions and degrees for sketch angles. For an OpenSCAD dimension, include its declared unit in the binding.

Edit a parameter’s name to rename its references in the same edit. To delete a parameter that’s in use, choose **Freeze and Delete**. This keeps dependent dimensions at their current values.

Choose **Unbind** to edit a dimension on its own. Unbind also releases a CAD or Sketch part for scaling. Unbind dimensions before saving the parts to Library or pasting them into another scene. If you change declarations before pasting, copy the parts again.

If regeneration fails, you keep the previous complete design. Use Undo and Redo to restore the declarations and geometry together. Basecase automatically validates reopened bindings before their geometry counts as current in Checks.

To print several values before choosing one, [compare clearances on a fit test plate](/help/compare-fit-clearances). Applying a coupon value keeps its source and material with the parameter as a design choice.

See [Checks and blockers](/help/checks-and-blockers) before building the changed design.
