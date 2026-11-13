# The loop

Part of the Basecase guide. [AGENTS.md](../../AGENTS.md) holds the rules every change follows and the index of these files; section numbers (§) are shared across them.

## 0l. How agents land work

Basecase is built by a team of agents that runs on Jamel's Mac (`tools/loop/`, started by `launchd`) and on GitHub Actions. No person approves anything; Jamel steers through the pinned **Direction** issue and comments anywhere.

### Identity

- Every commit, push, pull request, review and merge uses Jamel's git identity and `gh` login. No model, tool or bot is ever an author, co-author or reviewer of record.
- Claude Code's own attribution is off (`.claude/settings.json`, `attribution`). The `commit-msg` hook (`tools/hooks/commit-msg.mjs`) and Check's `credit` job (`tools/check-credit.mjs`) reject a `Co-Authored-By` trailer, a "Generated with" line, or a model or bot as author or committer. Both share `tools/loop/credit.mjs`.
- The loop's scripts make every commit, push and pull request themselves. An agent session edits and tests; it never runs `git commit`, `git push` or `gh pr`.

### A change, start to finish

1. The lane makes a worktree from `origin/main` under `~/.basecase-loop/worktrees/` and a branch `loop/<lane>/<slug>`. The shared checkout is never touched.
2. An agent session does the work there, following AGENTS.md and the area's guide, and runs `npm run check:changed -- <files>`.
3. The lane commits, pushes and opens the pull request. Its body says what changed and why, and carries a one-line changelog entry when users can see the change.
4. The review lane reviews it in a fresh session (below) and sets the `agent-review` status.
5. The merge lane rebases it if it's behind, and squash-merges it once `check` and `agent-review` pass on its head. One pull request at a time.
6. The worktree and the branch are deleted.

`main`'s ruleset requires `check` and `agent-review` and no approvals: GitHub doesn't let an account approve its own pull request, and every pull request is Jamel's.

### Review

The review lane sees the diff, the pull request body, AGENTS.md, the guides of the areas the diff touches and their lessons. It never sees issue or web text, so nothing outside can steer it. It fails a pull request that:

- breaks a rule in AGENTS.md or the area's guide;
- adds user-facing copy that the §3d checklist would cut. Its default for a new string is "delete it";
- ships a feature with no entry point and no e2e test of it;
- weakens a test: a skip, `.only`, a deleted test, a raised timeout or a loosened assertion;
- changes a protected path (`.github/`, release and updater code, `guardBridge` and `trustedIpc` callers, `verify/`, the CAD kernel sandbox, `hw/`) without saying why in the body.

### CI repair

A red `check` on `main` is the first thing any lane fixes. Classify it before touching code:

1. **Broke at a commit.** Find the commit; if one merge caused it, revert it, then fix forward.
2. **Platform-only.** Reproduce it on that platform: mock `IS_WINDOWS` for Windows logic, run CI on a branch for a Windows build, and use the Linux container (below) for Linux-only failures.
3. **Flaky.** Passes and fails on the same commit. Reproduce it under load in the container, trace from page load, and count a fix only with a measured rate: at least 10 runs before and 10 after, at the same load.
4. **Environment.** A runner image, a dependency release or an outage: pin it or rerun later, never edit tests for it.

A flake that can't be fixed in a day goes on a dated quarantine list that Check reports without failing on.

**Linux e2e on a Mac:** CI runs e2e on x86-64 Linux with Google Chrome. The `node:26.13.0-bookworm` image runs that under OrbStack's emulation:

```sh
git worktree add --detach /tmp/bc-linux origin/main
docker run -d --name bc-e2e --platform linux/amd64 --cpus 3 -v /tmp/bc-linux:/repo -w /repo \
  -e ELECTRON_SKIP_BINARY_DOWNLOAD=1 -e PLAYWRIGHT_BROWSERS_PATH=/repo/.pw node:26.13.0-bookworm sleep infinity
docker exec bc-e2e npm ci --ignore-scripts
docker exec bc-e2e npx playwright install --with-deps chrome
docker exec bc-e2e npx vitest run --config vitest.e2e.config.ts e2e/<file>.e2e.test.ts
```

`--cpus 2` to 3 gives CI-like load. Clean up with `docker rm -f bc-e2e` and `git worktree remove --force /tmp/bc-linux`.

### Releases

A nightly workflow releases the Mac and Windows apps when `main` has changed since the last release and `check` passed on its head ([Releases](releases.md), §0i).
