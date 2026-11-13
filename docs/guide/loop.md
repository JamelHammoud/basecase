# The loop

Part of the Basecase guide. [AGENTS.md](../../AGENTS.md) holds the rules every change follows and the index of these files; section numbers (§) are shared across them.

## 0l. How agents land work

Basecase is built by a team of agents that runs on Jamel's Mac (`tools/loop/`, started by `launchd`) and on GitHub Actions. No person approves anything; Jamel steers through the pinned **Direction** issue and comments anywhere.

### Identity

- Every commit, push, pull request, review and merge uses Jamel's git identity and `gh` login. No model, tool or bot is ever an author, co-author or reviewer of record.
- Claude Code's own attribution is off (`.claude/settings.json`, `attribution`). The `commit-msg` hook (`tools/hooks/commit-msg.mjs`) and Check's `credit` job (`tools/check-credit.mjs`) reject a `Co-Authored-By` trailer, a "Generated with" line, or a model or bot as author or committer. Both share `tools/loop/credit.mjs`.
- The loop's scripts make every commit, push and pull request themselves. An agent session edits and tests; it never runs `git commit`, `git push` or `gh pr`.

### Lanes

The loop is a team that never stops. `node tools/loop/install.mjs install` creates the home checkout (`~/.basecase-loop/home`), the GitHub labels and one LaunchAgent per lane slot, after removing any old ones; `uninstall` removes them all. Every working slot is relaunched a minute after it finishes, and a lock per slot keeps it to one run at a time, so each slot is always either working or about to look for work. Logs are in `~/.basecase-loop/logs/`. Setting the repository variable `LOOP_PAUSED` to `true` stops merges and releases.

Each lane is one file in `tools/loop/lanes/`. It exports `schedule` (its `slots`, `everySeconds`, any `labels` it needs, and a one-line `does`) and a default function that does one run; its brief, when it runs an agent, is `tools/loop/briefs/<lane>.md`. `run.mjs` and `install.mjs` discover lanes from that folder, so adding or changing a lane touches only its own files. `node tools/loop/install.mjs list` prints every lane with its slots, cadence and what it does.

Steps and pull requests are claimed with a lock file before a slot works on them, so two slots never take the same one. What's being worked on shows on GitHub: a step being built carries `loop:building`, and a pull request being revised carries `loop:revising`. No pull request or issue is opened when one with the same title is open, and a step whose pull request already exists gets a comment linking it. The lead's new steps also skip when an open step (`loop:next` or `loop:building`) has the same title reworded: the same words and numbers in any order, ignoring filler, plurals and tense, and kind prefixes such as `Feature:` (`tools/loop/lib/titles.mjs`). A title with one word changed, such as Simulate for Train, is different work. A skipped step's request is marked planned as the open step and its idea promoted to it, so the request doesn't start a new plan every run. New arcs skip the same way against open arcs. Nothing else is compared that loosely, so a step can reword the idea it promotes or the arc it sits under, and each week's digest still opens. The update lane waits while an `Update:` pull request is open. The home checkout follows `BASECASE_LOOP_REF` (default `main`) and falls back to `main` when that branch is gone. A lane clears a worktree path left behind by a crashed run before reusing it. A step left at `loop:building` for 30 minutes with no pull request goes back to the builders (its builder died). Before anything is built, every pull request the repo has ever had is checked for the step, by `Closes #` and by its `loop/build/<step>-` branch, open or merged, with no list limit (`tools/loop/lib/stepPulls.mjs`). A merged one closes the step, an open one keeps it, and a failed lookup builds nothing. A builder checks again before it publishes, so two builders never open pull requests for one step. Checking only the newest 100 open pull requests, or only open ones, rebuilt steps whose pull requests were open or had just merged. The runner puts `Closes #<step>` after the template, so it survives every kind of pull request, and when the merge lane lands a `loop/build/<step>-…` branch it closes that step if it's still open.

**Where ideas come from.** The ideas lane takes one part of the loop per run (the first robot end to end, then Design, Engineer, Simulate, Train, Build and Operate, then new directions beyond them) and files up to three `loop:idea` issues. At least one is a big bet, at the scale of Amp's Chronicle: a new sub-product, surface, way of working, business model or big removal, labelled `loop:big-bet`. The rest are features. Each idea is for someone designing their first robot, someone building their thousandth, or both, and names the best tool today and its first steps. The lead keeps at least one big-bet arc open. The market lane adds ideas from `docs/market/` once a day. The ideas lane stops at 12 waiting. The lead plans when three or more new ones arrive: it promotes the strongest into steps and closes the rest as not planned, with a reason. A `loop:` label a lane needs is created the first time it's used.

