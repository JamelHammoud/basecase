# Citation audit of the Agent harness notes

Audit date: 2026-10-25. Two independent passes checked every quantitative claim in the six notes and the roadmap against the primary source: the paper body or tables, a repo README or LICENSE, or an official page. **Where a note and this file disagree, this file wins.** Claims the audit confirmed aren't repeated here. Only corrections, overstatements and missing numbers are listed.

## Wrong or missing in the source (delete or replace)

| Claim as written | Note | Finding |
|---|---|---|
| CADGenBench: Opus 5.5 + tools 86.9% vs 37.3% for "a plain Claude entry" | roadmap, generative_3d | 37.3% is Claude Fable 5, a different model. Same-model pairs: Opus 5 36.1% → 59.6% with build123d-mcp; Opus 4.8 27.4% → 31.5%. The source is BenchLM's 49-sample mirror, marked "reference only" |
| Known brand chosen 670/670 at equal spec and price (arXiv 2609.16304) | cost | The result is in arXiv **2606.17443**, on skincare. Brand wins only exact ties: a +0.1-star edge for a rival removes it, and parameters explain 82.4% of choices against 1.2% for brand |
| 0.6% → 93.9% with a solver | cost, roadmap | Different models: 0.6% is GPT-4 TwoStage, 93.9% is Claude-3 + SMT. Like-for-like (GPT-4) it's 0.6% → 90.2%. All constraints of a travel itinerary, not budget arithmetic |
| SpatialViz: GPT-5 30.0 on mental rotation | verification | No GPT-5 row exists. Only the 3D-rotation subtask is near chance (o1 28.75 vs random 27.50) |
| 3DSRBench: GPT-5 68.2, Claude 4 Sonnet 62.0 | verification | Not in the paper (the newest Claude listed is 3.5 Sonnet) |
| Labelled 8×8 grid: GUI grounding 5.5% → 72.1% | verification | Not found |
| SAM 3 empty masks 3.8% → 38.9% without an LLM | verification | Not found |
| Kinematify 0.23 vs 1.34 for absolute placement | assembly | 1.34 is a loss-term ablation, not absolute placement |
| R3L: 2026 models have 4.3% collisions | assembly | 4.3% is the LayoutGPT baseline in R3L's table |
| "Euler rotations are the riskiest numbers the agent writes" | roadmap | No measurement. It was an inference |
| Thread engagement up to 2.5×D (RoyMech) | assembly | RoyMech gives 2×D for aluminium, zinc and plastics. There's no 2.5×D |
| fal Hunyuan 2mv-turbo ≈ $0.015, front/left/back/right | generative_3d | $0.14 per generation; front, back and left required; no right view |

## Overstated (the number exists but means less)

