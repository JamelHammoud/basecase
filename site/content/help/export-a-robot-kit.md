---
title: Export a robot kit
date: 2026-11-16
collection: build-and-print
type: task
order: 9
keywords:
  - manufacturing
  - packing list
  - servo sheet
  - plates
  - kit
related:
  - import-and-export-formats
  - export-a-robot-package
  - robot-kit-contents
covers:
  - src/kit/
  - src/workspace/kitExport.ts
  - src/workspace/useKitExport.ts
  - src/guide/generateGuide.ts
hub_checks_and_blockers: |
  ## Checks in a manufacturing kit

  A [manufacturing kit](/help/export-a-robot-kit) records the original measurement time and whether the Checks match the exported design.
---

Save mechanical files, carrier-board sources, packing quantities and matching joint identities in one manufacturing archive.

Your scene must have movable joints. Assign one exact catalog actuator to each driven joint. Sheet parts must have a measured flat profile with through holes. Other unsupported fabrication stops export. A carrier board can export diagnostic sources when fabrication files are missing.

1. At the top right, click **Export**.
2. Choose **Kit**.

![The Export menu with Kit available for the rover](/help/export-a-robot-kit/menu.png)

3. In **Frame**, choose **Part** or **Scene**.
4. In **Front plane**, choose the drawing plane.
5. In **Scale**, choose the drawing scale.
![Kit drawing frame and scale controls for the rover](/help/export-a-robot-kit/options.png)

6. Click **Export**.
7. In your downloads, unzip `<scene>-kit.zip`.
8. In the unpacked folder, open `build-guide.html` in a browser.

Basecase saves the archive to your downloads. To discard the export, click **Cancel** in the progress toast.

![The arm after the kit archive has downloaded](/help/export-a-robot-kit/exported.png)

You can choose **Kit** from [[⌘K]]. You can use the same menu in the web studio.

![The web studio after downloading the rover’s kit](/help/export-a-robot-kit/web-exported.png)

A generated carrier adds an `electrical` folder. Read `electrical/requirements.json` before using its board files. If fabrication output is missing, the export confirmation says so.

![The Kit drawing options for the dual-bus arm with its carrier board](/help/export-a-robot-kit/electrical-options.png)

![The exported Kit confirmation reporting missing PCB fabrication](/help/export-a-robot-kit/electrical-diagnostic.png)

The drawings folder includes PDF, editable SVG, matching source STL files, source identities and authored tolerance evidence. Its declarations and stack results match standalone Drawings from the same frozen design.

Print plates can also include guide-letter cuts. Drawing preparation supports up to 256 scene parts and 64 MB of drawing output. You can export up to 256 MB before compression. If you edit the scene during preparation, Basecase discards the export. You won’t change readiness or program servos by exporting a kit.

Electrical and mechanical files share the kit’s design fingerprint. PCB fabrication files require current native KiCad validation. That validation establishes neither electrical performance nor assembly fit. Checks remains the build-readiness verdict.

For file names, packing quantities and Checks freshness, see [Robot kit contents](/help/robot-kit-contents).

For simulation models and trained policies, use [Export a robot package](/help/export-a-robot-package).
