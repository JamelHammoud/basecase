# The loop

Part of the Basecase guide. [AGENTS.md](../../AGENTS.md) holds the rules every change follows and the index of these files; section numbers (§) are shared across them.

## 0l. How agents land work

Basecase is built by a team of agents that runs on Jamel's Mac (`tools/loop/`, started by `launchd`) and on GitHub Actions. No person approves anything; Jamel steers through the pinned **Direction** issue and comments anywhere.

### Identity

- Every commit, push, pull request, review and merge uses Jamel's git identity and `gh` login. No model, tool or bot is ever an author, co-author or reviewer of record.
- Claude Code's own attribution is off (`.claude/settings.json`, `attribution`). The `commit-msg` hook (`tools/hooks/commit-msg.mjs`) and Check's `credit` job (`tools/check-credit.mjs`) reject a `Co-Authored-By` trailer, a "Generated with" line, or a model or bot as author or committer. Both share `tools/loop/credit.mjs`.
- The loop's scripts make every commit, push and pull request themselves. An agent session edits and tests; it never runs `git commit`, `git push` or `gh pr`.

### Lanes

`node tools/loop/install.mjs install` creates the home checkout (`~/.basecase-loop/home`, reset to `origin/main` by the merge lane, so the loop always runs its latest merged code), the GitHub labels and one LaunchAgent per lane. `uninstall` removes them. Logs are in `~/.basecase-loop/logs/`. Setting the repository variable `LOOP_PAUSED` to `true` stops merges and releases.

| Lane | Every | Does |
|---|---|---|
| `review` | 2 min | Reviews each pull request whose head has no `agent-review` status |
| `merge` | 5 min | Squash-merges the oldest pull request with `check` and `agent-review` green. While `main` is red it takes only repairs, and a repair may merge with `check` failing if every failing job also fails on `main`, so it adds no failure of its own |
| `rebase` | 10 min | Merges `main` into a conflicting `loop/` branch, with an agent resolving the conflicts |
| `repair` | 15 min | Opens a repair when Check fails on `main` |
| `build` ×3 | 5 min | Builds the oldest `loop:next` issue Jamel's account opened |
| `refine` | 6 h | Makes one existing feature or view fit better |
| `lead` | 4 h | Reads the Direction issue and plans arcs and steps as issues |
| `update` | 24 h | Moves the agent adapters to their latest releases |

Each lane's brief is in `tools/loop/briefs/`, with `shared.md` prepended to all of them. Sessions run with `--dangerously-skip-permissions`, so no prompt or classifier ever blocks a lane; the runner owns every commit, push and pull request, and review and Check are the gates. Agents run `npm run check:changed` and nothing heavier: CI runs the full Check and e2e on the pull request, and the lanes react to its result, so no agent waits on CI.

### Pull request kinds

Every pull request has one kind, shown three ways: a title prefix, a `loop:` label and a template in `.github/PULL_REQUEST_TEMPLATE/`. The loop fills the template from the agent's answer, so pull requests of a kind read alike.

| Kind | Title | Template | In release notes |
|---|---|---|---|
| `feature`, `integration` | `Feature: …`, `Integration: …` | `feature.md`, with screenshots | New |
| `refine` | `Refine: …` | `refine.md`, with screenshots | Better |
| `fix` | `Fix: …` | `fix.md` | Fixed |
| `repair` | `Repair: …` | `repair.md` | left out |
| `lesson` | `Lesson: …` | `lesson.md` | left out |
| `loop`, `update` | `Loop: …`, `Update: …` | `loop.md` | left out |

`.github/release.yml` groups the release notes by those labels.

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
- changes a protected path (`.github/`, release and updater code, `guardBridge`, `trustedIpc`, `checkedFileId` and `publicFetch` callers, `verify/`, the CAD kernel sandbox, `hw/`) without saying why in the body.

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

`.github/workflows/nightly.yml` runs at 09:17 UTC. When `main` has changed since the last release and `check` passed on its head, it dispatches `release.yml` with the next patch version ([Releases](releases.md), §0i).

### Writing posts and help

basecase.so's `/changelog`, `/blog` and `/help` are built from markdown in `site/content/` by `npm run build:site` ([Running and testing](running-and-testing.md), §0d). To add one, write a file; nothing else needs registering.

| Folder | File name | Front matter |
|---|---|---|
| `site/content/changelog/` | `YYYY-MM-DD-title-in-words.md` | `title`, `date`, `version` when it shipped in a release |
| `site/content/blog/` | `title-in-words.md` | `title`, `date`, `draft: true` until Jamel publishes it, `line` for Jamel's line |
| `site/content/help/` | `task-in-words.md`, which is its URL | `title`, `date`, `covers:` (a list of the code paths it documents) |

```md
---
title: Import a mesh
date: 2026-11-12
covers:
  - src/workspace/meshImport.ts
---

Bring a model from another app into the scene as a printable part.

1. Right-click an empty spot on the canvas.
2. Choose **Import Mesh**.
```

- **Titles are in sentence case**, in every folder: capitals only for proper nouns. Menu labels quoted in the body keep theirs.
- **A changelog entry** is a title and two sentences, Chronicle-style. The page lists entries newest first and feeds them to `/changelog/rss.xml` and `/changelog.json`.
- **A help article** has an imperative title, one sentence on what it's for and numbered steps. Write only steps you've checked in the code; the `covers` paths are what to recheck when that code changes.
- **Drafts and future dates stay out.** The build skips `draft: true` and any date after the day it runs, in every folder. Nothing rebuilds the site on a schedule, so a future-dated file publishes with the first deploy on or after its date.
- **The blog appears with its first post.** Until then the build writes no `/blog` page, and the nav and sitemap leave it out. The landing's footer links Changelog and Help (`SECTIONS` in `src/landing/pages/sections.ts`).
- Front matter is `key: value` lines and `- item` lists, indented or not; `true` and `false` are booleans with or without quotes. A missing title or date, a date not written `YYYY-MM-DD`, or a file name that isn't lowercase words joined by dashes fails the build with the file's path.
- Raw HTML in the markdown is dropped. `http` and `https` links open in a new tab.
- `src/landing/pages/renderPages.test.ts` checks the routes, the feeds and that drafts stay out; run it with `npm run check:changed -- <your files>`. `e2e/site.e2e.test.ts` builds the site, serves it the way Workers does (`/changelog` → `changelog.html`) and follows the landing's links to the changelog and a help article.
