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

Print each part with its build guide letter cut into a hidden face, so a left and a right bracket can't be mixed up on the bench.

1. Press ⌘P (Ctrl+P on Windows) to open Print mode.
2. Under **Printer**, check that **Label parts** is on. It starts on.
3. To leave one part plain, select it and turn on **Don't label**.
4. Send, slice or export the plates as usual. The letters are cut in as each plate is written.

![The Print panel with Label parts on, Don't label for Body Tray, and two parts whose letter was left off](/help/label-printed-parts/print-mode.png)

Each letter is the one the build guide and Build Along use for that part. It sits 0.4 mm deep and 4 to 10 mm tall, as near the middle as it fits, on the largest flat face that doesn't show once the robot is built.

![The inside floor of a printed tray with its letter E, where the lid covers it](/help/label-printed-parts/letter.png)

A face only gets a letter if it touches no other part and isn't the face the part prints on. A part with no such face prints without its letter. Its row in **Parts** says so, such as “Letter C left off: no flat face is hidden, free and big enough”.

The letters change only the plate files, never the part in your scene. A plate you've already printed still counts as printed. If you [make a build guide](/help/make-a-build-guide) after the plates are sliced, the letters still match it: plates are sliced again whenever the letters could have changed.
