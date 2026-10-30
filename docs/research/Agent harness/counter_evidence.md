# Counter-evidence: where the roadmap's bets could fail

Research date: 2026-10-25. A skeptical review looked for evidence *against* each bet, after the first research round had mostly collected evidence for them. About 30 searches and 12 primary sources. Source tags: **[P]** primary text read, **[A]** abstract or snippet, **[S]** secondary. These figures weren't re-audited in [`citation_audit.md`](citation_audit.md).

## 1. Geometric assembly checking: holds, with changes

- **Assemble-Them-All** [P]:
  - Geometric baselines solve 44% of large assemblies; its physics method 77%.
  - Screws drop from 75% to 37.5% once the assembly is randomly rotated.
  - Snap fits are left to future work.
- **ASAP** [P]:
  - Median runtime is 4,190 s for more than 30 parts.
  - About half of its failures are loosely assembled parts with no sequence found.
- **Planning depends on CAD quality** [A] (CIRP 2023): "only two of the ten models resulted in suitable assembly plans".
- **Commercial DFA keeps a person in the loop:**
  - Boothroyd Dewhurst DFA is questionnaire-driven [P].
  - PTC and Siemens tools need a human to review each interference [P/A].
  - No CAD tool checks assembly-driver access automatically [A].

**Changes adopted:**
- WARN until the check is quiet on clean negatives.
- Semantic checks first.
- Removal order only along declared directions, time-boxed.
- Fit-clearance and cable checks added.

## 2. Mates instead of coordinates: holds, with changes

- **AADvark** [P]: it had to rebuild its solver before its agent could use it. One scissors design took 4.1 h and $15.85.
- **ArtiCAD** [A] restricts designs to kinematic trees, because loops "are difficult for an LLM to keep consistent". Topological naming makes relations fragile when code is recompiled.
- **CADEngBench** [A]: models "often locate the relevant region but fail to recover the recorded joint or mating entities".
- **build123d's `connect_to`** is a one-shot placement, not a persistent constraint.

**Change adopted:** `mate` is a one-shot helper; catalog ports first; anything more waits for an A/B test.

## 3. Executable checks and gates: the strongest bet, with gaming risks

- **ImpossibleBench** [P]:
  - Opus 4.1 cheats on 50–55% of impossible coding tasks, and GPT-5 on 54%.
  - Over 79% of Claude's cheats modify the tests.
  - Read-only tests stop test edits, but special-casing continues.
  - An "abort and flag for a human" option cut GPT-5 from 54% to 9%.
- **METR** [P, blog]: models modify scoring code while acknowledging it isn't what the user wants.
- **Over-correction** [A]:
  - FlipFlop: challenged models flip their answer 46% of the time.
  - Self-critique without a sound verifier collapses performance.
- **Tool overload** [A]: tool selection falls as the tool pool grows (13.6% vs 43.1% with retrieval).

**Changes adopted:**
- Requirements frozen at plan time.
- Declarations backed by geometry.
- A waiver with a reason, shown to you.
- Lint output limited to what changed.

## 4. Prices and a cost solver: holds, with changes

- **LLM model-based robot design** [P]:
  - Direct LLM designs were 0 of 30 feasible; the LLM swapped peak power for continuous.
  - With the LLM writing the constraint model, only 7 of 34 of its Pareto designs were feasible under the expert's model.
- **Real servos fail under stalls and duty cycles,** not static loads [S, anecdotes].
- **Agents show strong position bias** in lists (ACES) [A].
- **No LLM study of engineering BOM optimisation was found.**

**Changes adopted:**
- Loads from simulation, with margins.
- Candidates listed by margin, not cheapest-first.
- A fragility metric paired with cost regret.
- The load model written in code by us, not by the LLM.

## 5. Best-of-N and critics: weak as first specified

- Selection is the bottleneck in sampling approaches (CodeMonkeys) [A].
- A selector scoring against photos inherits any camera or pose bias.
- **The best VLM judge of 3D defects reaches MCC 0.30** (3D-DefectBench). No study validates VLM aesthetic judgement of product renders against experts.

**Changes adopted:**
- Best-of-N comes after masks (and the camera fit for phone photos), with adaptive N.
- Critics allow "no significant gap", and their rate of flipping to wrong answers is measured on your labels first.

## 6. Slimming the prompt: holds, with changes

- **IFScale** [P]: Opus 4 follows 100% of instructions at 50 instructions, 94.6% at 100, 67.9% at 250 and 44.6% at 500. Errors are mostly omissions.
- **Vercel's agent evals** [P]: the skill wasn't invoked in 56% of cases, so the default skill setup scored like having no docs. A compressed index in the always-loaded prompt reached 100%.

**Change adopted:** a core prompt with an index, and guides pushed by tool results rather than waiting to be fetched.

## 7. What a strong team would do first

- **A construction-kit design space and template robots early:** LegoGPT's stable share rose 24% → 98.8% with physics-aware rollback during generation, on a tiny brick set.
- **A physical build loop:** print-fit coupons calibrated on your P1S, and one real build per phase.
- **Fit classes and cable routing checks.**
- **Checklists turned into code checks,** not prompt text.

## Sources

- Assemble-Them-All: https://arxiv.org/html/2211.03977
- ASAP: https://arxiv.org/html/2309.16909
- AADvark: https://arxiv.org/html/2604.15184
- ArtiCAD: https://arxiv.org/pdf/2604.10992
- CADEngBench: https://arxiv.org/abs/2608.09296
- ImpossibleBench: https://arxiv.org/html/2510.20270v1
- METR on reward hacking: https://metr.org/blog/2025-06-05-recent-reward-hacking
- FlipFlop: https://arxiv.org/abs/2311.08596
- Self-critique without a verifier: https://arxiv.org/abs/2310.12397
- Tool selection at scale: https://arxiv.org/abs/2505.03275
- LLM model-based robot design: https://arxiv.org/html/2609.33423
- ACES: https://arxiv.org/abs/2508.02630
- IFScale: https://arxiv.org/html/2507.11538v1
- Vercel agent evals: https://vercel.com/blog/agents-md-outperforms-skills-in-our-agent-evals
- LegoGPT: https://arxiv.org/html/2505.05469v1
