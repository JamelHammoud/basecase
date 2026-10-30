# Agent harness design and evals: lessons from code agents, applied to CAD

> Audited 2026-10-25: several numbers here are corrected or withdrawn in [`citation_audit.md`](citation_audit.md), which takes precedence.

Research date: 2026-10-25. Scope: tool design, feedback, context engineering for multi-hour runs, test-time compute, critics, multi-agent orchestration, learning without fine-tuning, evals and model portability. Items marked **[unverified]** come from abstracts, secondary sources or memory.

## Takeaway

All three of the user's top failures (unassemblable designs, overpriced parts, amateur parts) have the same structural cause: each quality is checked late or not at all, and when it is checked, it's prose the model applies to itself rather than a tool that returns a verdict. The literature agrees on the fix: **give the agent an executable check with diagnostic output, run it at the moment of the edit, and gate "done" on it.** Use fresh-context critics and sampling only for what checks can't cover, and measure every change on fast, auto-graded evals.

## Tool design and feedback

- **SWE-agent** ([2405.15793](https://arxiv.org/abs/2405.15793)): interface design alone took GPT-4 Turbo from 11.0% to 18.0% on SWE-bench Lite. Removing the edit linter's guardrail cost 3 points. Any edit eventually succeeds with 90.5% probability, but only 57.2% after one failed edit: failures cascade, so catch mistakes at the edit.
- **Anthropic, "Writing effective tools for agents"** ([link](https://www.anthropic.com/engineering/writing-tools-for-agents)): consolidate multi-step operations; return high-signal, human-readable fields; offer concise vs detailed responses; truncate by default; write errors that say how to fix the problem. Small description changes give large gains, and Claude-optimized tool descriptions beat expert-written ones on held-out evals.
- **Advanced tool use** ([link](https://www.anthropic.com/engineering/advanced-tool-use)): tool search lifted Opus 4 from 49% to 74% with 85% fewer definition tokens (worth it above ~10 tools or 10k tokens of definitions); input examples raised complex-parameter accuracy from 72% to 90%.
- **FunCADBench** ([2610.26861](https://arxiv.org/html/2610.26861v1)): diagnostic feedback → binary pass/fail dropped one model from 22 to 0 solved tasks; vision barely mattered. Agents weakened failing tests during repair: the agent must not be able to edit its own gate.
- **CADCodeVerify**: exact numeric feedback beat VLM visual QA (median point distance 0.103 vs 0.127 vs 0.155 with none).

Applied to Basecase: a short consequence diff on every `model_part` / `add_parts` result (new interferences, hostless screws, screwless holes, sharp visible edges, box-ness, BOM delta), 3–8 lines with details behind a flag. Fix stale descriptions (`get_bom` says "no price recorded"). Add 1–2 input examples to the most complex schemas (`add_parts` catalog keys, `model_part` with `expect_size`, `pose`). About 40 tools is above the tool-search threshold; Claude Code may defer MCP definitions, but Codex and Gemini don't, so keep descriptions tight.

## Context engineering for multi-hour runs

- **Context rot** ([Chroma](https://www.trychroma.com/research/context-rot)): accuracy falls with input length even on trivial tasks; focused ~300-token prompts beat full ~113k-token prompts for every model family, Claude showing the largest gap.
- **Anthropic, "Effective context engineering"**: pitch the prompt at the right altitude; load context just in time; compaction, tool-result clearing, structured notes, subagents returning 1–2k-token summaries. Context editing plus memory: +39% on agentic search, 84% fewer tokens over 100 turns ([link](https://claude.com/blog/context-management)).
- **Manus** ([link](https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus)): KV-cache hit rate is the top metric (input:output ≈ 100:1); keep the prefix stable and append-only; mask tools rather than removing them; use files as memory with restorable compression; recite the plan; keep errors in context.
- **Model guides**: contradictory instructions make GPT-5 burn reasoning reconciling them; recent Claude models overtrigger on "CRITICAL/MUST" language; Opus 5.5's guide recommends treating a text-only turn end as a report, and sending a short continuation that names open checklist items (at most 2–3 times).
- **Long-running harnesses** ([link](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)): requirements in a JSON list the agent may only flip to passing, never delete; every session reads it first.

Applied to Basecase:
- **Progressive disclosure through an MCP tool**, not Claude Skills (CAD sessions run with `settingSources: []`, and Codex/Gemini don't load Skills): `get_guide(topic)` for shells, die-cast, enclosure, buildable robot, motion, SimReady, robot priors, assembly patterns, part library. The core prompt shrinks from ~590 lines (~11–12k tokens, estimate) to ~150–200: scope, frame, workflow, gates, craft bar as outcomes. Audit it for contradictions ("80–300 parts" vs "prefer complete structure over tiny details").
- **Durable plan as data in the scene** (`project.plan`: reference sheet, requirements with `passes`, build order, interfaces, style tokens) with `get_plan` / `update_plan`, instead of markdown in chat that compaction can lose and every subagent brief has to retype.
- **Images are the biggest context cost**: smaller defaults with a high-res option; results name their view and ids so they can be redone after clearing.
- **Auto-continuation** on failing gates or open requirements, at most 2–3 times.

## Test-time compute

- **More samples beat more repairs** (Olausson et al., ICLR 2024, [2306.09896](https://arxiv.org/html/2306.09896)): at equal budget, self-repair gains are modest; base-sample diversity matters more; feedback quality is the bottleneck (better feedback 1.58× repair success).
- LLMs struggle to self-correct without external feedback (Huang et al., [2310.01798](https://arxiv.org/abs/2310.01798)).
- Verifiers turn samples into wins: SWE-bench Lite coverage 15.9% → 56% from 1 to 250 samples, but voting plateaus without an automatic verifier (Large Language Monkeys); CodeT's generated tests +18.8 points; CodeMonkeys shows selection is a bottleneck of its own.
- Improvements decay roughly as 1/iteration (Frontier-Eng, [2604.12290](https://arxiv.org/abs/2604.12290)); Basecase's own r20 Memo result agrees.
- A fixed pipeline with selection can beat open agency (Agentless, 32% at ~$0.70).

Applied to Basecase: **best-of-N where variance is born, not over whole runs.** Run-to-run spread is 10–40 points, driven by early choices (photo reading, pose, whether research finds the URDF). After research, three parallel block-out subagents each write a reference sheet and block-out into namespaced ids; the harness scores each (silhouette IoU against the best photo, `check_skeleton`, proportion consistency, `size_actuators` cost) and the lead keeps the best. Write acceptance tests before modeling (CodeT for CAD). Keep the 3-round cap.

## Critics and gates

- Claude Code best practices: give a check that returns pass/fail; gate done deterministically; an adversarial reviewer in a fresh subagent that sees only the result and the criteria, told to report only requirement-level gaps.
- CriticGPT: model critiques caught more bugs but hallucinate nitpicks. GPTEval3D: pairwise multi-view comparison aligns with humans. MLLM-as-a-Judge: pairwise 0.77 vs absolute 0.49.
- CADSmith: a different model as judge, with kernel numbers and renders together.

Applied to Basecase, three fresh-context critics, each with a short checklist and an "Unknown" option, returning findings tied to part ids, never fixes:
1. **Assembly critic**: `check_assembly` output, the declared build order, renders of each step from the tool's direction; looks for what the checker can't (snaps, cable routing, hand access, a sensible order).
2. **Cost/DFM critic**: BOM and printability; the three most expensive lines with catalog alternatives, over-specified actuators, parts that could merge or split.
3. **Industrial-design critic**: close renders of each visible part, RGB plus normals, beside a real expert reference (catalog CAD, SO-101, Open Duck), in random order; names the one largest gap; 3 votes to absorb variance.

## Multi-agent orchestration

- Anthropic's research system: lead + subagents beat a single agent by 90.2%; token use explained 80% of variance; ~15× chat tokens; vague briefs caused duplicated work and gaps; pass artifacts by reference; coding has fewer parallelizable subtasks.
- Cognition, "Don't build multi-agents": actions carry implicit decisions (two subagents built a Mario background and a mismatched bird).
- MAST: 14 failure modes in system design, inter-agent misalignment and task verification.
- Opus 5.5 guide: a time-budget line made teams finish sooner at comparable quality; recent Opus models over-delegate unless told when not to.

Applied to Basecase: subassembly designers fit because geometry decomposes along interfaces; the risk is Cognition's, with fillet family, screw size, wall and colour drifting between designers. Replace prose briefs with **contracts** in `project.plan.interfaces` (owned ids, envelopes, datums and joint axes, bolt patterns with the screws that cross the seam, shared style tokens) checked automatically at handback. See `assembly_and_mates.md`.

## Learning without fine-tuning

- Voyager: a library of executable, self-verified skills (3.3× more unique items). Agent Workflow Memory: +24.6% relative on Mind2Web, +51.1% on WebArena. Dynamic Cheatsheet: GPT-4o on Game of 24 ~10% → 99% by reusing one validated solution.
- ACE ([2510.04618](https://arxiv.org/html/2510.04618)): an evolving playbook of itemized delta bullets with helpful/harmful counters, +10.6% on agents. Warns of **context collapse**: a monolithic rewrite shrank an 18,282-token playbook to 122 tokens and accuracy fell below the no-adaptation baseline. Without reliable feedback, these methods degrade.
- GEPA ([2507.19457](https://arxiv.org/html/2507.19457)): reflective prompt evolution on traces plus textual feedback, Pareto selection; up to 35× fewer rollouts than GRPO and prompts up to 9.2× shorter.

Applied to Basecase: the proven-part library (verified executable artifacts, not advice; see `cad_code_and_craft.md`); later, a small `lessons.json` playbook curated with non-LLM merging; then GEPA-style optimization of tool descriptions and `get_guide` sections against the micro-evals, accepted only with a paired improvement on held-out tasks. AGENTS.md "Lessons so far" is already hand-curated playbook content.

## Evals

- Anthropic, "Demystifying evals for AI agents" ([link](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)): start with 20–50 tasks from real failures; prefer code graders; one dimension per LLM judge, with "Unknown", calibrated against humans; grade outcomes; clean environment per trial; read transcripts (fixing grading bugs took Opus 4.5's CORE-Bench score from 42% to 95%); separate capability from regression evals; report pass^k (75% per trial is ~42% for 3 of 3).
- τ-bench: pass^8 below 25%. Miller, "Adding Error Bars to Evals": standard errors, paired differences, several samples per task.

**Micro-eval suite** (single subassemblies, 5–20 minutes each, auto-checked, 3–5 seeds, mean + pass^k + paired delta, a held-out third never used for tuning):
- **Assembly (~25):** generation tasks graded by `check_assembly` (a Pi 5 enclosure with a screwed lid and reachable ports; an STS3215 knee with U-bracket and idler between given envelopes; a two-part limb shell around a servo, split front/back, all screws drivable; a battery bay with a removable cover) plus **seeded-fault tasks** that score checker and critic recall and precision in seconds.
- **Cost (~15):** selection-only tasks graded against an exhaustive solver; design-with-budget tasks graded by BOM ≤ budget, no FAIL, cost ratio vs a reference build.
- **Craft (~20):** single parts against manufacturer references (extending `part-xl430`, `part-oak1`) and specified printed parts; IoU/Chamfer, craft lint metrics, feature-inventory count matched, and a pairwise judge (positions swapped, Unknown allowed) calibrated once on ~50 pairs the user labels.
- **Variance drivers (~10):** photo reading against held-out ratios, pose neutralization, URDF discovery.

Operating rules: the whole-robot benchmark becomes a weekly end-to-end check; harness changes are gated on the micro-suite; saturated tasks graduate to regression; every user-reported failure becomes a task; read failure transcripts every round (Docent-style clustering).

**Keep the artefacts.** `bench/runs/` doesn't exist on this machine: none of the runs AGENTS.md reports (r1–r9, rounds 12–20) kept their `judge.json`, `summary.json` or `events.jsonl`, so their critiques can't be mined. Archive every run's results (compressed, outside git) and record tokens and wall time per run; `bench/run-events.mjs` already counts tool calls.

## Model portability

One model-neutral core that states outcomes and gates, plus thin overlays: Claude (soften capitalized imperatives, control subagent overuse), GPT/Codex (remove contradictions, explicit persistence and stop conditions), Gemini (temperature 1.0, avoid broad negative instructions). Run the micro-suite per model. Executable checks and `get_guide` tools are the most portable investments. mini-SWE-agent's ~74% on SWE-bench Verified with a ~100-line loop suggests value moves from elaborate prompting to environment feedback as models improve.

## Unverified

EcoAgent-Bench numbers (secondary), Budget-Aware Tool-Use numbers (abstract only), Miller's specific recommendations (memory), whether Claude Code defers this MCP server's tool definitions, the prompt's token estimate, and the claim that pairwise judging will reduce our judge's ±4 variance.
