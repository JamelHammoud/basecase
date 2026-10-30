# Design to cost: making the agent pick affordable parts

> Audited 2026-10-25: several numbers here are corrected or withdrawn in [`citation_audit.md`](citation_audit.md), which takes precedence.

Research date: 2026-10-25. Scope: how open-source robots stay cheap, actuator and compute prices in late 2026, why LLM agents overspend, and how to put cost into the selection loop. Prices change often; treat them as of the date above. Items marked **[unverified]** were not confirmed from a primary source.

## Takeaway

The agent overspends for three reasons, two of them in our code:
1. **It never sees a price while choosing.** `find_parts` (`src/agent/agentCatalog.ts`) returns size, specs, mounting and torque, but no price, although `src/data/listPrices.ts` has list prices for most of the catalog. Cost first appears in `get_bom`, after the design is built around the parts.
2. **The budget isn't a check.** `src/utils/engineering*.ts` never reads it, and `bom.ts:328` sets `overBudget` from `pricedUsd` (checked and stale prices only), so a build priced entirely from list estimates never shows "(over budget)" in the Markdown BOM (`bomFormat.ts:89`). The text summary (`bomFormat.ts:164`) compares the estimate correctly. The `get_bom` tool description still says lines carry "no price recorded", though they now carry estimates.
3. **LLMs favour premium brands and fail at budget arithmetic.** With identical specs and prices, one preprint found the known brand picked in 670 of 670 trials ([2609.16304](https://arxiv.org/pdf/2609.16304); see also EMNLP 2024 [aclanthology 2024.emnlp-main.707](https://aclanthology.org/2024.emnlp-main.707)). GPT-4 solved 0.6% of TravelPlanner's budget-constrained plans unaided; with the LLM writing constraints for an SMT solver, 93.9% ([2404.11891](https://arxiv.org/abs/2404.11891)). A budget tracker injected into every step moves agents' cost/performance frontier ([2511.17006](https://arxiv.org/abs/2511.17006), abstract only).

The fix: show cost at selection time, run a running budget line on every edit, and move actuator sizing into a deterministic solver that returns the cheapest set that passes the torque rule.

## How open robots keep costs low

| Robot | Cost | What kept it cheap |
|---|---|---|
| SO-101 arm | ≈ $122 follower; $229.88 leader + follower | 6× STS3215 (≈ $13.89 on Alibaba); the leader uses gear-ratio versions of the same servo; ≈ $10 bus board; laptop compute ([repo](https://github.com/horndeer/SO-ARM101-LeRobot)) |
| Koch v1.1 (its predecessor) | $278 follower | Dynamixel XL430/XL330; SO-101 replaced it with STS3215 at about half the price ([repo](https://github.com/jess-moss/koch-v1-1)) |
| Open Duck Mini v2 | < $400 | STS3215 ×14, Pi Zero 2 W ([repo](https://github.com/apirrone/Open_Duck_Mini)) |
| Reachy Mini | $299 Lite / $449 Wireless | Lite drops the CM4, battery and Wi-Fi and runs from the user's computer ([blog](https://huggingface.co/blog/reachy-mini)) |
| XLeRobot | from $660 | ~90% printed, SO-101 arms, an IKEA cart, a power station, laptop compute ([repo](https://github.com/Vector-Wangel/XLeRobot)) |
| AhaRobot | $1,000 | SCARA-like arms so gravity doesn't load shoulder and elbow; belt slide instead of a lift joint; extrusion frame ([arXiv](https://arxiv.org/html/2503.10070v1)) |
| ToddlerBot | < $6,000, ~90% motors + Jetson | Per-joint sizing: XC330 on neck, waist, hip yaw; XM430 only at knee and ankle pitch; few screw types ([arXiv](https://arxiv.org/html/2502.00893)) |
| Berkeley Humanoid Lite | $4,312; actuators ≈ 82% | Printed cycloidal reducers on drone motors with a $19 ESC ([arXiv](https://arxiv.org/html/2504.17249)) |
| Petoi Bittle X V2 | $319 / $379 | Servo tier is the price lever |

Recurring patterns:
1. One actuator family: the cheapest one with position feedback.
2. Gear-ratio versions before a bigger servo.
3. Tethered (off-board) compute by default.
4. Lower the load before buying torque: SCARA layouts, belts, counterbalance, short links, low battery.
5. Reuse mass-market goods (carts, power stations, drone motors, ESCs).
6. Size each joint separately; the expensive actuator goes only where the check needs it.
7. Few fastener types.

## Actuator tiers (stall torque per dollar)

| Actuator | Stall | Price seen | N·m/$ |
|---|---|---|---|
| SG90 | 0.18 N·m | $2–6 | 0.03–0.09 (no feedback) |
| MG996R | 0.92–1.08 N·m | ≈ $15 | 0.07–0.12 (no feedback) |
| **STS3215 C018 (12 V)** | 2.94 N·m | $13.89–24 | **0.12–0.21** |
| STS3215 C001 (7.4 V) | ≈ 1.9 N·m | $21.99 | ≈ 0.09 |
| STS3250 (12 V) | ≈ 4.9 N·m | $74–115 | 0.04–0.07 |
| Dynamixel XL330-M288 | 0.52 N·m | $24 | 0.02 |
| Dynamixel XL430-W250 | 1.5 N·m | $45–50 | 0.03 |
| Dynamixel XM430-W210 | 3.0 N·m | $310 | 0.01 |
| Damiao DM-J4310-2EC | 7 peak / 3 rated N·m | $125–167 | 0.04–0.06 |

STS3215 C018 gives 5–20× the torque per dollar of Dynamixel; Dynamixel buys current control, reliability and documentation. QDD actuators are for joints above about 5 N·m. Dynamixel US prices are 2021–2024 list prices (robotis.us rate-limited the check) **[unverified current]**.

## Compute in October 2026

The RAM shortage turned compute from a small line into a budget killer: Pi 5 4 GB went $60 → $70 (Dec 2025) → $85 (Feb 2026) → +$25 (Apr 2026), about $110 at PiShop; Pi 5 8 GB $175; Pi 5 1 GB $45; Pi Zero 2 W unchanged at $15 ([The Register](https://www.theregister.com/2026/02/02/raspberry_pi_ram_shortage_price_hike/)). Jetson Orin Nano Super $249 → $399 in July 2026 ([CNX](https://www.cnx-software.com/2026/07/22/nvidia-increases-the-price-of-jetson-modules-and-devkits-by-up-to-101/)). Cheapest in order: tethered laptop, Pi Zero 2 W, ESP32-class **[price unverified]**, Pi 5 1 GB. Check `listPrices.ts` against these.

## Methods

- **Value engineering** (Miles at GE; FAST diagrams): value = function / cost; question every line's function.
- **Catalog selection as optimization:** constraint programming with Pareto fronts for a $1k quadcopter over catalogs of up to 100k parts per type ([Wilhelm & Napp](https://arxiv.org/html/2505.11624v2)); joint motor and gearbox selection per arm joint (Mechatronics 21(3), 2011). Basecase's catalog is small (tens of actuators, a few batteries, regulators and boards), so exhaustive search with pruning is enough; no solver dependency.
- **Budget-tiered agent evals:** EcoAgent-Bench ([2608.05519](https://arxiv.org/html/2608.05519v1)) reports 3.9–24.0% strict success under budgets **[secondary]**. No LLM paper on cost-aware robot BOM selection was found.

## Proposal

1. **Prices in `find_parts`.** Each component line gets "≈ $23.99 (Seeed, 2026-10-17)" from `listPrices`, or the user's checked price; actuators also get N·m/$ and grams. Sort each group cheapest-first among parts with the same function, and mark the cheapest feedback actuator. When a budget is set, print "Budget $800; this scene ≈ $512 so far". Keep the rule that the agent never states a price the tools didn't give.
2. **Running budget line** at the end of every `add_parts`, `update_parts` and supply change once a budget is set: `BOM ≈ $412 of $800 (actuators $286)`. When a placed part costs more than twice the cheapest part of the same class that passes the same spec, add one line naming it.
3. **`size_actuators` solver.** Inputs: proposed or declared joints with their links (block-out masses are enough), battery or "any", one bus. For each joint compute the load with the existing torque model (holding across the range and single-leg stance); enumerate (bus protocol × supply voltage) families, which couple joints through one battery and regulator; per joint pick the cheapest actuator under the 1/5-stall pass rule and voltage range; re-run with the new actuator masses (2–3 fixed-point iterations); total = actuators + battery + regulator + bus adapter. Return the cheapest family and, where nothing passes, the geometry changes that would make a cheaper part pass:
   ```
   Cheapest passing set: $287 (STS3215 C018 ×18, 3S 2200, D24V50F5).
   Knee pitch: needs 0.52 N·m; STS3215 C018 (0.59 limit) $23.99. XM430 would be $310.
   Hip pitch: needs 0.71 N·m; no STS3215 passes. Options: STS3250 ($74–115), shorten the thigh 12 mm (−0.13 N·m), or lower the battery 30 mm.
   ```
   This replaces the prompt's "Torque budget before modeling" arithmetic and its hard-coded power pairing.
4. **Budget as a check row** in `verify_design`: FAIL over budget on the estimate, WARN above 90% or when more than 20% of lines have no price. Fix `bom.ts:328` to compare `estimatedUsd`. `get_bom` appends the biggest lines with cheaper passing alternatives ("compute $110 (22%): tethered or Pi Zero 2 W ($15) passes").
5. **Prompt:** a budget plan before modeling (published BOMs put actuators at 50–90%; a starting split of actuators ≤ 60%, compute ≤ 15%, power 10%); tethered compute unless the brief says autonomous; one actuator family; gear-ratio versions before bigger servos; lower the load before buying torque; never choose a part for its brand.

## Evals

- **Selection-only tasks** (seconds each, no geometry): a mass distribution, joint list, voltage and budget; ground truth from the exhaustive solver. Score: feasible, and cost / optimal cost.
- **Design-with-budget tasks** at tight, medium and loose budgets: under-budget rate on the estimate; **cost regret** = (agent BOM − `size_actuators` minimum on the agent's own final geometry) / minimum; **premium-pick rate** = share of catalog parts where a cheaper part of the same class passes the same check; all checks still pass.
- Unit-test `size_actuators` on ToddlerBot-like and Open Duck-like rigs built in code: it should put the big actuators only at knee and ankle pitch.