**How the loop improves itself.** Two lanes look back. The learn lane fixes the work: a mistake seen twice, or once by Jamel, becomes a lint, test, guide rule or playbook entry. The retro lane changes the loop's own structure. Once a week it gathers how the team worked (`lib/retroEvidence.mjs`): the digests; each lane's runs, crashes, share of runs with nothing to do and session minutes, from the logs; hours from opened to merged by kind; review verdicts and blocker types; pull requests closed without merging; reverts; hours `main` was red; CI queue minutes from the jobs' timestamps; the steps that waited longest; Jamel's comments; and near-duplicate titles. A session from `main` then makes the one to three changes to the lanes, briefs, runner, merge rules, workflows and this guide that would most improve throughput, quality or Jamel's satisfaction, in one `Loop:` pull request whose Why cites the numbers behind each change. A change unrelated enough to review on its own gets its own session and pull request. The lane waits while its last pull request is open. `node tools/loop/retro.mjs` prints the week's evidence (`json` for the raw numbers) and changes nothing. For session lengths, the runner logs `took <n> min` after any run of two minutes or more.

**Only a pull request's own change starts new work; catching up with `main` never does.** Without this rule, lanes chase each other: each merge of `main` is a new head, a new head wipes the review, and the revise lane never sees a verdict to answer. So:

- **Review carries over** to a head whose own lines (`git diff -U0` from its merge base with `main`, compared by `git patch-id`) match the last reviewed head. Context lines don't count, so `main` editing around the change doesn't either; a conflict resolution that changes the pull request's lines gets a fresh review.
- **Rebase refreshes a failed Check once per head.** If the refreshed head fails too, the failure is the pull request's own and goes to revise. A pull request whose review failed isn't refreshed: revise merges `main` when it revises.
- **Revise skips a pull request that conflicts with `main`** (checked locally with `git merge-tree`) until rebase resolves it.
- **A builder that declines a step** posts why on the step, and the step waits 30 minutes, doubling with each decline up to a day, and until the pull requests the reason names have closed.

A new lane that reacts to a head, a status or an issue follows the same rule, and keeps what it has handled in `~/.basecase-loop/state/` (`lib/store.mjs`) so the same input never runs twice.

**At the usage limit the loop pauses instead of failing.** When a session fails with a rejected rate limit (`rate_limit_info` with `status: "rejected"` and `resetsAt`, in a top-level `rate_limit_event` or the failed result), or its failed result or stderr says the limit was reached, `lib/usage.mjs` writes `~/.basecase-loop/state/usage-pause.json` and the lane stops without counting the session as an attempt, so a long pause never triggers a rebuild. Lanes that run agents (`agent: true` in their `schedule`) then skip their runs; merge and tidy keep going. Every 15 minutes one slot sends a one-line probe, so a manual reset or extra usage resumes the loop within 15 minutes, and at the reset time the lanes run again on their own. The first pause posts the reset time on the Direction issue. `node tools/loop/usage.mjs status` shows the pause and `resume` ends it at once. A session that finished is never a limit, and text the agent read never counts: the loop's own code, guides and diffs say "usage limit reached", and matching the whole transcript paused the loop 15 times in one day with most of the weekly limit left.

**Nothing waits on Jamel.** The revise lane answers a failed review, a pull request's own Check failure, or a new comment from Jamel, and never revises the same commit twice without new input. A revision restates the title, summary, checks, changelog line, screenshots and `copy:` lines, and the runner rewrites those parts of the body from them (`revisedBody`), keeping Why, Protected paths and the Revisions list; so a revision can add the copy reasons Check asks for or drop a changelog line it withdrew. Revise and rebuild sessions get `telling.md` like build and refine. Conflicts with `main` get the same treatment: three rebase slots resolve them, repairs and the loop's own pull requests first, and a pull request whose conflicts fail twice is rebuilt. After four attempts on a pull request that still fails, a fresh agent reads its whole history and either rebuilds the change cleanly from `main` as a new pull request, closing the old one with a link, or decides the change shouldn't be made: then it closes the pull request with its reason and puts the step back in the queue with that reason added. Lanes read GitHub through a shared cache (`tools/loop/lib/cache.mjs`; pull requests with their checks in one call), so idle lanes don't spend the API rate limit.

