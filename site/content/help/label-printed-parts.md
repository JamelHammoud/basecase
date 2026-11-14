---
title: Label printed parts with their guide letters
date: 2026-11-13
collection: build-and-print
type: task
keywords:
  - label
  - letter
  - deboss
  - engrave
  - part names
  - mirrored parts
related:
  - print-a-robots-parts
  - make-a-build-guide
covers:
  - src/print/labels/
  - src/workspace/usePlateWriter.ts
  - src/three/analysis/plateFiles.ts
  - src/components/print/PrintPanel.tsx
  - src/components/print/PrintedSection.tsx
---

You can print each part with its build guide letter cut into a hidden face, so a left bracket and a right bracket can't get mixed up on the bench.

1. Press [[⌘P]] to open Print mode.
2. Under **Printer**, check that **Label parts** is on. It's on by default.
3. To leave a part plain, select it and turn on **Don't label**.
4. Send, slice or export the plates as usual. Basecase cuts the letters in as it writes each plate.

![The Print panel with Label parts on, Don't label for Body Tray, and two parts whose letter was left off](/help/label-printed-parts/print-mode.png)

Each part gets the same letter that the build guide and Build Along use for it. The letter is 0.4 mm deep and 4 to 10 mm tall, and sits on the largest flat face that doesn't show once the robot is built, as close to the middle of that face as it fits.

![The inside floor of a printed tray with its letter E, where the lid covers it](/help/label-printed-parts/letter.png)

A face gets a letter only if it doesn't touch any other part and isn't the face the part prints on. If a part has no face like that, it prints without its letter, and its row in **Parts** tells you so. For example: “Letter C left off: no flat face is hidden, free and big enough”.

The letters change only the plate files. The part in your scene stays the same, and a plate you've already printed still counts as printed. If you [make a build guide](/help/make-a-build-guide) after the plates are sliced, the letters still match it, because Basecase slices the plates again whenever the letters could have changed.
