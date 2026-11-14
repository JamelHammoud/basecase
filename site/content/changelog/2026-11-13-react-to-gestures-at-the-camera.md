---
title: React to gestures at the camera
date: 2026-11-13
image: /changelog/react-to-gestures-at-the-camera/cover.png
---

You can now make a Case react to a wave, a clap, a nod or a movement you teach it. Gestures work in the simulation, read from your computer's camera.

Ten gestures are built in: Wave, Raise Hand, Raise Both Hands, Point Left, Point Right, Thumbs Up, Open Palm, Clap, Nod and Shake Head. Teach Gesture in ⌘K records any other movement three times and saves it in the Case.

The camera already moved a humanoid's arms along with yours. A wave at it couldn't make the humanoid wave back.

Each gesture becomes one event for the Case's logic. A wave held for 3 seconds fires once. Built-in gestures are measured in shoulder widths, so a child and an adult both fire them. A taught gesture matches within 1.8 times the gap between your own three recordings, made faster or slower. Recognition runs beside pose estimation, at 0.13 ms a frame on an M5 Pro.

Gestures work while the camera drives a humanoid or a fixed arm. Thumbs Up and Open Palm read the pose model's three points per hand, so they need the hand clearly in front of you. Only the taught recordings are saved; the camera's picture never is.

Steps are in [Teach a robot a gesture](/help/teach-a-robot-a-gesture).