Comments the loop posts end with `<!-- loop -->`, which is how the learn lane tells them from Jamel's own comments, since both come from Jamel's account. Learn and digest count only what the loop made: reviews from Jamel's account that carry the mark, and closed or repair pull requests from Jamel's account on a `loop/` branch in this repo. An outsider's comment or pull request never becomes a lesson or a number. A branch is pushed only to open its pull request, so a pushed `loop/` branch with no open pull request is debris: `publish` deletes its branch when opening the pull request fails, and tidy deletes any such branch an hour after its last commit, including one whose pull request merged or closed. Branch names end in the time to the second and the process id, so two slots never pick the same name. Tidy never deletes the branch the loop's home follows (`BASECASE_LOOP_REF`). Each lane's brief is in `tools/loop/briefs/`, with `shared.md` prepended to all of them. Sessions run with `--dangerously-skip-permissions` (except `market`, sandboxed because it reads the web; see Review), so no prompt or classifier ever blocks a lane; the runner owns every commit, push and pull request, and review and Check are the gates. Agents run `npm run check:changed` and nothing heavier: CI runs the full Check and e2e on the pull request, and the lanes react to its result, so no agent waits on CI.

**Harness.** Every 12 hours the harness lane (`tools/loop/lanes/harness.mjs`, brief `harness.md`) makes the CAD agent better through the micro-evals ([Benchmark](bench.md)). It keeps its runs in the home checkout's `bench/runs/` (`BASECASE_BENCH_RUNS` overrides it), linked into each worktree, so the baseline cache outlives the run.

1. **Pick.** In a detached worktree of `main` it reads the cached tune runs for `main`'s harness hash at its model and effort (`opus` answered by `claude-opus-5-5`, effort `high`, three seeds), runs whatever is missing on two slots, and picks the category with the lowest pass rate (assembly, service, cost, check integrity, craft, mirroring), skipping one tried in the last three days while another fails (`lib/weakness.mjs`).
2. **Change.** One session on a `loop/harness/` branch gets the category, its tasks and the failing runs' folders and grader output, and changes the prompt, guides, CAD tools, checks or kernel helpers. A change that touches `bench/`, or nothing in the harness hash, is dropped unmeasured.
3. **Measure.** The branch runs the tune set and is paired task by task against `main`'s runs with `bench/compare/stats.mjs` (`lib/harnessVerdict.mjs`). It goes on only when at least 5 tasks are graded on both and the 95% interval on the gap is above zero; then both run the held-out set, which holds when its gap is at least zero or its interval stays above −10 points.
4. **Decide.** A kept change opens a `Harness:` pull request with the weakness, the change and the table of both sets with intervals and the runs used. A discarded one opens a `Lesson:` pull request instead: a `docs/Lessons playbook.md` entry tagged `harness` and its category, which later sessions read so it isn't retried.

`node tools/loop/harness-plan.mjs [checkout]` prints, without running anything, a checkout's harness hash, what the cache covers, the baseline it would run and the weakness it would pick.

### Giving direction

Jamel steers; nothing waits for Jamel.

- **A request:** open an issue, written however you like, with no `loop:` label. The lead plans it ahead of everything else, within a couple of minutes: it files steps labeled `loop:priority`, which builders take first, comments with links on the request, labels it `loop:request`, and closes it once its work has merged.
- **Build this exact thing now:** open an issue and label it `loop:next` and `loop:priority` yourself; the next free builder takes it as written.
- **General direction:** comment on the pinned Direction issue; the lead reads it before every plan.
- **Feedback on a pull request:** comment on it. The learn lane turns Jamel's comments into lessons.
- **Stop something:** close its pull request or issue, or set `LOOP_PAUSED` to `true` to stop merges and releases.

**How arcs are kept.** The lead keeps 3 to 6 open `loop:arc` issues; an arc opened from a big bet also carries `loop:big-bet`. Its plan can retire arcs (`retireArcs`: number, reason, and optionally `into`, the arc that carries on). The runner (`lib/leadPlan.mjs`, rules in `lib/arcs.mjs`) closes each with the reason; with `into` it rewrites the `Arc:` line of each open step to the other arc, adds them to that arc's task list and comments on it, so both issues link. It keeps an arc instead when retiring it would leave fewer than 3 open or no big bet, and after retirements it refuses new arcs beyond 6, logging why and filing the plan's other steps. A step names its arc as `Arc: #N`, and each arc's body ends with a `## Steps` task list of its steps, so GitHub shows its progress. A step that still names its arc by title is matched once by title and rewritten to the number. In the lead's prompt each arc lists its open steps and the steps that merged in the last 14 days (closed as completed, read through `lib/cache.mjs`).

