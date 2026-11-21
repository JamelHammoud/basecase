---
title: Replay motor current
date: 2026-11-20
image: /changelog/replay-motor-current/cover.png
---

You can now replay modeled motor loads through declared supply and cable resistance in **Build** ▸ **Electrical connections**. Select the lowest-voltage endpoint to locate its part and trace time.

Two joints can peak together while sharing a return cable. You won't see the shared voltage drop in their separate average currents. With replay, you use the synchronized current windows from design verification instead of rebuilding a waveform from those averages.

Enter outgoing and return resistance in ohms, with evidence and temperature assumptions. In the worker's report, you can see endpoint voltage, cable current and resistive loss. Change one resistance to compare against the same frozen trace. Reopen a run to reproduce the retained inputs. After electrical edits, the evidence has a historical marker.

For this first model, you can use one DC source and paired cable trees, with up to 64 loads and 128 cable segments. You can retain runs up to 4 MB. You can't run replay with missing resistance, missing loads, regulators or ambiguous actuator allocations. You can't establish shorter brownouts or switching transients from recorded windows.

Motion and calibration stay unchanged, and Checks remains the build verdict.

Steps are in [Replay motor current](/help/replay-motor-current).
