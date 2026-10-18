# LLM parametric CAD-as-code: generation, verification and feedback loops (state of the art to Oct 2026)

Scope: how LLMs and VLMs generate parametric CAD as code, how the best systems verify and improve the geometry, and which techniques a desktop app could adopt. The app in question has Claude Code writing OpenSCAD + BOSL2 and replicad (OpenCascade.js) parts, with tools to render views, compare against reference photos and check interference.

Research date: 2026-10-17. Many of the 2026 sources are arXiv preprints or leaderboards. Model names such as GPT-5.x, Claude Opus 5 and Gemini 3.x are reported as the sources give them.

---

## 1. Papers and measured results: representations, metrics, and what improved results most

### Takeaway
Fine-tuned small models (CAD-Recode, CAD-Coder, Text-to-CadQuery) score very well on in-distribution sketch-extrude datasets (DeepCAD and Text2CAD). They do this with sample-and-select or RL against a geometric reward such as Chamfer distance. Frontier general LLMs win on harder, out-of-distribution benchmarks (Text2CAD-Bench), where fine-tuned domain models fall to near-zero IoU.

The levers that most reliably improve results:
1. **Execution feedback for compile errors.** It produced the largest single jump in Query2CAD (+19.6 points in one round).
2. **Generating several candidates and keeping the best by a geometric score** (CAD-Recode).
3. **RL with a Chamfer reward and planning chain-of-thought before code** (CAD-Coder).
4. **Render-and-critique.** Gains are modest but real (CADCodeVerify: −7.3% point distance), and they come only when the model keeps revising (P3D-Bench).

### Cited Findings