### Pull request kinds

Every pull request has one kind, shown three ways: a title prefix, a `loop:` label and a template in `.github/PULL_REQUEST_TEMPLATE/`. The loop fills the template from the agent's answer, so pull requests of a kind read alike.

| Kind | Title | Template | In release notes |
|---|---|---|---|
| `feature`, `integration` | `Feature: …`, `Integration: …` | `feature.md`, with screenshots | New |
| `refine` | `Refine: …` | `refine.md`, with screenshots | Better |
| `fix` | `Fix: …` | `fix.md` | Fixed |
| `repair` | `Repair: …` | `repair.md` | left out |
| `lesson` | `Lesson: …` | `lesson.md` | left out |
| `harness` | `Harness: …` | `harness.md`, with the measurements | Better |
| `loop`, `update`, `market` | `Loop: …`, `Update: …`, `Market: …` | `loop.md` | left out |

`.github/release.yml` groups the release notes by those labels.

### A change, start to finish

1. The lane makes a worktree from `origin/main` under `~/.basecase-loop/worktrees/` and a branch `loop/<lane>/<slug>`. The shared checkout is never touched.
2. An agent session does the work there, following AGENTS.md and the area's guide, and runs `npm run check:changed -- <files>`.
3. The lane commits, pushes and opens the pull request. Its body says what changed and why; a `Feature:` or `Integration:` body also names the changelog entry the change adds, and every other kind's Changelog section reads None (`tools/loop/lib/pull.mjs`).
4. The review lane reviews it in a fresh session (below) and sets the `agent-review` status.
5. The merge lane starts the full Check on it (a `workflow_dispatch` of `check.yml` on its branch, reported as `check (full)`) once review and the quick Check pass, and squash-merges it the moment that passes. A full Check that fails goes to the revise lane like any failed Check, and a new head gets a new full Check. Repairs run the full Check on every push already, so they merge on it, first.

Each pull request lands on its own (`tools/loop/lanes/merge.mjs`, `tools/loop/lib/landing.mjs`; checked every minute). Batches used to carry 15 reviewed pull requests through one full Check, but a batch passes only when all 15 do: on 13 November 6 of every 10 failed, and one bad change held up 14 good ones through re-runs and bisecting. The full Check takes about 11 minutes, so with 12 pull requests open at most, each one running its own fits the runners.

- **A failure is believed only twice.** e2e tests retry once in CI (`vitest.e2e.config.ts`), and a red `main` has its failed jobs re-run once before only repairs land. Full Checks keep starting while `main` is red, so reviewed pull requests merge the moment it turns green.
- **A flaky test becomes work.** The flakes lane (every 10 minutes) reads each Check run on `main` that passed only when its failed jobs ran again, takes the tests that failed the first time from its log, and files a `loop:priority` fix step for each, so a builder makes it deterministic or deletes it (`tools/loop/lib/flakes.mjs`). The step forbids a longer timeout, a retry or a skip. Timing budgets run on demand (`npm run perf:booleans`), never in Check.
- **Review goes where it lands.** Eight review slots take pull requests whose quick Check passed first, and skip those with conflicts or a failed Check until the rebase or revise lane has fixed them.
6. The worktree and the branch are deleted.

`main`'s ruleset requires `check` and `agent-review` and no approvals: GitHub doesn't let an account approve its own pull request, and every pull request is Jamel's.

### Review

