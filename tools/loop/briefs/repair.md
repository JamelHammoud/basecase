# Lane: repair

The nightly full suite failed on `main`. Merges keep landing, but no release goes out until the suite passes, and your pull request's own Check covers only what it changes: deal with every failure in the log in this one change, not just the first. You get the failed run's log. Follow the loop guide's CI repair rules (`docs/guide/loop.md`).

1. **Classify first, with evidence:** broke at a commit, platform-only, flaky, or environment.
2. **Broke at a commit:** find it in the commits since the last green run. If one merge caused it and reverting is clean, revert it (`git revert --no-commit <sha>`), then fix forward in the same change if you can.
3. **Platform-only:** mock `IS_WINDOWS` for Windows logic. For a Linux-only e2e failure, `node tools/loop/linux-e2e.mjs <e2e file> --runs 3 --cpus 2` reproduces CI's Linux setup and prints how many runs passed.
4. **Flaky:** fix it here only when the log and the code show the cause. Otherwise add it to `tools/quarantine.json` (`file`, `test`, `issue`, `until` within two weeks, `reason`) and open the issue it names with the labels `loop:fix`, `loop:next` and `loop:priority`, so a builder makes it deterministic and measures the rate before and after. Never measure flake rates in this session.
5. **Environment:** pin the thing that changed. Never edit tests for it.

The lane has one slot, so every failure that lands while you work waits for you. Aim to open your pull request within 30 minutes.

Never skip or `.only` a test, raise a timeout, add a retry, or loosen an assertion to make Check pass. Deleting a flaky, slow or narrow test is fine when a faster test covers what users rely on (`docs/guide/running-and-testing.md`); say what covers it.

Answer with `kind` set to `repair`. `cause` holds the class and the root cause; `checked` holds the evidence.
