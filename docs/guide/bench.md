# Benchmark

Part of the Basecase guide. [AGENTS.md](../../AGENTS.md) holds the rules every change follows and the index of these files; section numbers (§) are shared across them.

`bench/` measures how close the agent's model is to the real robot. Never tune the agent for one robot: every change must be general engineering practice.

- **Tasks** (`bench/robots.mjs`):
  - **URDF robots:** Reachy Mini, Open Duck Mini v2, Berkeley Humanoid and Unitree G1 are scored against meshes assembled from their published URDFs, at the zero pose or a `pose` override (G1's elbows are straightened to match the photos).
  - **Photos only:** robots marked `offline` run with web tools off (`STUDIO_AGENT_OFFLINE=1`), which tests design skill rather than lookup. G1 runs this way.
  - **No public CAD:** a task can give `frontDrawing`, a held-out orthographic front drawing that scores the silhouette (`bench/drawing.mjs`). Memo (a home robot with no public CAD) was scored this way from four photos; those inputs aren't public, so it's no longer in `bench/robots.mjs`, but its results below stay for history. MicroDuck has only a kinematic skeleton.
  - **Single parts** (`part-xl430`, `part-oak1`): the agent models a catalog part itself from photos, without placing it. The result is scored against the manufacturer's own mesh (`bench/glb.mjs` reads the GLB) over all 24 axis orientations. The judge compares it with renders of the real part in `judge-refs/`.
  - **New concepts:** text-only briefs (a wheeled home helper, a desktop biped), judged against the brief.
  - **Builds** (`build: true`): a brief that must also pass the build checks (`build-humanoid`: a ~50 cm Sprout-style humanoid for the P1S with an $800 budget). The run also saves `scene.json` (open it in the app), `build-bom.txt`, `build-print.txt` and `build-verify.txt`.
- **Vision judge** (`bench/judge.mjs`). For concepts it also gets the assembly tree (part names by subassembly) and `render-internals-iso` (outer shells hidden), so it can credit mechanisms behind covers.
- **Vision judge details:** headless Claude Code with only the Read tool grades the renders on a fixed 0–10 rubric. Replicas are graded against the photos (proportions, shapes, structure, details, overall); concepts against the brief (brief, engineering, cad, design, overall). It lists the five biggest problems, and runs after every benchmark run (`--no-judge` skips it).
- **Run:** `node bench/fetch.mjs <robot>` once, then `node bench/run.mjs <robot> --port 519x --run <name>`. Each run starts its own Vite server and headless Chrome (playwright-core) and sends the robot's photos to Claude Code through the real app. It saves `agent.stl`, `parts.json`, renders and `overlay.png` to `bench/runs/<name>/<robot>/`.
  - Give each concurrent run its own free port. The harness refuses to use a busy one.
  - Each run works on a snapshot copy of the app in the temp folder, with `node_modules` linked. Edits made during a run can't hot-reload into it, and its chats and images stay out of `library/`.
- **Score** (0–100):
  - 4/9 mean silhouette IoU (front, side, top), at the best of 4 yaw turns (all 24 orientations for single parts).
  - 5/18 Chamfer distance relative to 10% of height.
  - 1/6 height ratio.
  - 1/9 width and depth proportions, on robust 0.5–99.5% surface extents.
  - Part count is reported but not scored: URDFs merge each link into one mesh, so matching their count would punish real fasteners and catalog parts.
- **Replay:** `node bench/replay.mjs <run> <robot> [--views …] [--only "a,b;c"] [--keep]` rebuilds a run's final model from its tool calls, recompiling each part. It renders the model (optionally subsets of parts, for bisecting visual artefacts) and saves `fit.json` and `parts.json`. `--chat <conversation.json> --stop-at N` replays a saved chat up to its Nth tool call (subagents included), `--stop-at-call N` a run, and `--scene <start.json>` starts from a saved scene; it always writes `scene.json`.
- **Archive:** every run writes `scene.json`, `summary.json` (with `metrics`: seconds, cost, tokens, tool calls by name, from `events.jsonl` and the ACP prompt `usage`) and the judge's cost, and appends a line to `bench/runs/index.jsonl`. `node bench/report.mjs --index` lists runs by date, commit and cost.
- **Weekly:** `node bench/weekly.mjs [--robots a,b] [--concurrency 3] [--dry]` runs the whole bench and writes `bench/runs/weekly-<date>/report.md`.
- **Micro-evals** (`bench/micro/`): each task is a fixture built in code, one instruction and a code grader; 31 tasks from real design critiques and planted faults (assembly, service, cost, check integrity, craft, mirroring, rigging, Cases), 10 held out. A fixture's `imported` bodies (`imported.mjs`) load as `kind: 'mesh'` parts, the way a STEP import lands, so the agent can't read them from part code; R1 rigs a three-body arm turned 30° and passes on two hinges within 2° and 2 mm of their axes (`hingesOn`). A fixture's `cases` (Case specs) are built into its start scene (`create_case` in the app, the app's Case builder in Node), and a known fix keeps the start's Cases. D1 gives a Pololu rover on 32 mm wheels Reach a Spot past a Block with Time 8 s (0 of 20 runs; the drive turns wheels at 8 rad/s, so small wheels are slow), and passes when `run_case` says its Checks row passes, the Case is unchanged and the BOM, read in the app before the prompt (`task.startBom`), moved by at most 20% (60 mm wheels: 20 of 20, $86.77 → $89.07). `node bench/micro/run.mjs [--tasks A1,A2] [--seeds 3] [--tune]` runs them live (mean, pass^k, cost, time); never tune on `--heldout`. `node bench/micro/dry-run.mjs` grades start scenes and known fixes without an agent and must print “All graders behaved”. Graders call the app's checks through `adapters.mjs` / `appAdapters.mjs` (`check_assembly`, `craft`, `bom`, `size_actuators` data); a check with no data reports “unavailable”, never a pass. `node bench/micro/from-critique.mjs --chat <conversation.json> --message N` turns a critique into a task stub.
  - **The loop runs them.** Every 12 hours the harness lane picks the weakest tune category, changes the agent's harness for it and keeps the change only when tune improves against `main`'s cached baseline and held out holds ([The loop](loop.md), §0l).
