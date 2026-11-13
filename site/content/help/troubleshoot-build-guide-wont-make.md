---
title: Build guide won't generate or open
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
  - pdf missing
related:
  - make-a-build-guide
  - troubleshoot-build-check-blocks-ready-to-build
covers:
  - src/components/build/GuideSection.tsx
  - src/workspace/useBuildGuide.ts
  - src/guide/guidePlan.ts
  - src/components/settings/BuildPane.tsx
---

Most build guide problems come from a scene with nothing to build, or a guide file that was moved.

## Generate Guide is greyed out

The guide shows only parts you'd build: visible parts that aren't cutouts. A scene of hidden parts or cutouts has nothing to draw.

1. Show the parts you want in the guide.
2. Check that they are solid parts, not cutouts.

It worked when **Generate Guide** turns blue.

## “Couldn’t make the guide.”

The run stopped with an error, shown after the message. A failed run leaves the last guide alone until the scene changes again.

1. Click the card's button again: **Generate Guide**, **Update** or **Regenerate**.
2. If the same error comes back, read the reason after the message. It names what stopped the run.

## “Regenerate the guide to open it”

The PDF isn't where Basecase saved it, often because the file was moved or deleted. Click **Regenerate**, then **Open**.

## The guide stays Out of date

Basecase updates the guide on its own 15 seconds after the last change, but waits while the agent is working. A guide you stopped also stays as it was until the scene changes again.

1. Click **Update** in **Build guide**.
2. To have it update on its own, press ⌘, (Ctrl+, on Windows), choose **Build** and turn on **Update automatically**.

## Show in Finder and Open PDF are missing

Those buttons are in the desktop app only. The web studio keeps guides in your browser and opens them in the guide viewer.
