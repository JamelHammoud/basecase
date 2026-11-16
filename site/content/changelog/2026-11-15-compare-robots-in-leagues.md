---
title: Compare robots in Leagues
date: 2026-11-15
image: /changelog/compare-robots-in-leagues/cover.png
---

You can compare shared robots on a pinned Case, replay their measured seeds in the browser, and open either robot in the studio.

Choose Enter League beside Share Robot or from the command palette. You submit an immutable robot revision, so updating a shared link can’t change an accepted entry. To submit, you need the desktop app, a Hugging Face account and a trusted CI receipt before the League deadline.

Two rover bodies can follow the same route and fail for different reasons. In Rover sprint, you can compare two different bodies on one Case. On the board, you can see passes, score and Budget. Open a seed to see the run’s actual contract verdict.

In the standings, entries rank by passes, then the declared score direction, then lower Budget. A stable identity breaks remaining ties. Entries with missing prices or geometry stay unmeasured.

After closure, you must dispatch a CI replay to freeze the accepted entries, generate held-back seeds and record the engine, content hashes and every verdict. You publish in a separate step. The replay receives no publishing credentials, and browser replays stay provisional.

You can’t enter Leagues with executable Case panels, Case logic or imported worlds.

Follow the steps in [Replay a League](/help/replay-a-league).