The review lane sees the diff, the pull request body, the titles of the other pull requests open or merged in the last day, AGENTS.md, the guides of the areas the diff touches and their lessons. It never sees issue text. A `market` pull request is the one place web text reaches it: its title, body and diff come from pages the market session read. That session is sandboxed (`runAgent`'s `sandbox` option, `--restricted` in `dontAsk` mode): it has Read, Grep, Glob, WebFetch and WebSearch, and Edit and Write only under `docs/market/`. It has no shell, no subagents, no MCP servers and no GitHub credentials (`GH_TOKEN` empty, `GH_CONFIG_DIR` an empty folder), and its file tools can't leave the worktree, so it can't reach `.git`, the home checkout or the keychain. The runner still publishes nothing if a path outside `docs/market/` changed (`outsideMarket`), and logs the session's `notes` instead of putting them in the body. An injected page can still write misleading entries and idea titles, which review and the lead read as data. When one of those makes the same change, review closes the newer pull request as its duplicate, and a merged one always counts as the older (`tools/loop/lib/inFlight.mjs`). The refine lane gets the same list and picks something none of them changes, since its slots used to pick the same rename at once. It fails a pull request that:

- breaks a rule in AGENTS.md or the area's guide;
- adds user-facing copy that the §3d checklist would cut. Its default for a new string is "delete it";
- adds copy without a reason Check's `copy` job accepts (`tools/check-copy-budget.mjs`): when a pull request adds more strings than it removes, each new string needs a `copy: "<string>" — <why>` line in the body. The review lane counts the strings with `tools/copy-diff.mjs` (§3d), puts the list and the net in its prompt and its comment, and fails a reason that doesn't hold up; the lead lane reads the week's net summed across merged pull requests;
- ships a feature with no entry point and no e2e test of it;
- changes what a person does without a new or updated help article (`site/content/help/`) with screenshots (`site/public/help/`), or gets the changelog wrong either way: a capability worth announcing without an entry, or an entry for a fix, polish, a rename or a small option. Builders and refiners write these from `tools/loop/briefs/telling.md`, and an arc's big step with a story to tell also gets a blog post;
- writes a changelog entry, blog post or help article that breaks the long-form rules (Copy, §3f), whether or not `npm run check:site` catches it;
- weakens a test: a skip, `.only`, a deleted test, a raised timeout or a loosened assertion;
- changes a protected path (`.github/`, release and updater code, `guardBridge`, `trustedIpc`, `checkedFileId` and `publicFetch` callers, `verify/`, the CAD kernel sandbox, `hw/`) without saying why in the body. The runner lists every protected file a pull request touches under **Protected paths** in its body, and each revision's line names the ones it touched (`tools/loop/lib/protected.mjs`);
- says in a guide, brief, prompt or the body that something exists which only another pull request adds.

### CI repair

A red `check` on `main` is the first thing any lane fixes. Classify it before touching code:

1. **Broke at a commit.** Find the commit; if one merge caused it, revert it, then fix forward.
2. **Platform-only.** Reproduce it on that platform: mock `IS_WINDOWS` for Windows logic, run CI on a branch for a Windows build, and use the Linux container (below) for Linux-only failures.
3. **Flaky.** Passes and fails on the same commit. Reproduce it under load in the container, trace from page load, and count a fix only with a measured rate: at least 10 runs before and 10 after, at the same load.
4. **Environment.** A runner image, a dependency release or an outage: pin it or rerun later, never edit tests for it.

A flake that can't be fixed in a day goes on `tools/quarantine.json` with an issue, an `until` date and a reason (an empty `test` takes the whole file). The unit and e2e runs skip it until that date, then it runs, and fails, again. `npm run test:quarantine` runs only those tests and reports them without failing (Check runs it after the first Linux e2e shard, and after Windows e2e on `main`); `npm run check:quarantine` fails Check on a malformed or dateless entry.

**Linux e2e on a Mac:** CI runs e2e on x86-64 Linux with Google Chrome. `node tools/loop/linux-e2e.mjs e2e/<file>.e2e.test.ts --runs 10 --cpus 3` runs it there: a detached worktree of `--ref` (default `origin/main`) under the system temp folder, the `node:26.13.0-bookworm` image under OrbStack's emulation (`--platform linux/amd64`), `npm ci --ignore-scripts` into a container volume, Google Chrome in the container, and the app and web bundles built with `CI` set, as Check builds them, then the file `--runs` times. e2e serves those bundles; a dev server would hide what only a production build shows, such as effects StrictMode runs twice in dev. `node_modules` stays off the bind mount: Vite reading it through the mount missed the 30 s page load. It prints the failing tests of each run and `passed X of N`, and removes the container and the worktree even when it fails. Setup takes several minutes; `--cpus 2` to 3 gives CI-like load. It runs quarantined tests too (`BASECASE_QUARANTINE=off`), so it can measure a flake on the list.

### Digest

Once a week the digest lane (`tools/loop/lanes/digest.mjs`, numbers in `tools/loop/lib/stats.mjs` and `laneStats.mjs`) opens a `loop:digest` issue. It starts with the week's totals: merges by kind, reviews, reverts, hours `main` was red and the median hours to merge. Then a table scores each lane, grouped by the lane that opened each merged pull request (the `loop/<lane>/` branch prefix, else its `loop:` label; batches are left out, since they only carry other lanes' pull requests):

