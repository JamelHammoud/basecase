# Lane: repair

The nightly full suite failed on `main`. Merges keep landing, but no release goes out until the suite passes, and your pull request's own Check covers only what it changes: deal with every failure in the log in this one change, not just the first. You get the failed run's log. Follow the loop guide's CI repair rules (`docs/guide/loop.md`).

1. **Classify first, with evidence:** broke at a commit, platform-only, flaky, or environment.
2. **Broke at a commit:** find it in the commits since the last green run. If one merge caused it and reverting is clean, revert it (`git revert --no-commit <sha>`), then fix forward in the same change if you can.
3. **Platform-only:** mock `IS_WINDOWS` for Windows logic. For a Linux-only e2e failure, `node tools/loop/linux-e2e.mjs <e2e file> --runs 3 --cpus 2` reproduces CI's Linux setup and prints how many runs passed.
4. **Intermittent:** identify the failing stage and fix its source or fixture ownership. Preserve the declaration, assertions and platform coverage. Do not add a quarantine entry or extend an existing exclusion. If the evidence is insufficient, report that limit and leave the failure available for its owning investigation.
5. **Environment:** pin the thing that changed. Never edit tests for it.

A frozen proof dependency stays on its approved implementation and source hash. Restore that source and put live extensions in an adapter when needed. Keep `verify/gates/` and `verify/manifest.json` unchanged during an automatic repair. A new hash needs explicit maintainer approval.

The lane has one slot, so every failure that lands while you work waits for you. The runner enforces a 30-minute total session deadline, including startup and answer formatting. Finish within that budget.

For a focused Windows or Linux observation, use the runner command in the Loop guide's **Targeted CI diagnostics** section. Submit a published workload revision and exact full test name, then collect its durable ticket in this same repair context. The command owns dispatch and evidence retrieval, never publication. No local edits enter CI until the existing runner publishes them. Repeated before-and-after measurements still belong to the existing flake owner.

Never skip or `.only` a test, raise a timeout, add a retry, or loosen an assertion to make Check pass. Delete a flaky, slow or narrow test only when surviving assertions cover what users rely on at the same boundary. Name that test and map the removed behavior to its assertions using the testing guide's coverage replacement rule. Worker tests cannot replace studio startup, visible delivery or interaction assertions. Keep unresolved hosted failures explicit.

Answer with `kind` set to `repair`. `cause` holds the class and the root cause; `checked` holds the evidence.

Record current test coverage in the owning area guide and detailed failure evidence, measurements, gaps and quarantine conditions in its linked subsystem note under `docs/notes/`. Reuse existing notes. Keep shared test policy, selection, fixture ownership and browser harness contracts in `docs/guide/running-and-testing.md`. A subsystem repair leaves that shared guide and its navigation alone.

A pass on macOS or Linux does not establish that a Windows failure is flaky. Name the affected platform and exact revision for every pass and fail used for classification. When a controlled run fails every selected attempt, diagnose that failure rather than quarantine it as intermittent load. Preserve active coverage while a direct source repair or measured investigation is underway.
