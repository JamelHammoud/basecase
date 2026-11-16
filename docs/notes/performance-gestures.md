# Gesture recognition performance

Implementation: [Gesture recognition](../guide/cameras.md#performance-gesture-recognition). Shared requirements: [Performance](../guide/performance.md).

## Teaching thresholds share bidirectional gesture distances

`gestureThreshold.test.ts` compares exact thresholds against full dynamic-programming tables across 120 generated example sets, missing landmarks, empty examples, frozen inputs and later edits. With three 30-frame examples, landmark-distance calls fall from 70,200 to 35,100. With three 45-frame examples, they fall from 157,950 to 78,975. These are operation counts without timing assertions or a claim about complete recognition time.

## Gesture smoothing reads windows directly

`gestureSmoothing.test.ts` compares exact outputs across 2,200 generated cases and checks reversal counts around all three amplitude thresholds. Its 300- and 600-sample fixtures reduce temporary window arrays from 600 and 1,200 to zero. These are operation counts, without timing assertions or a claim about complete recognition time.

## Head gestures share prepared angles

`gestureHead.test.ts` compares both detectors against the previous calculation across nods, head shakes, turned-body waves and walking, checks nonfinite head observations and rejected shoulders, and preserves input landmarks. Its 300- and 600-frame fixtures reduce angle calculations from 49,836 and 104,968 to 600 and 1,200. These are operation counts, without a timing assertion or a claim about total recognition speed.
