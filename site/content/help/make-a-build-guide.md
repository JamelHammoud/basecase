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
  - src/workspace/buildCommands.tsx
  - src/components/settings/BuildPane.tsx
  - src/guide/
  - electron/guidePdf.mjs
---

Basecase turns your design into a step-by-step assembly guide and saves it as a PDF. It checks the order of the steps to make sure the parts can go together.

1. In the **Build** tab, find **Build guide**.
2. Click **Make Guide**. The card shows which step it's drawing and how much time is left. You can keep working while it runs.
3. Once a toast says the guide is made, click **Open**.

   ![The Build guide card with an 8-page guide made just now and an Open button](/help/make-a-build-guide/current.png)

4. To turn the pages, press [[→]] or [[←]].
5. To close the guide, press [[Esc]].

You can also run **Make Build Guide** and **Open Build Guide** from [[⌘K]].

A check beside a step's number means you've marked every printed part in that step as printed in Print mode. The check doesn't appear in the PDF.

To zoom, pinch or press + and −. In the desktop app, **Open PDF** opens the file and **Show in Finder** shows where Basecase saved it. If you've moved or deleted the PDF, either button makes it again first.

## Keep it current

If you change the design, or the infill in Print mode, the card reads **Out of date** in amber, with **Update** beside **Open**. **Update Build Guide** in [[⌘K]] does the same.

![The Build guide card reading Out of date, with Open and Update buttons](/help/make-a-build-guide/out-of-date.png)

Basecase updates the guide on its own 15 seconds after your last change, once the agent finishes. Each update redraws only the steps that show the parts you changed.

To turn off automatic updates, press [[⌘,]], choose **Build**, then turn off **Update automatically**.

## Steps marked as unchecked

Basecase checks that the steps work in the order shown. Parts the planner couldn't place go first, in a likely order, and their steps say “Order not checked”.

Basecase spends up to 20 seconds checking the order. If it stops early, the card reads **Out of date**. Click **Update** to check the order again.

To print the parts the guide uses, see [Print a robot's parts](/help/print-a-robots-parts).
