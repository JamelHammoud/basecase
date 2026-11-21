---
title: Compare purchasing in Study
date: 2026-11-20
collection: build-and-print
type: task
keywords:
  - supplier offers
  - actuator alternatives
  - component arrival
  - study_design
related:
  - study-design-options
  - compare-supplier-offers
covers:
  - src/study/sourcing.ts
  - src/study/sourcingRecord.ts
  - src/workspace/studySourcingApply.ts
  - src/components/simulate/StudySourcingField.tsx
  - src/components/simulate/StudyPurchasing.tsx
  - src/components/simulate/StudyPurchasingDetails.tsx
hub_the_design_agent: |
  - Ask it to [compare purchasing in Study](/help/compare-purchasing-in-study) against a component arrival date, destination and robot quantity.
---

You can compare dated supplier evidence for robot alternatives alongside their engineering checks and optional Case results.

1. Press [[⌘K]] and choose **Study**.
2. In **Study**, select the design choices and their alternatives.
3. Turn on **Purchasing**.
4. In **Destination**, enter the destination used by your supplier quotes.
5. In **Required arrival date**, enter when the components must arrive.
6. In **Quantity**, enter how many robots you need.

![Study configured with shoulder actuator alternatives and purchasing requirements](/help/compare-purchasing-in-study/configure.png)

7. Click **Run Study**.
8. Click a design to inspect its contributing bill of materials, quote sources and purchasing reasons.

![A shoulder alternative with components arriving after the required date](/help/compare-purchasing-in-study/late.png)

![An alternative with complete purchasing evidence and a quoted component arrival](/help/compare-purchasing-in-study/on-time.png)

9. In the selected design, click **Supplier Offers** to inspect or edit the contributing offers.

![The existing supplier offer editor opened from a Study design](/help/compare-purchasing-in-study/offers.png)

In the editor, you use the selected design’s bill of materials and saved arrival requirements. See [Compare supplier offers](/help/compare-supplier-offers) for details on confirming exact matches and packaging. After you edit offers, run the Study again before applying a design.

For each comparison, you save its requirements, evaluation time, purchasing evidence and results with the scene. If you reopen it, you see that historical comparison. To apply a design, you must pass a check of current purchasing inputs. You can’t apply it if the evidence has changed or expired since the comparison, or if the scene changed during preparation.

![Reopened Study evidence with Apply refused after a supplier offer changed](/help/compare-purchasing-in-study/historical.png)

With Quantity, you multiply demand before subtracting available owned stock. You can’t use stock allocated to another build. Pack quantities and price breaks apply to the remaining demand. You see separate totals for each currency.

Purchasing evidence complete means you have complete evidence for component purchasing. You still need to confirm mounting compatibility, successful manufacture and Ready to build. A design can have complete purchasing evidence and still fail Checks or its Case. The quoted component arrival date excludes printing, assembly and completed-robot delivery.

To apply a complete design with Undo and Redo, see [Study design options](/help/study-design-options).
