---
title: Build guide won't make or open
date: 2026-11-13
updated: 2026-11-13
collection: troubleshooting
type: troubleshooting
order: 6
keywords:
  - assembly pdf
  - generate guide greyed out
  - out of date
  - guide error
related:
  - make-a-build-guide
  - troubleshoot-build-check-blocks-ready-to-build
covers:
  - src/components/build/GuideSection.tsx
  - src/workspace/useBuildGuide.ts
  - src/guide/guidePlan.ts
  - src/components/settings/BuildPane.tsx
---

Two things stop most build guides: the scene has nothing to build, or the last run stopped with an error.

## Make Guide is grayed out

The guide shows the parts you'd build, which are the visible parts that aren't cutouts. If your scene has only hidden parts and cutouts, the guide has nothing to draw.

1. Show the parts you want in the guide.
2. Check that none of them are cutouts.

Once you've fixed the scene, **Make Guide** turns blue.

## “Couldn’t make the guide.”

This message means the run stopped with an error. Basecase shows the error right after the message. After a failed run, your last guide stays as it was until you change the scene again.

1. Click the button on the card again: **Make Guide** or **Update**.
2. If the same error comes back, read the reason after the message to see what stopped the run.

## The guide stays Out of date

Basecase updates the guide on its own 15 seconds after your last change, but not while the agent is working. If you stopped a guide, it stays as it was until you change the scene again.

A guide also shows Out of date if its order check hit the 20-second limit. The next automatic update tries once more, and **Update** tries again each time you click it.

1. Click **Update** in **Build guide**.
2. To have Basecase update the guide for you, press [[⌘,]], choose **Build**, then turn on **Update automatically**.

## Show in Finder and Open PDF are missing

These buttons are only in the desktop app. In the web studio, guides stay in your browser and open in the guide viewer.
