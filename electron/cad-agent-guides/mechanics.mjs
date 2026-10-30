export const servos = {
  name: 'servos',
  use: 'servo joints, brackets and torque',
  text: `
- A servo joint holds its link on both sides: a horn on one side, an idler or bearing on the
  other, or servo_u_bracket bolted to both horns (STS3215: 4 × M3 on a Ø14 bolt circle per
  horn). find_recipes "servo joint" has proven brackets with ports.
- The case sits in servo_pocket(model, clearance = 0.25), closed by a screwed clamp or cover,
  with room for the screws, the horn screws' driver and the cable.
- Joint axes come from the servo's real output (its port), never from the case centre.
- Size before you model: size_actuators gives, per joint, the cheapest servo that passes and one
  tier up. verify_design reports leg joints as Stance (single-stance load at the walking crouch ÷
  stall: Pass ≤ 0.4, Fail above 0.6), Heat (RMS ÷ rated: Pass ≤ 1.0, Fail above 1.6) and Peak
  (simulated with a trained policy). Lower the load (shorter link, battery lower, feet under the
  hips) before buying torque.
- Power pairs with the servo version: 12 V servos (component:feetech-sts3215|c018, 4–14 V) on a
  3S pack; never a 7.4 V STS3215 (C001) on 2S, since 8.4 V charged is over its maximum.
- Servos run at 60–70 °C: anything holding or touching one is petg or asa, never pla.
- Cables: a 6 × 4 mm channel near each joint axis for the lead; no more than ~3 loaded servos
  per daisy chain.`,
};

export const fasteners = {
  name: 'fasteners',
  use: 'screws, inserts and nuts',
  text: `
- fasten places a screw and what it threads into: { size: "M3", through: [part ids, head side
  first], into: "insert" | "nut" | "<part id>:<port>", at, from }. It picks the stock length from the grip and the
  engagement (at least 1.5 × the diameter in plastic, or the insert's length), places the screw,
  insert or nut, cuts every hole and checks the driver's path. Never place a screw by hand.
- Every screw goes into something that holds it: a heat-set insert (≥ 1.6 mm wall around it), a
  nut in a trap, or a catalog part's tapped hole. Every hole has its screw.
- Screws into catalog parts go through their ports (find_parts lists them): horn hole circles,
  case screws, board holes.
- One drive side per subassembly, 1–2 screw sizes (M3 structure, M2 or M2.5 boards), inserts
  along print Z.
- A screw head needs a straight, open line out of the assembly at the step it goes in, wide
  enough for a driver. check_assembly finds the order and says "drive before installing X" when
  it matters.`,
};

export const electronics = {
  name: 'electronics',
  use: 'battery bays, boards, regulators and wiring',
  text: `
- Real parts only: compute, camera, IMU, bus adapter, regulator (find_parts "power") and the
  battery as a Power pack or a holder with its cells.
- The battery goes in a bay with a hatch reachable from outside, never inside a structural
  clamshell; the hatch opens without removing a joint or a structural part. find_recipes
  "battery bay" has a proven one.
- Boards sit on standoffs on their real hole pattern (the board's ports), on a tray reachable
  from one cover. Leave connector access and a cable path out.
- Everything is held by something you can see: screws, a clamp or a captured lip. A strap or
  tape written only in notes counts as unfastened.`,
};
