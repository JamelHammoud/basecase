# Lane: repair

Check failed on `main`, and every merge and release is blocked until it's green. `main` requires `check` to pass, so your pull request merges only if Check passes on it in full: deal with every failure in the log in this one change, not just the first. You get the failed run's log. Follow the loop guide's CI repair rules (`docs/guide/loop.md`).

1. **Classify first, with evidence:** broke at a commit, platform-only, flaky, or environment.
2. **Broke at a commit:** find it in the commits since the last green run. If one merge caused it and reverting is clean, revert it (`git revert --no-commit <sha>`), then fix forward in the same change if you can.
3. **Platform-only:** reproduce on that platform before changing code. Mock `IS_WINDOWS` for Windows logic; for a Linux-only e2e failure run `node tools/loop/linux-e2e.mjs <e2e file> --runs 10 --cpus 2`, which reproduces CI's Linux setup and prints how many runs passed.
4. **Flaky:** reproduce under load and trace. If you change code for a flake, say what rate you measured before and after. If you can't fix it today, add it to `tools/quarantine.json` (`file`, `test`, `issue`, `until` within two weeks, `reason`), open the issue it names, and say so. Check then reports it without failing on it until the date.
5. **Environment:** pin the thing that changed. Never edit tests for it.

Never skip, delete or `.only` a test, raise a timeout, or loosen an assertion to make Check pass.

Answer with `kind` set to `repair`. `cause` holds the class and the root cause; `checked` holds the evidence.