- **Median hours from step opened to merged:** from the step issue the pull request closes, or from the pull request itself when it has no step.
- **Review rounds before pass, per pull request:** the loop's failed reviews before its first pass, averaged over the lane's merges.
- **Repairs per merge:** a repair branch names the `main` commit whose Check failed (`loop/repair/main-<sha>`); that commit's message names the pull request it merged, and a batch shares the repair evenly among its members.
- **Copy net:** the sum of the `Copy: …, net N` lines the review lane records on each merged pull request; None when none was counted.
- **Steps closed per step opened:** on the `lead` row, since the lead opens every step; steps closed as not planned don't count.

The table shows this week, last week and the change. Last week comes from the previous digest's fenced `json digest` block, which every digest ends with, so nothing is recomputed from old pages; the first digest, or one after a digest without the block, shows this week alone. The digest then names the worst change: the number that got worst against its last value (the change divided by the last value, or by 1 when that's smaller), lowest-is-better for all but steps, with a tie going to the lane earlier in the table (build, refine, rebuild, repair, learn, market, update, lead), then the measure listed first. Learn and the lead read it from the latest digest: learn proposes one lesson aimed at it, and the lead plans a step that moves it back ahead of a new one.

### Releases

`.github/workflows/nightly.yml` runs at 09:17 UTC. It takes the newest push to `main` whose full Check passed, and when that's newer than the last release, dispatches `release.yml` to build that commit (its `ref` input) with the next patch version, so one red run at 09:17 doesn't skip the night. GitHub sometimes drops a scheduled run, so the Mac's `nightly` lane starts the workflow itself when it hasn't run by 09:45 UTC (`tools/loop/lib/nightly.mjs`) ([Releases](releases.md), §0i). basecase.so and app.basecase.so need no release: Cloudflare Workers Builds deploys them on every push to `main` ([Running and testing](running-and-testing.md), §0d).

### Writing posts and help

basecase.so's `/changelog`, `/blog` and `/help` are built from markdown in `site/content/` by `npm run build:site` ([Running and testing](running-and-testing.md), §0d). To add one, write a file; nothing else needs registering. How to write each one, from the first sentence to the help link, is [Copy](copy.md), §3f; `npm run check:site` (`tools/check-site.mjs`, part of `npm run check` and of `check:changed` for files under `site/`) fails the rules a script can check.

| Folder | File name | Front matter |
|---|---|---|
| `site/content/changelog/` | `YYYY-MM-DD-title-in-words.md` | `title`, `date`, `image` for a cover screenshot, `version` when it shipped in a release |
| `site/content/blog/` | `title-in-words.md` | `title`, `date`; `draft: true` only to hold a post back |
| `site/content/help/` | `task-in-words.md`, which is its URL | `title`, `date`, `collection`, `type`, `covers:` (a list of the code paths it documents); optional `updated`, `related:`, `keywords:`, `popular`, `order`, `image` (below) |

```md
---
title: Import a file
date: 2026-11-12
collection: design
type: task
covers:
  - src/workspace/importRoute.ts
---

Bring a file from another app into the scene.

1. Right-click an empty spot on the canvas.
2. Choose **Import**.
```

