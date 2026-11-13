---
title: Make a build guide
date: 2026-11-13
updated: 2026-11-13
collection: build-and-print
type: task
order: 7
keywords:
  - assembly instructions
  - pdf
  - manual
  - steps
  - build order
related:
  - print-a-robots-parts
  - troubleshoot-build-guide-wont-make
  - from-design-to-build
covers:
  - src/components/build/GuideSection.tsx
  - src/components/build/guideViewer/GuideViewer.tsx
  - src/workspace/useBuildGuide.ts
  - src/components/settings/BuildPane.tsx
  - src/guide/
  - electron/guidePdf.mjs
---

Turn the design into a step-by-step assembly PDF, in an order Basecase checked the parts can go together.

1. In the **Build** tab, find **Build guide**.
2. Click **Generate Guide**. The card shows the step it's drawing and the time left, and you can keep working.
3. When the toast says the guide is made, click **Open**.

   ![The Build guide card with an 8-page guide made just now and an Open button](/help/make-a-build-guide/current.png)

4. Press → or ← to turn the pages.
5. Press Esc to close the guide.

Pinch, or press + and −, to zoom. In the desktop app, **Open PDF** opens the file and **Show in Finder** shows where it's saved. If the PDF was moved or deleted, either one makes it again first.

## Keep it current

When the design or the infill in Print mode changes, the card reads **Out of date** in amber, and **Update** appears beside **Open**.

![The Build guide card reading Out of date, with Open and Update buttons](/help/make-a-build-guide/out-of-date.png)

Basecase also updates the guide on its own, 15 seconds after the last change, once the agent is done. An update redraws only the steps that show the parts you changed.

To stop the automatic updates, press ⌘, (Ctrl+, on Windows), choose **Build** and turn off **Update automatically**.

## Steps marked as unchecked

Steps follow an order Basecase proved works. Parts the planner couldn't place come first, in a likely order, and their steps say “Order not checked”.

To print the parts the guide uses, see [Print a robot's parts](/help/print-a-robots-parts).