**CAD-Recode** (Rukhovich et al., Univ. Luxembourg / Artec3D; arXiv Dec 2024, ICCV 2025)
- Input and output: point cloud → CadQuery Python, using a point-cloud projector and a Qwen2-1.5B decoder — [ICCV 2025 PDF](https://orbilu.uni.lu/bitstream/10993/67036/1/CADRecode_ICCV_2025.pdf); [supplemental](https://openaccess.thecvf.com/content/ICCV2025/supplemental/Rukhovich_CAD-Recode_Reverse_Engineering_ICCV_2025_supplemental.pdf)
- Training data: 1M procedurally generated sketch-extrude CadQuery programs — [alphaxiv overview](https://alphaxiv.org/overview/2412.14042v2)
- Verification: it generates 10 candidates from different point-cloud samplings, executes each, and keeps the one with minimum Chamfer distance to the input.
- Results on DeepCAD against CAD-SIGNet, the previous best: mean Chamfer distance 3.43 → 0.30 and IoU 77.6% → 92.0%. Similar gains on Fusion360 and the real-scan CC3D set — [ICCV PDF](https://orbilu.uni.lu/bitstream/10993/67036/1/CADRecode_ICCV_2025.pdf)
- Because the output is readable Python, off-the-shelf LLMs can edit it and answer questions about it — [same](https://orbilu.uni.lu/handle/10993/67036)

**CADCodeVerify + CADPrompt** ("Generating CAD Code with Vision-Language Models for 3D Designs", Alrashedy et al., arXiv Oct 2024, ICLR 2025)
- CADPrompt benchmark: 200 objects, each with a natural-language prompt and expert CadQuery code. It is stratified by mesh, compile and geometric complexity — [arXiv v2](https://arxiv.org/html/2410.05340v2)
- How the visual verification works:
  - The VLM writes 2–5 yes/no verification questions per prompt.
  - It renders the object at 0°, 90°, 180° and 270°.
  - It answers each question Yes, No or Unclear, with chain-of-thought.
  - Feedback is built only from the questions not answered "Yes".
  - Two refinement rounds; the authors saw no gain beyond round 2.
  - Compile errors are handled separately, by sending the compiler error back to the model — [arXiv v2](https://arxiv.org/html/2410.05340v2)
- Results, GPT-4 few-shot (median point-cloud distance):

  | Method | Point-cloud distance | Compile rate |
  |---|---|---|
  | No refinement | 0.155 | 96.0% |
  | 3D-Premise (render + description) | 0.137 | 91.0% |
  | CADCodeVerify | 0.127 | 96.5% |
  | Human-in-the-loop feedback | 0.120 | — |

  The headline "7.30% reduction" is measured against 3D-Premise — [arXiv v2](https://arxiv.org/html/2410.05340v2)
- The geometric-solver feedback baseline needs the ground truth, so it serves only as an upper bound — [arXiv v2](https://arxiv.org/html/2410.05340v2)
- The VLM's own answers to its verification questions were only 64.6% accurate (68.2% at round 2). The verifier is noisy — [arXiv v2](https://arxiv.org/html/2410.05340v2)
- CADCodeVerify helped most on Hard and Complex objects. 3D-Premise lowered the compile rate on hard data — [arXiv v2](https://arxiv.org/html/2410.05340v2)
- Metrics: point-cloud distance, Hausdorff distance and IoGT (not IoU), after ICP alignment and unit-cube normalization. Failed compiles score √3 — [arXiv v2](https://arxiv.org/html/2410.05340v2)
- The compile-rate gain is reported as 5.5% in one version and 5.0% in another — [arXiv v1](https://arxiv.org/abs/2410.05340v1) vs [v2](https://arxiv.org/html/2410.05340v2)
- Code is at github.com/Kamel773/CAD_Code_Generation — [HF papers](https://huggingface.co/papers/2410.05340)

**Query2CAD** (Badagabettu et al., arXiv Jun 2024)
- The LLM writes FreeCAD Python macros. The test set is 57 queries (21 easy, 20 medium, 16 hard) — [arXiv](https://arxiv.org/html/2406.00144v1)
- Two refinement loops:
  - Error refinement: the error message and code go back to the LLM, up to 3 times.
  - Model refinement: the isometric render is scored with VQAScore (CLIP-FlanT5-XL, threshold 0.9). If it falls short, a BLIP2 caption of the render goes back as feedback, up to 3 times. Human captions work better.
- Success by round, y0 → y1 → y2 → y3:
  - GPT-4 Turbo: 53.6% → 73.2% → 76.7% → 76.7%
  - GPT-3.5 Turbo: 32.7% → 44.8% → 51.7% → 53.4%
  - CodeLlama-70B did poorly — [arXiv](https://arxiv.org/html/2406.00144v1)

**Text-to-CadQuery** (arXiv May 2025)
- It adds 170K CadQuery annotations to Text2CAD and fine-tunes six open LLMs. The best reaches 69.3% top-1 exact match (up from 58.8%) and cuts Chamfer distance by 48.6% — [arXiv](https://arxiv.org/html/2505.06507v1)
- Project: github.com/Text-to-CadQuery/Text-to-CadQuery — [HF](https://huggingface.co/papers/2505.06507)

**CAD-Coder, text → CadQuery** (Guan et al., NeurIPS 2025, arXiv 2505.19713)
- Base model is Qwen2.5-7B-Instruct, trained in three stages: SFT on 8K high-quality text–CadQuery pairs, a 1.5K chain-of-thought cold start, then GRPO over all 150K Text2CAD training descriptions — [arXiv v3](https://arxiv.org/html/2505.19713v3)
- Reward: a geometric term from Chamfer distance (1.0 when CD < 1e-5, 0 when CD > 0.5 or execution fails, interpolated between) plus a binary format reward for having a `<think>` block and a code block — [arXiv v3](https://arxiv.org/html/2505.19713v3)
- Results on the Text2CAD test set (CD ×10³; IR is invalidity rate):

  | Model | Mean CD | Median CD | IR |
  |---|---|---|---|
  | CAD-Coder | **6.54** | **0.17** | **1.45%** |
  | Text2CAD | 29.29 | 0.37 | 3.75% |
  | GPT-4o | 133.52 | 45.91 | 93.0% |
  | Claude 3.7 Sonnet | 186.53 | 134.16 | 47.0% |

  Zero-shot frontier models fail badly in this dataset's exact conventions — [arXiv v3](https://arxiv.org/html/2505.19713v3)
- Ablation (mean CD): SFT only 74.55 → without CoT 17.34 → full 6.54. GRPO with a geometric reward is the biggest lever, and CoT halves the error again. Training used 8× A800 GPUs; GRPO alone took about 146 h — [arXiv v3](https://arxiv.org/html/2505.19713v3)

**CAD-Coder, image → CadQuery** (Doris, Alam, Heyrani Nobari, Ahmed, MIT DeCoDE; arXiv May 2025)
- A LLaVA-1.5-style model (Vicuna-13B with CLIP-ViT-L-336) fine-tuned on GenCAD-Code, more than 163K image–CadQuery pairs — [alphaxiv](https://alphaxiv.org/abs/2505.14646)
- Reported results: 100% valid syntax, and higher 3D-solid similarity than GPT-4.5 and Qwen2.5-VL-72B on a 100-sample test subset. Some generalization to real photos — [arXiv](https://arxiv.org/abs/2505.14646)
- It failed on fillet operations absent from its training data, per a third-party summary — [Moonlight review](https://www.themoonlight.io/en/review/cad-coder-an-open-source-vision-language-model-for-computer-aided-design-code-generation)
- Open source: github.com/anniedoris/CAD-Coder — [alphaxiv](https://alphaxiv.org/abs/2505.14646)

**CAD-Assistant** (Mallis et al., ICCV 2025, arXiv 2412.13810)
- A VLLM planner generates FreeCAD Python actions, runs them step by step, checks how each command changed the geometry, and adapts its next step.
- Tools include a sketch-image parameterizer, renderers and a **2D cross-section generator**.
- The paper reports beating VLLM baselines and supervised task-specific methods on several CAD benchmarks. Numbers were not retrieved — [arXiv](https://arxiv.org/abs/2412.13810v3); [ICCV](https://openaccess.thecvf.com/content/ICCV2025/html/Mallis_CAD-Assistant_Tool-Augmented_VLLMs_as_Generic_CAD_Task_Solvers_ICCV_2025_paper.html)

**CADFusion** (Wang et al., Microsoft; ICML 2025, arXiv 2501.19054)
- It alternates sequence learning on ground-truth parametric sequences with a "visual feedback" stage. Rendering is non-differentiable, so the visual stage uses preference optimization (DPO, per a review) over which renders are better — [arXiv](https://arxiv.org/abs/2501.19054v3); [review](https://themoonlight.io/review/text-to-cad-generation-through-infusing-visual-feedback-in-large-language-models)
- On Text2CAD-Bench, CADFusion has 53–70% invalidity and IoU 0.03 — [Text2CAD-Bench](https://arxiv.org/html/2605.18430v1)

**Other models, from the ACM Computing Surveys 2026 LLM-for-CAD survey** (arXiv 2505.08137)
- CAD-Llama: LLaMA3-8B, structured parametric code.
- CAD-MLLM: Vicuna-7B with LoRA; inputs are text, 8 fixed views or point clouds; outputs parametric sequences.
- OpenECAD: TinyLLaVA (OpenELM, Gemma, Phi-2) from 3 rendered views to CAD code.
- BlenderLLM: Qwen2.5-Coder-7B emitting Blender Python, trained on BlendNet (2K human-verified and 6K model-validated samples).
- The survey text retrieved gives no numeric results for these — [survey v2](https://arxiv.org/html/2505.08137v2)

**Text2CAD-Bench** (arXiv 2605.18430, 18 May 2026)
- 600 human-curated CadQuery tasks in four levels:
  - L1: primitives (200 tasks, 7.9 lines of code on average)
  - L2: 200 tasks, 19.1 lines on average
  - L3: sweeps, lofts, shells and freeform surfaces (100 tasks, 70.7 lines)
  - L4: real-world applications (100 tasks)
- Metrics: CD ×10³, IR and voxel IoU (256³). Up to 3 retries with error feedback — [arXiv](https://arxiv.org/html/2605.18430v1)
- Results with geometric prompts (CD / IR / IoU):

  | Model | L1 | L3 |
  |---|---|---|
  | GPT-5.2 | 44.31 / 11.1% / 0.59 | 93.46 / 68% / 0.23 |
  | Claude 4.5 Sonnet | 52.62 / 20.3% / 0.54 | 70.13 / 70% / 0.25 |

  [arXiv](https://arxiv.org/html/2605.18430v1)
- Invalidity climbs from about 15% at L1 to 70–90% at L3. The L2 → L3 step is the steepest drop — [arXiv](https://arxiv.org/html/2605.18430v1)
- Domain-specific fine-tuned models (Text2CAD, CADFusion, Text2CADQuery) score IoU 0.02–0.08 at every level: executable but geometrically wrong out of distribution — [arXiv](https://arxiv.org/html/2605.18430v1)
- On L4, executability, geometric similarity and feature-level understanding are largely independent; no model leads on all three — [arXiv](https://arxiv.org/html/2605.18430v1)

**P3D-Bench** (Nanjing Univ. / Envision, arXiv 2606.11152, 9 Jun 2026)
- Tasks: Text-to-3D (400), Image-to-3D multi-part (400) and Assembly-3D (203).
- Scored on validity, Geo (F-score, CD, normals, IoU), Topo (open edges, inverted normals, non-manifold edges), an MLLM judge, and per-part matching — [arXiv](https://arxiv.org/html/2606.11152v1)
- Thinking: "Think Max" over "Non-think" gives only +0.034 on average. The gain is larger on OpenSCAD and Three.js; four of five models *lost* CadQuery validity with more thinking — [arXiv](https://arxiv.org/html/2606.11152v1)
- Multi-turn visual self-refinement (up to 10 turns, showing the reference image, current code and multi-view renders):
  - Gemini 3.1 Pro on OpenSCAD: 0.715 → 0.745 (it used all 10 turns in 51% of runs).
  - GPT-5.5: 0.720 → 0.722 (it stopped after 1 turn in 62% of cases).
  - The authors conclude that feedback helps only when the model keeps revising — [arXiv](https://arxiv.org/html/2606.11152v1)

**ProCAD** ("Clarify Before You Draw", Yuan et al., arXiv 2602.03045, about Feb 2026)
- A clarifying agent asks about ambiguous specs before a CadQuery coding agent writes code.
- Reported against Claude Sonnet 4.5: mean CD −79.9%, invalidity 4.8% → 0.9%.
- Code is listed as forthcoming at github.com/BoYuanVisionary/Pro-CAD — [search abstract](https://arxiv.org/pdf/2602.03045); full text not parsed.

**neuralCAD-Edit** (multimodal editing: video, sketch or speech requests; 10 check-and-revise rounds), acceptance rate:
- Human expert baseline: 0.78
- GPT-5.2: 0.25
- Gemini 3 Pro: 0.10
- Claude Sonnet 4.5: 0.05
- [CAD agent primer](https://lehuili-cad-agent-intro.static.hf.space/index.html)

### Inferences
- In-distribution numbers from fine-tuned models (IoU 92%, CD 0.17e-3) say little about open-ended parts. Text2CAD-Bench shows these models collapse out of distribution. For an app built on Claude, prompt- and tool-level loops matter more than fine-tuning.
- The verifier is the weak link. VLM self-QA is about 65% accurate, so render-and-critique feedback should be anchored to measurable checks (bounding box, volume, silhouette numbers) wherever possible, not to free-form VLM opinion.
- Best-of-N with a cheap geometric score is the most robust gain in the literature (CAD-Recode). In an app this maps to compiling 2–4 variants of a hard part and keeping the one that best matches the target bounding box, silhouette or volume.
- Results improve in roughly this order of reliability: compile-error feedback > best-of-N with geometric selection > numeric geometric feedback > VLM visual critique > extra reasoning budget.

### Gaps
- No full numbers retrieved for Text2CAD (Khan et al., NeurIPS 2024), GenCAD, Img2CAD, FlexCAD, OpenECAD, CAD-MLLM, CAD-Llama, BlenderLLM, LLM4CAD or 3D-Premise. A secondhand claim says LLM4CAD found text-only input works best, but it is unverified.
- CADialogue: no sources found.
- The CAD-Recode code and dataset release was not verified (the paper says the dataset will be public).
- CAD-Assistant per-benchmark numbers and the ProCAD method details were not extracted (PDF not parsed).

---

## 2. Agentic CAD tools: Zoo, Onshape, MCP servers, GitHub agents, and how they verify

### Takeaway
Production agents converge on one loop: write code, execute in a real kernel, render, measure, validate, revise. They expose geometry queries (bounding box, volume, center of mass, feature detection, snapshots) as tools. The strongest evidence that tools matter comes from CADGenBench: build123d-mcp lifted the same model from 0.360 to 0.457 and its validity from 88% to 100%. Even so, functional benchmarks show agents still fail at interfaces and mechanisms.

### Cited Findings

**Zoo (formerly KittyCAD)**
- Text-to-CAD returns B-rep (STEP-importable) models through the ML-ephant REST API, with Python, TS, Go and Rust clients. Enterprise customers can fine-tune on their own data — [Zoo ML API](https://zoo.dev/machine-learning-api); [develop3d](https://develop3d.com/cad/zoo-ecosystem-lays-foundation-for-modern-hardware-design-toolkit/)
- The API includes KCL (Zoo's CAD language) code-completion, prompt-iteration and copilot websocket endpoints. The CLI has `zoo ml text-to-cad` and `zoo ml kcl` — [zoo ml CLI](https://zoo.dev/docs/cli/manual/zoo_ml)
- **Zookeeper agent** (announced 20 Feb 2026):
  - It researches, proposes constraints and parameters, and makes a design plan before it models.
  - Output is an inspectable feature tree with explicit constraints, parameters and references.
  - It has engine-level tools to inspect, snapshot and debug geometry.
  - The same tools are exposed through a Zoo-MCP server for other agents — [Digital Engineering 24/7](https://www.digitalengineering247.com/article/zoo-introduces-zookeeper-agent-for-cad-design/products); [Zoo docs](https://docs.zoo.dev/zookeeper)

**Onshape / PTC**
- AI Advisor gives in-app design guidance.
- FeatureScript generation through a FeatureScript MCP server (Onshape Labs early access) builds, tests, debugs and refines custom features from natural language. One report places availability in August 2026.
- ARC stresses that outputs still need engineering review — [ARC](https://www.arcweb.com/blog/ptc-launches-onshape-featurescript-mcp-server-ai-assisted-cad-automation); [develop3d](https://develop3d.com/cad/built-differently-onshapes-ai-advisor/); [Onshape blog](https://www.onshape.com/en/blog/ai-artificial-intelligence-cloud-native-cad-pdm-platform)

**build123d-mcp** (github.com/pzfreo/build123d-mcp, 115 stars, Apache-2.0)
- Tools:
  - `execute()` runs code in a persistent session.
  - `validate()` checks the solid before export.
  - `find_candidates(kind, qualifiers, stated_value)` locates holes and other features and checks them against the stated frame.
  - `interface_features()` finds flat faces that carry holes.
  - `edit_feature()` resizes a through hole, predicts the volume change, measures it, and keeps the edit only if the checks pass.
  - `compare(kind="shape")` verifies edited geometry.
- Also: PNG/SVG/DXF renders and 2D drawing previews; volume, area, bounding box, topology and center of mass; detection of holes, bosses, countersinks and hole patterns; printability checks; snapshots.
- CADGenBench (June 2026): it raised the same model from 0.360 to 0.457 and validity from 88% to 100% — [GitHub](https://github.com/pzfreo/build123d-mcp); [PyPI](https://pypi.org/project/build123d-mcp/0.3.80/)

**OpenSCAD MCP servers**
- quellant/openscad-mcp: `render_single` with camera presets, `render_perspectives` (standard views in parallel), `compare_renders` (before/after), export and validation — [GitHub](https://github.com/quellant/openscad-mcp)
- Simpler options: jkoets/OpenSCAD-MCP and fboldo/openscad-mcp-server (PNG previews and STL export) — [GitHub](https://github.com/jkoets/OpenSCAD-MCP); [listing](https://claudemarketplaces.com/mcp/fboldo/openscad-mcp-server)

**FreeCAD MCP**
- neka-nat/freecad-mcp lets Claude Desktop control FreeCAD. Trackers report about 879–940 stars and a last push on 29 Apr 2026 — [gittrend](https://gittrend.io/repo/neka-nat/freecad-mcp); [TypingMind](https://www.typingmind.com/mcp/freecad)

**CADGenBench** (Hugging Face, 2026)
- It turns engineering drawings into STEP files, plus an editing task, and accepts any toolchain.
- Scoring: a validity gate (well-formed, watertight B-rep), then
  `CAD Score = 0.4·shape (surface F1 + volume IoU) + 0.4·interface (fit in a fixture of pins and slots, via keep-in/keep-out volumes) + 0.2·topology (Betti numbers b0/b1/b2)` — [GitHub](https://github.com/huggingface/cadgenbench); [primer](https://lehuili-cad-agent-intro.static.hf.space/index.html)
- The reference baseline agent writes build123d (or CadQuery), renders the STEP with PyVista, reviews the renders and refines until the part is valid — [GitHub](https://github.com/huggingface/cadgenbench)
- Primer results (CAD Score):
  - GPT-5.6 Sol: 0.405
  - Claude Opus 5: 0.351
  - Qwen3.8-Max: 0.344
- Editing scores: Claude Opus 5 0.635, GPT-5.6 Sol 0.629. Agents often rebuilt the whole part instead of making the targeted edit, which introduced unintended changes — [primer](https://lehuili-cad-agent-intro.static.hf.space/index.html)
- Leaderboard snapshots differ: build123d-based agent first at 59.6% (Aug 2026) vs "Godela" first at 84.5% (Sep 2026). Each entry uses a different harness, so base models aren't directly comparable — [BenchLM](https://benchlm.ai/benchmarks/cadgenbenchgeneration)

**CAD-bench** (ICML 2026, functional CAD)
- 17 tasks, from basic solids up to threaded mating pairs and gear trains.
- Scored with dimensional and pose checks, reference-geometry gates, thread-profile analysis and Blender rigid-body simulation.
- Best standalone model: 59.9%. Agents build the right-angle gearbox in 96.9% of attempts but average only 4.0% on its functional score — [ICML](https://icml.cc/virtual/2026/77860)

**CadQueryEval** (Inspect AI port of the OpenSCAD CadEval, archived Sep 2026)
- 25 tasks. A task passes only if all binary checks pass: watertight, single component, bounding box within 1 mm, and volume within 2%. Chamfer and Hausdorff-95 distances are reported too — [GitHub](https://github.com/danwahl/cadqueryeval)
- Leaderboard (README, 91 models via OpenRouter, 1 epoch):
  - claude-opus-5.5, gpt-6-sol and two other frontier models: 100%
  - gpt-5.5: 76%
  - claude-opus-4.7: 60%
  - claude-3-haiku: 4% — [GitHub](https://github.com/danwahl/cadqueryeval)

### Inferences
- The app's current toolset (`look`, `compare` with silhouette numbers, `check_scene` interference, `check_skeleton`) already matches the leading pattern. The main things missing compared with build123d-mcp and CAD-bench:
  - B-rep feature queries (holes found with diameter and axis)
  - per-part validity gating (watertight and manifold)
  - mass properties
  - interface and fit checks against declared mating features
- CadQueryEval's pass rule (watertight + single component + bbox ±1 mm + volume ±2%) is cheap and could be an automatic per-part acceptance test whenever the agent states a target size.
- The CADGenBench editing finding suggests a diff check after every edit: compare before/after bounding boxes, volume and feature lists, and flag changes outside the requested region.

### Gaps
- No public numbers on Zoo Text-to-CAD accuracy or Onshape FeatureScript generation quality.
- Star counts for CadQuery-specific MCP servers were not found; the FreeCAD MCP counts come only from third-party trackers.
- No public data on how Zookeeper's "inspect/snapshot/debug" tools work internally.

---

## 3. Which code representation gives the best LLM results for mechanical parts

### Takeaway
The evidence is mixed but leans one way:
- **OpenSCAD has the highest validity** and comparable or better geometry scores with frontier models: 100% vs 91–94% valid in P3D-Bench, and about 3–4× fewer code errors than build123d in an informal test.
- **Python B-rep libraries (CadQuery, build123d)** beat raw command sequences and are more expressive (true fillets, shells, STEP export, feature queries). Their failures are mostly API hallucination and kernel errors.
- **No rigorous study compares FeatureScript.**

A hybrid fits the evidence: OpenSCAD for robust CSG, a B-rep kernel for fillets, shells and lofts, with execution feedback and API references to cut B-rep errors. The app's OpenSCAD + replicad split matches this.

### Cited Findings

**P3D-Bench (Jun 2026), Image-to-3D**

| Model | CadQuery Geo / Valid | OpenSCAD Geo / Valid |
|---|---|---|
| GPT-5.5 | 0.524 / 0.937 | 0.567 / 1.000 |
| Gemini 3.1 Pro | 0.507 / 0.911 | 0.569 / 1.000 |

- Assembly-3D Geo, OpenSCAD vs CadQuery: GPT-5.5 0.603 vs 0.570; Gemini 0.600 vs 0.532 — [arXiv](https://arxiv.org/html/2606.11152v1)
- The authors call OpenSCAD the strongest and most balanced format. CadQuery failures are mostly parameter errors and geometry-kernel failures, not parse errors.
- Three.js meshes do poorly on topology and parts, since they are not watertight and have no clean per-part solids. JSON is too limited for assemblies — [arXiv](https://arxiv.org/html/2606.11152v1)

**Text2CAD-Bench (May 2026)**
- CadQuery beats DeepCAD-style command sequences on both validity and accuracy; every model has higher invalidity with command sequences — [arXiv](https://arxiv.org/html/2605.18430v1)
- The authors chose CadQuery for LLM code fluency, method chaining and advanced features. They did not test OpenSCAD or build123d — [arXiv](https://arxiv.org/html/2605.18430v1)

**Informal benchmarks (blogs, not peer reviewed)**
- grandpacad (same harness and model, gemini-3.5-flash):
  - OpenSCAD: about 0.4 code errors per generation (10 errors across 23 models).
  - build123d: about 1.4–1.7 errors per generation (40 errors without help, 33 with a generated API reference).
  - CadQuery: "high"; up to half of early runs failed outright.
  - The dominant error is API hallucination: wrong method names or argument order, or calling methods on the wrong type (face, edge or wire). The author ships OpenSCAD as the default — [grandpacad](https://grandpacad.com/en/blog/openscad-vs-cadquery-vs-build123d)
- ModelRift (6 agents × 3 parts): OpenSCAD had fewer tool-raised errors (2 vs 5) but slightly more silent wrong geometry (5 vs 4). The sample is too small to separate tools from agent variance — [ModelRift](https://modelrift.com/blog/cadquery-vs-openscad/)

**Why papers pick CadQuery:** scripts execute directly, so validity can be checked; the modeling vocabulary is richer; and it fits existing LLMs well — [CAD-Coder NeurIPS](https://arxiv.org/html/2505.19713v3)

**Benchmark toolchains:** CADGenBench's baseline uses build123d or CadQuery, and the top August 2026 entry was build123d-based — [GitHub](https://github.com/huggingface/cadgenbench); [BenchLM](https://benchlm.ai/benchmarks/cadgenbenchgeneration)

### Inferences
- When validity on the first try matters (agents that don't iterate much), OpenSCAD wins. When the target needs exact B-rep features (fillets after booleans, shells, STEP export, hole queries), a Python or JS B-rep kernel is necessary, and its error rate is manageable with execution feedback plus an API cheat-sheet.
- replicad shares OpenCascade with CadQuery and build123d, so the same failure classes should apply: API hallucination and kernel failures in fillets and booleans. This is an inference, not measured for replicad.
- More reasoning budget hurt CadQuery validity in P3D-Bench. Verbose "clever" B-rep code may be riskier than simple code, which supports prompts that ask for simple, conservative feature sequences.

### Gaps
- No controlled benchmark of replicad, FeatureScript or KCL against OpenSCAD and CadQuery.
- No controlled study of OpenSCAD + BOSL2 against plain OpenSCAD.
- Whether the build123d and CadQuery error gap closes with frontier models (Claude Opus 5.x) is untested in published work; the CadQueryEval 100% scores suggest it may for simple parts.

---

## 4. Professional-quality techniques: feature order, fillets, constraints, design intent, assemblies

### Takeaway
Assembly-capable systems from 2026 (ArtiCAD, AssemCAD) agree on one design:
1. Declare the interfaces first: typed ports or connectors with local frames, and joints with motion type and limits.
2. Generate parts that carry those frames.
3. Let a deterministic solver or transform apply the mates, rather than letting the LLM compute placements.
4. Verify the interfaces against actual B-rep geometry.

Functional benchmarks show the remaining failures sit at interfaces, standards-like details (threads) and mechanisms, not overall shape.

### Cited Findings

**ArtiCAD** (arXiv 2604.10992, Apr 2026; training-free)
- Design, Generation, Assembly and Review agents. Parts are FreeCAD scripts.
- A connector is a named local frame with a semantic label. A joint pairs two connectors and gives the motion type and limits.
- The Assembly agent aligns connector pairs with FreeCAD's constraint solver; no LLM is involved.
- A router sends review feedback back to either the design stage or the code stage (cross-stage rollback), and a self-evolving experience store keeps past cases.
- URDF export.
- Ablation with Gemini-3-Flash on ArtiCAD-Bench: deciding connectors at design time vs predicting them late gives success 100% vs 89.2% and Motion 3.82 vs 3.16 — [alphaxiv](https://alphaxiv.org/abs/2604.10992)

**AssemCAD** (arXiv 2607.05123, Jul 2026)
- An "Assembly Specification" of typed parts, geometry-backed ports, executable mates and engineering axioms.
- Mates are applied with deterministic transformations, and interfaces are checked against B-rep evidence.
- Reusable parametric component factories are generated on demand.
- The authors report better assembly preservation and physical validity than code-centric baselines on AssemBench; numbers were not retrieved — [takara tldr](https://tldr.takara.ai/p/2607.05123); [catalyzex](https://www.catalyzex.com/paper/assemcad-production-ready-cad-assembly)

**Zookeeper**: it proposes constraints and parameters and writes a design plan before modeling, and its output is a feature tree with explicit constraints and references. This is design intent made explicit — [DE 24/7](https://www.digitalengineering247.com/article/zoo-introduces-zookeeper-agent-for-cad-design/products)

**Planning before code**
- CAD-Coder's chain-of-thought planning step halved mean Chamfer distance (17.34 → 6.54) — [arXiv](https://arxiv.org/html/2505.19713v3)
- ProCAD's clarify-first agent cut invalidity from 4.8% to 0.9% against Claude Sonnet 4.5 — [arXiv](https://arxiv.org/pdf/2602.03045)

**Where agents fail functionally (CAD-bench)**
- Agents still often fail on interfaces, standards-like details and mechanisms.
- The gearbox is built in 96.9% of attempts but scores only 4.0% functionally, because executable output is not the same as mechanically meaningful success — [ICML](https://icml.cc/virtual/2026/77860)

**Fillets**
- CAD-Coder (MIT) failed on fillets not seen in training — [review](https://www.themoonlight.io/en/review/cad-coder-an-open-source-vision-language-model-for-computer-aided-design-code-generation)
- P3D-Bench attributes CadQuery failures largely to geometry-kernel failures — [arXiv](https://arxiv.org/html/2606.11152v1)
- Text2CAD-Bench's L3 (sweeps, lofts, shells, freeform) is where invalidity reaches 70–90% — [arXiv](https://arxiv.org/html/2605.18430v1)

**Editing intent**: in CADGenBench editing, agents that rebuilt the whole part instead of making the targeted change kept interface and topology credit but earned zero edit-shape credit — [primer](https://lehuili-cad-agent-intro.static.hf.space/index.html)

**Safe, verified edits**: build123d-mcp's `edit_feature` keeps "protected" reference faces, predicts the volume change, checks it against the measured change, and refuses counterbores, spotfaces and countersinks — [GitHub](https://github.com/pzfreo/build123d-mcp)

### Inferences
- For the app's robots, connector frames per part could feed both assembly and `check_skeleton`: servo horn axis, mounting-hole pattern, shaft axis. Then mirror, attach and joint placement become deterministic transforms, not LLM arithmetic. This matches ArtiCAD's +10.8 points in success.
- Standard practice is consistent with these failure profiles but not directly measured in the sources:
  - base solid → booleans → holes → fillets and chamfers last
  - smaller-radius fallback when a fillet fails
  - fillet selected edges rather than all edges
  - conservative wall thickness for shells

  The app's own replicad recipe (fillets after booleans, edge finders, smaller-radius fallbacks) already encodes this.
- Threads, gear meshes and press fits are where agents fail functionally. Catalog parts (real fasteners and bearings, as the app already has) plus library modules (BOSL2 threading, gears) are safer than generated geometry.

### Gaps
- No paper found that measures fillet-failure rates or compares fillet strategies in LLM-generated B-rep code.
- No LLM study found on 2D sketch constraints (dimensional or geometric constraint solving) besides CAD-Assistant's autoconstraining task, whose numbers were not retrieved.
- AssemCAD and ArtiCAD numbers against CADCodeVerify-style baselines were not retrieved.

---

## 5. How systems check geometry against intent

### Takeaway
The best systems layer the checks:
1. Execution and validity gate: compiles; watertight, manifold B-rep.
2. Cheap numeric acceptance tests: bounding box ±1 mm, volume ±2%, component count, Betti numbers for holes and cavities.
3. Feature and interface checks: hole diameters and axes, mating fixtures, keep-in/keep-out volumes.
4. Cross-sections and multi-view renders compared to the reference.
5. VLM critique, which is useful but only about 65% accurate on its own questions.
6. For mechanisms, simulation.

### Cited Findings

**Unit-test style acceptance**
- CadQueryEval passes a part only if it is watertight, a single component, within 1 mm on bounding box and within 2% on volume — [GitHub](https://github.com/danwahl/cadqueryeval)
- CADGenBench gates on validity, then scores shape (surface F1 + volume IoU), interface fit (pins and slots in keep-in/keep-out volumes) and topology (Betti numbers b0 solids, b1 through-holes, b2 cavities) — [GitHub](https://github.com/huggingface/cadgenbench); [primer](https://lehuili-cad-agent-intro.static.hf.space/index.html)

**Mechanical function**
- CAD-bench uses dimension and pose checks, reference-geometry gates, thread-profile analysis and Blender rigid-body simulation — [ICML](https://icml.cc/virtual/2026/77860)

**Mesh topology**
- P3D-Bench Topo counts open edges, inverted normals and non-manifold edges; Part scores per-part matching on decomposed assemblies — [arXiv](https://arxiv.org/html/2606.11152v1)

**Cross-sections and step-wise checks**
- CAD-Assistant uses a 2D cross-section generator and checks the effect of each command on the geometry before choosing the next — [arXiv](https://arxiv.org/abs/2412.13810v3)

**Render-and-critique**
- CADCodeVerify: question generation, then 4 views, then Yes/No/Unclear answers, then feedback from failed questions. GPT-4 distance 0.137 → 0.127 against 3D-Premise; verifier accuracy 64.6–68.2% — [arXiv](https://arxiv.org/html/2410.05340v2)
- Query2CAD: a VQAScore threshold of 0.9 on the isometric render triggers caption feedback. Execution feedback in round 1 gave +19.6 points; rounds 2–3 gave +3.5 and 0 — [arXiv](https://arxiv.org/html/2406.00144v1)
- P3D-Bench: multi-view render feedback over 10 turns helps Gemini (+0.03) but not GPT-5.5, which stops early — [arXiv](https://arxiv.org/html/2606.11152v1)

**Measurement tools**
- build123d-mcp exposes volume, area, bounding box, topology, center of mass, hole and boss detection, validate-before-export, and shape compare — [GitHub](https://github.com/pzfreo/build123d-mcp)

**VLM judges**
- Text2CAD-Bench L4 uses GLM-4.6V over 8 multi-view renders. Human annotators agreed on the trend — [arXiv](https://arxiv.org/html/2605.18430v1)

**Selection by geometric score**
- CAD-Recode keeps the minimum-Chamfer candidate out of 10 — [ICCV](https://orbilu.uni.lu/bitstream/10993/67036/1/CADRecode_ICCV_2025.pdf)
- CAD-Coder uses Chamfer distance as an RL reward — [arXiv](https://arxiv.org/html/2505.19713v3)

### Inferences
Concrete additions for the app, ranked by expected value from the evidence:

1. **Per-part acceptance test** in `model_part`. The agent states the intended envelope, and optionally a volume and hole count. The tool returns pass/fail on bbox ±1 mm (or ±2%), watertight/manifold, component count, and b1 (through-hole count) vs the stated count. This mirrors CadQueryEval and CADGenBench, and costs almost nothing.
2. **Feature query tool** for replicad or OpenSCAD meshes: detect cylindrical holes (diameter, axis, position) and flat mounting faces, so the agent can check that "4× M3 on a 31 × 31 mm pattern" exists. This mirrors build123d-mcp's `find_candidates` and CADGenBench interface scoring. For meshes, a cylinder fit on triangle clusters, or tracking holes in the code, may stand in for B-rep queries.
3. **Section tool**: a 2D slice at a given height or plane, returned as an image plus outline dimensions, to check wall thickness, pockets and internal cavities that renders hide (CAD-Assistant).
4. **Edit diff guard**: after `update_parts` or a re-model, report bbox, volume and feature-count deltas, and flag unintended changes (CADGenBench editing finding).
5. **Best-of-N for hard parts**: compile 2–3 variants in the existing kernel pool (up to 3 processes) and keep the one closest to the target silhouette or bbox (CAD-Recode).
6. **Structured VLM verification**: before rendering, have the agent write 3–5 yes/no checks from the brief or feature inventory, then answer them against the `compare` renders, and fix only the failures (CADCodeVerify). Because the verifier is about 65% accurate, prefer numeric checks when one exists.
7. **Keep-revising pressure**: P3D-Bench shows models that stop after one turn gain nothing. The prompt or harness should require a minimum number of verify rounds, or a pass on the acceptance tests, before the agent declares done.
8. **Mechanism checks**: CAD-bench's rigid-body simulation of gear trains suggests that, for robots, sweeping each joint through its range and running `check_scene` interference at a few poses would catch collisions the zero pose hides. This is an inference; the app currently checks only the zero pose.

### Gaps
- No published ablation isolates cross-section feedback from render feedback.
- No study found measuring how much numeric acceptance tests (bbox, volume) in the generation loop improve final accuracy, as opposed to using them only for evaluation. build123d-mcp's 0.360 → 0.457 is the closest, and it bundles many tools.
- Reliable, quantified mass-property or center-of-mass checks for intent (balance, stability) in LLM CAD loops were not found in the sources.