| Claim | Finding |
|---|---|
| Every frontier model failed tool access, fasteners, clearance (ShanghaiTech, 2610.17881) | 4 OpenAI models, one gorilla design each. **8** checks fail for all four (A05, A06, A07, A09, B05, DB05, C02, C05), not 6. Failures per model: 8 / 18 / 17 / 19 |
| "No benchmark measures assemblability" | Interfaces, clearances and mating pairs are measured (MUSE). What's missing is sequence, insertion paths and tool access |
| "Every working assembly system puts geometry in the loop" | ArtiCAD's success and routing rest on VLM judges |
| Straight-line removal "solves most real assemblies" | That's Assemble-Them-All's design premise. Its physics-push planner reaches 76.7% at 50+ parts, and ASAP 67–82% with gravity. The 90/78/44 row is RRT, on 3–9, 10–49 and 50+ parts |
| FunCADBench: pass/fail feedback took a model 22 → 0 | Astra's 0 includes unfinished runs; Grok went 19 → 8; N = 46. The lowest axis is *contact* (engagement, release, friction), not assembly. Test-weakening was one anecdote |
| CADTests F1 0.96 vs 0.55 for a VLM judge | 125 samples, 2 annotators (κ 0.54). The judge is an older absolute-score metric, not a 2026 pairwise frontier judge. Mutation detection is 0.89, not > 90%. Sonnet 4.6 0.715 → 0.810 is the +Log variant |
| Measure-then-claim: 14.1% → 3.2% shipped wrong | The 3.2% arm adds tool use *and* the contract, so the contract alone isn't measured. Self-published, 13 tasks, unnamed models. The planner-coder-checker arm had 2.6% silent failures but lower success |
| Frontier models ~14 ops per part vs 22–43 for specialists | Frontier models got one grayscale render, specialists the full mesh. There's no ground-truth count, and the paper doesn't say more is better |
| Fillet edges selected right ~21.5% (F1) | General face and edge grounding through CadQuery selectors (Sonnet 4.5), not fillet-specific; F1 isn't "% of the time" |
| BesiegeField: valid files 8/8 vs 0/8 | 8/8 parse; 4/8 are valid machines. N = 8. Gemini 2.5 Pro reached 5/8 valid with global poses |
| Real2Code pivot error 0.03 vs 0.6 | Only at 4+ parts, about 6 objects per group; equal at 2–3 parts |
| SpatialGrammar 13.6% vs 66.7%, "same Claude Sonnet 4" | The paper says "the same LLM". The model isn't named |
| VLM angles collapse to 0/90/180° in 91.8–100% | Three 7–8B open models. GPT-4o 82.0%, GPT-5.4 68.9%; no Claude tested |
| "Improvements decay ~1/iteration, so sample rather than repair" | That's the *frequency* of improvements, and the paper only "suggests" it. It never compares sampling with repair |
| BLINK: 7–13 points above chance on depth, multi-view, correspondence | 13.17 and 7.63 are the *overall* margins for GPT-4V and Gemini, not per task |
| 3D-DefectBench false positives: shadows 69% | 69% on the expert split, 34% on the silver split. Missing parts 78% silver, 60% expert |
| MLLM-as-a-Judge: pairwise 0.77 vs absolute 0.49 | Different metrics (accuracy vs Pearson). With ties allowed, pairwise is 0.636 |
| GPTEval3D: one criterion per prompt helps | It helped 4 of 5 criteria; **geometry was better with a joint prompt** |
| CADCodeVerify: numeric feedback 0.103 beats VLM QA | 0.103 uses the ground-truth object, so it's an upper bound |
| P3D-Bench: OpenSCAD 100% valid vs CadQuery 91–94% | True in v1. v4 (14 Oct 2026) puts CadQuery at 96.8–100% |
| Anthropic context management: 84% fewer tokens | That's context editing alone, on a separate eval |
| Chief Delphi quote on "the Fusion MCP" from "an FRC mentor" | It's about Fusion's AI Assistant, and the poster isn't identified as a mentor |
| Hunyuan on a Mac in about 6 min | Shape only. With texture it's about 14 min |

## Prices corrected

| Item | Correct |
|---|---|
| STS3215 C018 (12 V) | About $24–28 (0.11–0.12 N·m/$). The $13.89 often quoted is the 7.4 V C001 |
| Feetech vs Dynamixel torque per dollar | About 4–12×, not 5–20× |
| Reachy Mini | $399 Lite, $499 Wireless (launch prices were $299 / $449) |
| STS3250 | $74–115 at stores (your recorded Amazon price is $60) |
| Pi 5 4 GB $110, Jetson Orin Nano Super $399 | Confirmed. The April Pi step comes from other outlets than The Register |

## Image limits (Anthropic vision docs)

- Claude 4.7 and later read up to 2,576 px (up to 4,784 tokens per image).
- Past 20 images in one request, every image must be ≤ 2,000 px, and oversized images are **rejected, not resized**.
- That count includes images from earlier turns and images nested inside tool results, so long agent sessions are effectively capped at 2,000 px.

## Not checked

- Product rows: Onshape, Fusion, SOLIDWORKS, Siemens, Backflip.
- Research: BlenderAlchemy, Zero123++, the AIDL / LL3M feature-deletion counts, Query2CAD and ProCAD corrections.
- Practices and claims: Boothroyd chart times, PLA snap strain, insert pull-out force.
