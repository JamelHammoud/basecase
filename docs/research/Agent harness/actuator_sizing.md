# Sizing leg actuators: what margins real small walkers run

Research date: 2026-10-25. Robot descriptions were downloaded and parsed in `scratch/agent-harness-py/`; nothing is in the repo. Source tags: **est.** our estimate, **unverified** not confirmed from a primary source.

## The finding

- Robots that walk well carry their knees at about **0.2–0.55 of datasheet stall** in single stance at their working crouch.
- That is **0.8–2.7× the vendor's rated or continuous torque**.
- None of them meets the 1/5-of-stall rule at the knee, including ROBOTIS's own OP3 and Darwin-OP.
- The 1/5 figure is ROBOTIS's estimate of *continuous* torque ("Continuous Torque = Stall Torque × 0.20"). So it belongs in a heat (RMS) check, not in a check on single-stance load.

Single-stance knee torque is estimated as m·g·L_shank·sin(θ/2), with the whole mass over the stance foot and quasi-static conditions. Working crouch is the robot's own keyframe or walking parameters.

| Robot | Mass | Shank | Knee actuator | Stall | Rated or continuous | Working crouch: τ, and ÷ stall | Walks? |
|---|---|---|---|---|---|---|---|
| ToddlerBot | 3.4 kg | 110 mm | XM430-W210 | 3.0 N·m (bench: 1.94) | 0.6 (est.) | 21.8°: 0.69 N·m, 0.23 (0.36 of the bench value) | Yes; a 19-min streak ended by motor heat |
| Open Duck Mini v2 | 2.06 kg | 78.7 mm | STS3215 C001 | 1.91 N·m at 7.4 V | 0.49 | **78°: 1.01 N·m, 0.53** (2.05× rated) | Yes (RL), many builds |
| ROBOTIS OP3 | 3.5 kg | 110 mm | XM430-W350 | 3.8 N·m at 11.1 V | 0.76 (est.) | about 66° (est.): 2.06 N·m, 0.54 | Yes, commercial |
| Darwin-OP | 2.9 kg (unverified) | 93 mm | MX-28 | 2.3 N·m at 11.1 V | 0.5 (est.) | about 54° (est.): 1.20 N·m, 0.48 | Yes, long-time RoboCup platform |
| NUgus | 7.65 kg | 200 mm | XH540-W270 | 12.9 N·m | 2.6 (est.) | about 45–50° (est.): about 6.2 N·m, 0.48 | Yes, RoboCup |
| Wolfgang-OP | 7.1 kg | about 170 mm | XH540 + parallel knee spring | 12.9 N·m | 2.6 (est.) | 40°: 4.05 N·m, 0.31 before the spring's help | Yes |
| Berkeley Humanoid Lite | 16 kg | 160 mm | 6512 cycloidal | about 20 N·m | — | Paper: walking used about 30% of the limit | Yes |
| Disney BDX | 15.4 kg | about 170 mm (est.) | A1-class | 34 N·m | — | about 69° (est.): 0.43 | Yes |
| **Ribbit** | 3.44 kg | 160 mm | STS3250 | 4.9 N·m at 12 V | 1.57 | 40°: **about 1.9 N·m (2 × MuJoCo's 0.98 on two legs; hand estimate 1.85), 0.39** | Not built |

Supporting facts:
- **Real servos deliver well under datasheet stall.** ToddlerBot's bench system identification measured 0.61–0.77 of stall across five Dynamixel models. Treat about 0.7 × stall as the usable limit.
- **ToddlerBot's own sizing used almost no margin.** Its estimated peaks are 78% of stall at the knee, 89% at the ankle and 98% at hip pitch, at a 70% duty cycle.
- **Feetech firmware unloads a sustained overload.** The STS3215 translated datasheet says protection triggers when the servo is blocked above 80% of locked-rotor torque for 2 s, and that both are configurable ([datasheet](https://core-electronics.com.au/attachments/uploads/sts3215-smart-servo-datasheet-translated.pdf)). The 20% holding torque afterwards comes from the community memory-map wiki and retailer pages. Defaults: overload threshold 80%, protection after 2 s, holding torque then drops to 20%, temperature limit 70 °C. So holding more than about 80% for over 2 s collapses the joint.
- **Heat is the recurring limit.** It ended ToddlerBot's endurance run, Bioloid knees reached 47–55 °C in a 2 m walk, and NimbRo-OP2X needed fans on its knees.
- **Gear stripping** shows up only as anecdotes: SO-101 arms stripped at stalls. No Feetech gear-train rating is published.

## A rule for the check and the solver

Compute stall at the battery's **nominal** voltage. Rated is the vendor's continuous figure, else 0.25 × stall. Report the worst of three results per leg joint:

| Result | Measure | Pass | Warn | Fail | Why |
|---|---|---|---|---|---|
| **Stance** | Steady single-stance τ at the gait's crouch (never less than 30°) ÷ stall | ≤ 0.40 | ≤ 0.60 | > 0.60 | Walkers sit at 0.22–0.54 and none above 0.6. Usable torque is about 0.7 × stall, and Feetech unloads at 80% |
| **Heat** | τ_RMS over ≥ 10 gait cycles in sim (or 0.67 × τ_stance) ÷ rated; plus standing τ (half the single-stance τ) ≤ rated | ≤ 1.0 | ≤ 1.6 | > 1.6 | Duck, OP3, Darwin, NUgus and ToddlerBot land in Warn (1.1–1.45), consistent with their known session limits; nothing that walks lands in Fail |
| **Peak** | 99th percentile of sim torque (20–30 ms average) over gait and shoves ÷ stall | ≤ 0.8 | ≤ 1.0 | > 1.0 for more than 50 ms, **or the robot falls with the sim's force limit set to 0.7 × stall** | The derated sim test matches measured servo limits |

**Ribbit under this rule (estimate):**
- **Stance:** 0.39 at 12 V, a Pass at the edge. On a 3S pack at 11.1 V nominal it's about 0.42, a Warn.
- **Heat:** about 0.81 of rated, a Pass. Standing is 0.62 of rated, also a Pass.
- **Peak:** landings at 2–4× steady could reach 0.8–1.5 × stall. The derated sim run decides.

**Consequences for the roadmap:**
- Item 0.8 replaces the "1/5 of stall, Warn ≤ rated" rule with these three results.
- `size_actuators` (2.1) sizes for Pass on Stance and Heat, and leaves Peak to the simulation.
- The rule also needs the actuator data in 2.0: stall and rated torque per voltage.

**The weakest numbers here:**
- the OP3, Darwin and NUgus crouch angles, read from their walking parameters;
- the BDX leg split;
- the Bioloid and KHR-3HV dimensions;
- Open Duck's sim force limit of 3.35 N·m, above its own datasheet stall;
- the 0.67 RMS factor, which comes from a gait-phase model, not a measurement.

## Sources

- ToddlerBot: [paper](https://arxiv.org/html/2502.00893), [repo](https://github.com/hshi74/toddlerbot).
- Open Duck Mini v2: [URDF](https://github.com/apirrone/Open_Duck_Mini/tree/v2/mini_bdx/robots/open_duck_mini_v2), [Playground](https://github.com/apirrone/Open_Duck_Playground).
- Berkeley Humanoid Lite: [paper](https://arxiv.org/html/2504.17249).
- Berkeley Humanoid: [paper](https://arxiv.org/html/2407.21781).
- ROBOTIS: [OP3](https://emanual.robotis.com/docs/en/platform/op3/introduction/), [XM430-W350](https://emanual.robotis.com/docs/en/dxl/x/xm430-w350/), [XL-320 (the 1/5 rule)](https://emanual.robotis.com/docs/en/dxl/x/xl320/), [selection guide](https://emanual.robotis.com/docs/en/reference/dxl-selection-guide/).
- RoboCup team sheets: [Bit-Bots (Wolfgang)](https://humanoid.robocup.org/wp-content/uploads/2024-bitbots-specs.pdf), [NUbots (NUgus)](https://humanoid.robocup.org/wp-content/uploads/2024-nubots-specs.pdf).
- NimbRo-OP2X: [arXiv 1810.08395](https://arxiv.org/abs/1810.08395).
- Disney BDX: [arXiv 2501.05204](https://arxiv.org/html/2501.05204).
- Feetech memory map: [community wiki](https://aifitlab-wiki.super.site/feetech-servo-motor-docs/feetech-sts-servo-memory-table-analysis).
- Actuator sizing by thermal duty: [humanoid.guide](https://humanoid.guide/?p=17008), [De et al. 2011](https://repository.upenn.edu/ese_papers/611/).
