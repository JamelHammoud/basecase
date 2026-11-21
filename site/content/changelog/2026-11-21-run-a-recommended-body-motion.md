---
title: Run a recommended body motion
date: 2026-11-21
image: /changelog/run-a-recommended-body-motion/cover.png
---

You can run a saved motion recommendation on a matching emulated unit and save its observations as an Operate try. The servo emulator can’t validate body mass, payload or floor contact.

In Analyze Try, you can go from Preview Motion to Run. An unresolved payload can suggest a useful simulated motion, but the prediction isn’t a measurement of the connected unit.

Before execution, Run rechecks the saved model, calibration, joint order and measured starting pose. If the pose differs, Run refuses execution without adding a move into place. Motion declarations last at most two seconds.

Stop, faults, disconnection and source changes end execution. You keep the recommendation and actual observations in both completed and interrupted recordings. Open the recording from Library to view it in the try timeline.

In Method, you can see execution provenance beside the saved prediction. Fit Body uses the selected observations and can’t activate a calibration for dynamics the backend lacks. You can’t run these motions on a real device.

Steps are in [Run a recommended body motion](/help/run-a-recommended-body-motion).