- **Titles are in sentence case**, in every folder: capitals only for proper nouns. Menu labels quoted in the body keep theirs.
- **A changelog entry** is a short article, 60 to 250 words, and only for a change worth announcing: a new capability, a new way of working, or a real change in how the product behaves (§3f). Fixes, polish and renames reach people through the release notes, which list every merged pull request. From 2026-11-12 every entry links its help article. Each entry has its own page at `/changelog/<file name>`, with a link back, the date, its cover and the body with screenshots (in `site/public/changelog/<slug>/`). `/changelog` lists them newest first with the cover, date, title and first paragraph, each linking to its page (old `/changelog#<file name>` links still land on the list), and the feeds (`/changelog/rss.xml`, `/changelog.json`) carry the full entry with absolute image URLs. The entry's cover is its `og:image`. The brief that says how to write one is `tools/loop/briefs/telling.md`.
- **A help article** is one type (task, tutorial, concept, reference or troubleshooting, §3f). A task has a verb-first title, one sentence on what it's for and numbered steps with bold UI labels. Write only steps you've checked in the code; the `covers` paths are what to recheck when that code changes.
- **Drafts and future dates stay out.** The build skips `draft: true` and any date after the day it runs, in every folder. Nothing rebuilds the site on a schedule, so a future-dated file publishes with the first deploy on or after its date.
- **The blog appears with its first post.** Until then the build writes no `/blog` page, and the nav and sitemap leave it out. The landing's footer links Changelog and Help (`SECTIONS` in `src/landing/pages/sections.ts`).
- Front matter is `key: value` lines and `- item` lists, indented or not; `true` and `false` are booleans with or without quotes. A missing title or date, a date not written `YYYY-MM-DD`, or a file name that isn't lowercase words joined by dashes fails the build with the file's path.
- Raw HTML in the markdown is dropped. `http` and `https` links open in a new tab.
- `src/landing/pages/renderPages.test.ts` checks the routes, the feeds and that drafts stay out; run it with `npm run check:changed -- <your files>`. `e2e/site.e2e.test.ts` builds the site, serves it the way Workers does (`/changelog` → `changelog.html`) and follows the landing's links to the changelog, into an entry and back, and through a help collection to an article, the nav's Blog link to a post and back, and types into help search on an article to open another by a word from its body. It builds the real `site/content`, so it expects a published post.

#### The help center