- **Model and effort:** `run.mjs`, `micro/run.mjs` and `weekly.mjs` take `--model <id>` and `--effort <level>` (ids from the agent's model menu, e.g. `opus`, `fable`), sent with the prompt. Without them a run uses the agent's default. Every `summary.json` and index line records `model` and `effort` as asked, and `servedBy`: the model id that wrote most of the answer, read from the prompt reply's `_meta.quota.model_usage`. Trust `servedBy` over the alias: an alias like `fable` resolves to whatever version Claude Code ships.
- **Parallel slots** (`bench/slots.mjs`): a slot is one scene tab of one app copy, with its own agent session; the bridge routes tool calls, `agent-call` and events by workspace id. By default each slot gets its own app copy (Vite, headless Chrome and agent), since the page's one main thread with software WebGL can't serve several live agents: with 8 tabs in one page every CAD tool call timed out. `--per-app N` (up to 8, `MAX_TABS`) packs tabs for light work. In dev builds every mounted scene registers its dev API under `window.__studios[workspaceId]` and `window.__studioTabs` opens tabs, so the bench drives background tabs without switching. `micro/run.mjs --parallel N` (default 4) and `compare.mjs --parallel N` (default 8) use them; watch free memory, since each copy costs Chrome, Vite and an agent process.
  - **App copies:** the first copy starts alone, the rest together on free ports picked up front (`nextPort`). Each copy keeps its own Vite dependency cache (`BASECASE_VITE_CACHE`, read by `vite.config.ts`, seeded from `node_modules/.vite/deps`): copies sharing `node_modules/.vite` re-optimize over each other and a page never loads. `node_modules` stays one symlink, because the CAD kernel only reads from the real `node_modules` path. Vite starts from `vite.bench.config.mjs`, written into the copy, which adds that real path to `server.fs.allow`, so MuJoCo's WASM loads and Cases run in the app. A copy that fails to start is dropped and the run goes on with fewer slots.
  - **Health:** a run whose tool calls didn't reach the app (`appTimeouts` in `metrics.mjs`) is graded `error`, so it never counts against a model or lands in the baseline cache.
- **Compare two models** (`node bench/compare.mjs --models claude-fable-5-2,claude-opus-5-5 [--effort high] [--seeds 3] [--budget 20] [--parallel 8] [--margin 0.1] [--tasks …] [--tune|--heldout] [--no-cache] [--dry]`): runs the micro-evals for both models on parallel slots of one app snapshot, so tasks, graders, prompt and tools match exactly. Effort is pinned to one level both models offer (`high` when they both have it).
  - **Rounds:** each round runs every task once for both models, alternating which goes first. After each round it stops if the gap is settled: the 99% bootstrap interval excludes zero (a winner) or sits inside ±`margin` (no practical difference), once at least 5 tasks are graded for both. The stricter 99% level pays for checking after every round; the report quotes the 95% interval. Rerunning only the tasks where the models split would be cheaper but biases the gap toward zero, so every round covers every task.
  - **Budget:** a run starts only if what's spent plus it and the runs in flight, at the mean cost so far, fits `--budget` (USD the agent reports). `--dry` prints the plan, what the cache covers and a cost estimate without starting anything.
  - **Baseline cache** (`compare/cache.mjs`): every micro run records `harness`, a hash of what the agent and graders depend on (`HARNESS_PATHS`: the agent prompt and guides, CAD tools, kernel, backend, `src/agent`, checks and data, `bench/micro`, the lockfile, minus tests, CSS and docs, uncommitted changes included). A model named by its full id (`claude-opus-5-5`) reuses earlier runs from `bench/runs/index.jsonl` with the same harness, effort and answering model, so a new release pays only for its own runs. An alias (`opus`) is never reused, since what it resolves to changes. A changed path in `HARNESS_PATHS` means a fresh baseline; add a path there when the agent starts depending on it.
  - **Checks and report:** a full id must match the model that answers, or the run stops. `report.md` gives the verdict, why it stopped, what was spent and reused, the pass-rate gap with its interval and a sign test, cost, passes per dollar, time and tokens per model, and a per-task table. Micro-evals are graded in code, so there's no judge to pay for; robot runs cost far more and vary 10–40 points, so compare those with `weekly.mjs --model …` only once the micro-evals show a gap.
- **Pairwise judge:** `node bench/pairwise.mjs pair|judge|agree|rank|runs` asks twice with the order swapped, allows Unknown, keeps a verdict only when both orders agree, ranks with Bradley–Terry, and reports agreement with the user's labels (one JSONL line per pair: `{"id","a","b","winner":"a|b|tie|unknown","aspect","items":{"a","b"}}`). It replaces 0–10 scores for comparisons.
- **Lessons:** `node bench/playbook.mjs add --title … --lesson … --evidence <run>/<robot>` appends to `docs/Lessons playbook.md`. Append only; supersede, never edit.
- **Compare:** `node bench/report.mjs [runs…]`. After changing the scorer, run `node bench/rescore.mjs <run…>` so old runs use the same metric. `node bench/joints.mjs <urdf>` prints a URDF's zero-pose joint positions.
- `bench/data/` and `bench/runs/` are git-ignored, since they hold downloaded meshes and results.
- **Results** (current scorer; runs vary about ±3 points):

  | Robot | r1 baseline | r3 / r4 |
  |---|---|---|
  | Berkeley Humanoid | 63.9 | 81.8 / 77.7 |
  | Reachy Mini | 75.2 | 78.7 / 76.9 |
  | Open Duck Mini v2 | 68.8 | 73.9 / 75.8 |

  Silhouette IoU is 0.70–0.85 and Chamfer distance 1.3–2.2% of height.

  Harder tasks: Unitree G1 runs photos only; Memo (retired) has no public CAD; the two concepts are text-only. The vision judge varies about ±4 between runs.

  | Task | Metric | r5 baseline | r7 | r8 | r9 |
  |---|---|---|---|---|---|
  | Unitree G1 | geometry score | 62.3 | 80.6 | 73.0 | 86.7 |
  | Unitree G1 | judge | 56 | 60 | 64 | 56 |
  | Memo (retired) | front drawing IoU | 0.845 | 0.818 | 0.771 | 0.844 |
  | Memo (retired) | judge | 56 | 64 | 62 | 64 |
  | Concept: home helper | judge | 56 | 62 | 70 | 64 |
  | Concept: desk biped | judge | 62 | 60 | 64 | 66 |

  Rounds 12–20, nine runs each (current scorer; Memo is drawing IoU × 100; concepts are the judge score):

  | Task | Best | Mean | Worst |
  |---|---|---|---|
  | Dynamixel XL430 (part) | 91.9 | 90.3 | 89.4 |
  | Luxonis OAK-1 (part) | 90.8 | 87.4 | 85.8 |
  | Berkeley Humanoid | 88.5 | 82.7 | 71.5 |
  | Reachy Mini | 86.4 | 79.9 | 73.0 |
  | Unitree G1 (photos only) | 84.4 | 76.9 | 43.1 |
  | Open Duck Mini | 77.9 | 73.8 | 66.9 |
  | Memo (retired, drawing IoU) | 87.2 | 85.6 | 82.5 |
  | Concept: home helper | 66.7 | 62.0 | 53.3 |
  | Concept: desk biped | 66.7 | 65.2 | 63.3 |

  Known limits:
  - Run-to-run spread is 10–40 points on robots. It's driven by the agent's choices (pose, photo reading, whether research finds the URDF) more than by tools.
  - Memo's front photo is a perspective render with the hands angled, while the held-out drawing is orthographic. Matching the photo exactly (r20, every band within 10%) lowered the drawing IoU, so that task had a ceiling near 0.87 with those inputs. The same holds for any task scored against an orthographic drawing from perspective photos.
  - Concept scores depend on a strict judge. 9/10 means production-grade design and engineering.

  What each round changed:
  - **r7:** photo reading, `compare` and the proportion table.
  - **r8:** shape recipes and the mechanism checklist.
  - **r9:** the numeric profile in `compare`, the explicit neutral pose and the real-parts catalog. Most of the remaining gap is shell shape (head heights) and the part-count term, since reference URDFs count every mesh.
- **Lessons so far:**
  - Build in the neutral home pose: URDFs and CAD assemblies are drawn with every joint at zero.
  - For open-source robots, read the published robot description with `robot_skeleton`. WebFetch summarizes pages and loses exact numbers.
  - Score sizes on robust surface extents (0.5–99.5 percentiles), so thin antennas and cables don't dominate.
  - The agent must see the reference next to its own render (`compare`). From memory it misreads shadows as geometry, puts features on the wrong part, and drifts on relative sizes such as base vs column.
  - A proportion table per subassembly (z range and width as fractions of height) before the block-out fixes most layout errors on robots with no published CAD.
  - Proportions come right before shapes do. The prompt's shape recipes (tapered `prismoid`, front/side silhouette intersection, replicad lofts, ellipsoid heads) are how shells stop looking like boxes.
  - Prompt examples leak into results. A servo-housing example made the agent add vents and a split housing to the XL430 that the real part doesn't have. Keep examples on unrelated objects, and require a feature inventory from the references: model what's there and nothing else.
  - Every code example in the prompt must compile exactly as written (extract and run it). This has caught the replicad XZ-plane sign trap, a silently empty spline boolean at certain point counts, and `shell()` failing silently on spline bodies.
  - Test new tools against a real headless snapshot, not hand-made fixtures. In round 9, a fixture with an extra `size` field hid a crash in `compare`.
  - New designs are judged on whether mechanisms are visible and credible: an actuator per DOF, a lift with rails and a carriage, visible wheels, a stability check, and somewhere for the electronics to live.
  - Benchmark hygiene:
    - Run each benchmark from an app snapshot.
    - Preflight the CAD kernel, since a sandbox path error silently turns every part into a block. The bench compiles on the Node host (`BASECASE_NODE_KERNEL=1`), not the app's sandbox.
    - Never compare runs scored by different metric versions.
  - Compare block-out bounds with ratios measured in the photos before adding detail.
