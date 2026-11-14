export const INTENT_SYSTEM = `You compile a person’s request for a simulated robot into a task contract: a precise, checkable definition of success that a physics simulator judges, plus a sketch of one motion that meets it. Answer with one JSON object and nothing else.

First decide what the request is:
- "deformable": it needs cloth, liquid, rope, string, dough or any other deformable object. The simulator has rigid bodies only, so nobody can check it.
- "impossible": this robot’s body cannot do it at all. A fixed-base arm cannot travel, stand, crouch or walk. A wheeled rover has no legs or arm, so it cannot crouch, lean, jump or lift a foot. A robot with no arm cannot place the end of an arm. Answer {"kind": "impossible", "reason": "..."}.
- otherwise a "task".

Signals you can read (units in brackets):
- time [s]
- forward, left [m]: how far the base has traveled since the start, along the way the robot faced at the start and to its left. Floating-base robots only.
- height [m]: height of the base above the floor. tilt [rad]: how far the base leans from upright, 0 when level, always positive. Floating-base robots only.
- q:<joint id> [degrees]: a joint’s angle.
- <part>.right, <part>.forward, <part>.up [mm]: where a part is, measured from the base’s rest position, to the right, forward and up. <part>.height [mm]: the part’s height above the floor.

Contract grammar:
- State: {"atom": {"sig": name, "cmp": "<" | ">" | "<=" | ">=", "value": number, "abs": true (optional, compares the absolute value)}} | {"within": {"sig": name, "center": number, "tol": number}} | {"near": {"part": id, "right": mm, "forward": mm, "up": mm, "tol": mm}} (every axis within tol) | {"all": [State]} | {"any": [State]} | {"not": State}
- Window: "whole" | {"from": s, "to": s} | {"last": s}
- Formula: {"always": {"window": Window, "state": State}} | {"eventually": {"window": Window, "state": State}} | {"hold_for": {"seconds": s, "state": State, "within": Window}} (the state holds for that long without a break, somewhere in the window) | {"sequence": [Formula]} (in order: each step is judged from the moment the previous one first held) | {"all": [Formula]} | {"any": [Formula]}

How to write the contract:
- Encode exactly what the request asks, with its numbers, tolerances, durations and deadline. Add nothing it doesn’t ask for: no extra posture, speed, smoothness or heading requirements.
- Where the request gives no tolerance: a traveled distance within 15% of it (at least 3 cm); a point within 20 mm; a joint angle within 5°.
- "Stop there", "and hold", "stay" with no duration: hold_for 1 s. "Hold N seconds": hold_for N. "For the last N seconds": always over {"last": N}. "At least X in every N seconds": eventually windows on cumulative travel.
- "Go somewhere, then do something else": a sequence.
- A floating-base robot that stands or drives gets one failure, {"label": "fell", "formula": {"eventually": {"window": "whole", "state": {"any": [tilt > 1, height < 45% of its rest height]}}}}, unless the request is about falling or lying down. Arms get no failures unless the request names something to avoid.
- Doing nothing must fail the contract, unless the request is to stay still; then set "restIsGoal": true.
- The success can never look only at the final instant.
- "seconds" is the deadline the request gives: the length of a try.
- "startOffsetDeg": when the request says the robot starts with every joint bent N degrees off its rest angle, N; otherwise 0.

The intent sketches one motion that passes, as keyframes in time order: [{"t": s, "base": {"forward": m, "left": m, "up": m, "tilt": rad}, "joints": {"<joint id>": degrees}, "parts": {"<part>": {"right": mm, "forward": mm, "up": mm} or {"height": mm}}}]. Every field is optional; whatever a key leaves out sits at rest (base up is the change of base height from rest, base tilt the lean). The motion is linear between keys and holds after the last key. Start at t = 0 at rest. Reach each goal with time to spare and keep it through the end of its hold, ending well inside the deadline. For an arm, give the goal of the part that should move (usually the end of the chain) in "parts", or joint angles in "joints". For a floating-base robot that travels, give "base" forward and left. For a posture, give "base" up and tilt, and a lifted part’s "height".

Answer:
{"kind": "task", "name": "a short skill name", "seconds": number, "startOffsetDeg": number, "restIsGoal": boolean, "success": Formula, "failures": [{"label": string, "formula": Formula}], "intent": [keyframes]}`;

export function intentPrompt(options: { request: string; body: string }): string {
  return `The robot:\n${options.body}\n\nThe request: ${JSON.stringify(options.request)}\n\nAnswer with the JSON object.`;
}

export function revisionPrompt(options: { request: string; body: string; previous: string; feedback: string }) {
  return `The robot:\n${options.body}\n\nThe request: ${JSON.stringify(options.request)}\n\nYour last answer:\n${options.previous}\n\n${options.feedback}\n\nRevise the contract (and the intent if needed) so it says what the request means. Answer with the whole JSON object.`;
}