`/help` is a home page with search, the collections as cards with their article counts, and Popular articles. Each collection has its own page at `/help/<collection>`, its articles grouped by type; each article is at `/help/<file name>` with a breadcrumb (Help, then its collection), its type (unless it's a how-to, which its title already says) and updated date, an On this page list once it has enough `##` headings (3 for task and concept, 2 for reference and troubleshooting), related articles, and previous and next within the collection. The code is `src/landing/help/`.

- **Collections** follow the robotics loop, in this order: `get-started`, `design`, `engineer`, `simulate-and-train`, `build-and-print`, `operate`, `agent`, `files-and-sharing`, `troubleshooting`. Their titles and one-line descriptions live in `src/landing/help/collections.ts`; edit them there. A description says what the collection's articles cover, so update it when you add an article it doesn't mention. A collection with no published article has no page and stays off the home page, the way the blog waits for its first post.
- **`type:`** is `task` (how-to, numbered steps), `concept` (what something is and why), `reference` (tables and lists to look things up) or `troubleshooting` (a problem per `##` heading, with its fix), after Diátaxis. Concept, Reference or Troubleshooting shows under the title; a task shows no label, since its verb-first title already says it's a how-to. Ordered lists in task and troubleshooting articles render as numbered steps; in the others, as plain numbered lists.
- **Optional fields:** `updated: YYYY-MM-DD` when you rewrite an article (it's the date shown beside the article's type, and defaults to `date`); `related:` a list of other help file names to link at the end (without it, the article links others from its collection); `keywords:` a list of extra words people search for that the article doesn't say (`slicer`, `cmd k`); `popular: true` to feature it on the home page (up to 6; with none marked, the newest show); `order: 1` and up to place it within its type in the collection (then by title); `image` for an `og:image` and cover.
- **The build fails with the file's path** on an unknown field (a typo like `colection:`), a missing or unknown `collection` or `type`, an `updated` before `date` or not `YYYY-MM-DD`, a non-numeric `order`, a `popular` that isn't true or false, a `related:` that names a file that doesn't exist or the article itself, and a file name that's also a collection's (`design.md`). Drafts count for `related:`, so a link to one doesn't fail; it just doesn't show until it's published.
- **In the body:** screenshots go in `site/public/help/<file name>/` and in the markdown as `![What it shows](/help/<file name>/shot.png)`. Write a shortcut as `[[⌘K]]` or `[[⇧⌘Z]]`, with Mac glyphs; it renders as key caps. A note or warning is a GitHub alert: a quote whose first line is `[!NOTE]` or `[!WARNING]`. Tables are GitHub tables.
- **Search** is a small custom index, not Pagefind: the build writes `/help/search.json` (title, `##` headings, keywords, collection, first paragraph and the body as plain text for every published article) and `src/landing/help/search/helpSearchMain.ts` (about 3 KB gzipped, loaded only by help pages) searches it as you type. Title matches outrank headings, then keywords, the first paragraph and the body; every word must match, each one by prefix too (`imp mes` finds Import a mesh); plurals and accents fold; `src/landing/help/search/synonyms.ts` maps the app's terms to the words people type (STL and mesh, MuJoCo and sim, 3MF and print). With no match it offers the collections. `/` or ⌘K focuses the box, the arrows move, Enter opens, Esc closes. `/help?q=word` opens with a search, and Enter goes there when `search.json` doesn't load. Pagefind indexes the built HTML with a native binary and a WebAssembly runtime, and has no synonym list of its own; at a few hundred articles the whole index is still smaller than one screenshot, and building it from the content model keeps ranking testable in Vitest.
- `src/landing/help/helpCenter.test.ts` checks collections, ordering, related links, front matter failures and unique URLs; `helpPages.test.ts` checks the pages, the search index and that search finds committed articles by words from their bodies; `search/search.test.ts` checks ranking, synonyms and snippets.

### Keeping the flow

Three guards keep work moving without anyone watching:

- **Backpressure.** Lanes that open pull requests or plan work for them (build, refine, market, learn, update, lead and ideas) wait while 12 pull requests are waiting to land or 20 CI runs are queued (`tools/loop/lib/flow.mjs`). The lanes that drain the queue (review, revise, rebase, batch, merge, repair) never wait. Little open work keeps each pull request's wait short and its conflicts few.
- **Nothing stays open long.** The health lane closes a pull request open over 6 hours (repairs excepted). A step's pull request goes back to the builders and is rebuilt from current `main`, which costs less than chasing conflicts (`expired` in `tools/loop/lib/flow.mjs`).
- **New lanes start themselves.** After each update of the home checkout, the merge lane runs `install.mjs sync`, detached. Once that merge run ends, it loads new lanes, then reloads changed ones and removes deleted ones that aren't mid-run (reloading a lane stops its running job, so a busy slot waits for a later sync).
- **Health.** The health lane checks every 10 minutes how long `main` has been red, how long since the last merge, the oldest reviewed and green pull request (timed from its passing Check or review, whichever came last), and the CI queue. While any of them is over its limit, it keeps one `Loop health` issue up to date, and it closes that issue once the loop flows again.

### What Check runs

Check is built for fast pull requests, with `main` as the safety net:

- **On an ordinary pull request (quick Check):** lint, types and unit tests on Linux, plus the commit-credit and copy checks. That's four small jobs, so dozens of agent pull requests don't hold every runner. The `ros` job (`tools/ros/check.mjs`: colcon and `check_urdf` in `ros:jazzy` on every fixture robot's package, §8d) joins them only when the pull request touches `src/sim/`, `src/utils/robotImport/`, the other modules the Robot Package export reads, `tools/ros/`, `check.yml` or the lockfile, and the final `check` job requires it whenever it ran. An ordinary pull request lands only after its full Check.
- **Full Check, on a repair (`loop/repair/`) pull request, a reviewed pull request the merge lane dispatches it for, and `main`:** unit tests on Linux and Windows; e2e on Linux in three parallel shards, and on Windows only on `main` (Windows e2e took 12 minutes against 3 to 4 for a Linux shard, so on a pull request it would decide when everything merges); the commit-credit check (and copy, on repairs); the packaged-app builds when the change touches what they build (`electron/`, `forge/`, `hw/`, packaging and native-build tooling, `e2e/app/`, workflows, or `package.json` and the lockfile); and the `ros` job on the same path rule as ordinary pull requests. Everything that reaches `main` has passed the same full Check that `main` runs.
- **On every push to `main`:** the full Check; the packaged-app builds run when the push touches packaging paths, the same rule as pull requests, and every release builds them; the `ros` job runs on its path rule too. A failure there goes to the repair lane, which reads `main` job by job: a failed job makes `main` red at once, without waiting for the run's slowest job. Every job has a timeout at about twice its usual time (unit and Linux e2e 15 minutes, Windows e2e 25, the app 45), and every run, repair force-cancels a Check on `main` still unfinished after 30 minutes, because one stuck run holds `main`'s concurrency slot and every newer push waits behind it. Unit and e2e had no timeout until 13 November, when a hung Windows e2e held `main` for 45 minutes and every pull request with it.
- **No stale runs:** a push to a pull request cancels its running Check, and closing or merging it cancels it too (`closed.yml` joins the same concurrency group). On `main` one Check runs at a time and only the newest push waits, so a burst of merges checks the last one instead of queueing every commit. The Forge and daemon Rust builds are cached.
