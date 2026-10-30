const INC = 'include <robotics.scad>\n';
const MECH = 'include <robotics.scad>\ninclude <mechanisms.scad>\n';
const SWEEP = (angle) =>
  `${INC}intersection() { zrot(${angle}) servo_u_link($ports = false); servo_cradle(part = "both", $ports = false); }`;

export const MODULE_RECIPES = [
  {
    name: 'servo_cradle',
    use: 'Parent-side STS3215 / STS3250 holder: a frame around the case with a far-end bridge, horn-end tabs, a cable slot and a strap held by 2 × M3 into inserts. Fuse your link to its far end.',
    tags: 'servo sts3215 sts3250 feetech joint bracket holder mount cradle pocket parent link actuator arm leg',
    params: 's=STS3215 (use it for the STS3250 too: same outline), wall=3, clr=0.25, part="frame"|"strap"|"both", m=3',
    ports:
      'output (servo output at the horn face), horn and idler (hole_circle Ø14), mount (far-end face, where a link fuses on), strap_boss_i / strap_screw_i',
    notes:
      'servo() frame: output axis = Z through the origin, case top z = 0, case toward -X. Keep link material beyond x = SERVO_CRADLE_CLEAR_X (-24): with servo_u_link the joint turns ±110° clear. Drop the servo in horn end first, under the tabs, then fit the strap (M3 × 8).',
    code: `${INC}servo_cradle(STS3215);`,
    expect: { ports: ['output', 'horn', 'idler', 'mount', 'strap_boss_0'] },
    checks: [
      {
        why: 'the servo fits the cradle',
        code: `${INC}intersection() { servo_cradle(part = "both", $ports = false); servo(STS3215); }`,
        empty: true,
      },
    ],
  },
  {
    name: 'servo_u_link',
    use: 'Child-side STS3215 / STS3250 link held on both horns (4 × M3 × 6 per horn) with a web at reach; one piece, or split into horn and idler halves joined by 2 × M3 × 16 into inserts.',
    tags: 'servo sts3215 sts3250 joint bracket u-bracket horn idler link child output yoke dual shaft arm leg',
    params:
      's=STS3215, wall=3, reach=28 (axis to web, ≥ 18), web=8, part="link"|"horn"|"idler", mount=true (4 × M3 inserts on the web face), m=3',
    ports:
      'horn (hole_circle Ø14 on the output horn), idler, axis (bore), web (face), mount_i (inserts on the web face), web_boss_i / web_screw_i (split halves)',
    notes:
      'Same frame as servo_cradle, so model it at the same pose as the servo. Use the split halves when the cradle side blocks a one-piece link from sliding on along -X.',
    code: `${INC}servo_u_link(STS3215, reach = 28, part = "horn");`,
    expect: { ports: ['horn', 'axis', 'web', 'mount_0', 'web_boss_0'] },
    checks: [
      {
        why: 'the link only touches the horns',
        code: `${INC}intersection() { servo_u_link($ports = false); servo(STS3215); }`,
        volumeBelow: 1,
      },
      { why: 'turns +110° clear of the cradle', code: SWEEP(110), empty: true },
      { why: 'turns -110° clear of the cradle', code: SWEEP(-110), empty: true },
      { why: 'the idler half compiles', code: `${INC}servo_u_link(part = "idler");`, ports: ['idler', 'web_screw_0'] },
    ],
  },
  {
    name: 'battery_bay',
    use: 'Battery bay outside the frame with a hatch: hangs from a flange (4 × M3 from below into the frame), hatch with a hook tongue and one M3 into an insert, cable slot into the body. Swapping the pack removes nothing structural.',
    tags: 'battery bay hatch door pack lipo 3s 2s compartment power service swap serviceable cover',
    params:
      'pack=PACK_3S_2200 ([105,33,21]; PACK_2S_2200 = [87,33,18]), tol=[5,2,2] (pack size tolerance), wall=3, part="bay"|"hatch"|"both", m=3, flange=9, hatch=2.4',
    ports:
      'mount (face), mount_i (screws from below into the frame), opening (face), cable (bore Ø10), hatch_boss, hatch_screw',
    notes:
      'Origin: the mount face; the bay hangs down -Z. Print the bay mount-face down and the hatch flat. Hatch screw M3 × 8.',
    code: `${INC}battery_bay(PACK_3S_2200, part = "bay");`,
    expect: { ports: ['mount', 'mount_0', 'opening', 'cable', 'hatch_boss'] },
    checks: [
      {
        why: 'the hatch fits the bay',
        code: `${INC}intersection() { battery_bay($ports = false); battery_bay(part = "hatch", $ports = false); }`,
        empty: true,
      },
      { why: 'the hatch compiles', code: `${INC}battery_bay(part = "hatch");`, ports: ['hatch_screw'] },
    ],
  },
  {
    name: 'pi5_tray',
    use: 'Raspberry Pi 5 tray: standoffs with M2.5 inserts on the board’s real 58 × 49 hole pattern, vent slots under the SoC, 4 × M3 at the ends outside the board.',
    tags: 'raspberry pi 5 pi5 board computer sbc tray mount standoffs electronics pcb',
    params: 'standoff=6, plate=2.5, margin=4, ears=10, m=2.5, mount_m=3',
    ports: 'board (face under the PCB), hole_i (M2.5 insert bosses), mount_i (M3 screws into the frame)',
    notes: 'PI5_HOLES lists the hole centers from the board center. Board screws: M2.5 × 6.',
    code: `${INC}pi5_tray(standoff = 6);`,
    expect: { ports: ['board', 'hole_0', 'hole_3', 'mount_0'] },
  },
  {
    name: 'gear_pair',
    use: 'Printable spur gear pair (BOSL2 gears, backlash 0.1, automatic profile shift), phased to mesh; gear 1 can carry the STS3215 horn pattern.',
    tags: 'gear gears spur pinion reduction gearbox transmission mesh teeth module drive servo',
    params: 't1=12, t2=36, mod=1.5, thick=6, bore1=5, bore2=8, part="both"|"gear1"|"gear2", backlash=0.1, horn1=false',
    ports: 'axis_1, axis_2 (bores; axis_1 is a hole_circle Ø14 with horn1)',
    notes: 'Needs include <mechanisms.scad>. gear_pair_dist(t1, t2, mod) is the center distance.',
    code: `${MECH}gear_pair(16, 40, mod = 1.5, part = "gear1", horn1 = true);`,
    expect: { ports: ['axis_1'] },
    checks: [
      {
        why: 'even pair meshes without overlap',
        code: `${MECH}intersection() { gear_pair(12, 36, part = "gear1", $ports = false); gear_pair(12, 36, part = "gear2", $ports = false); }`,
        empty: true,
      },
      {
        why: 'odd pair meshes without overlap',
        code: `${MECH}intersection() { gear_pair(15, 41, part = "gear1", $ports = false); gear_pair(15, 41, part = "gear2", $ports = false); }`,
        empty: true,
      },
    ],
  },
  {
    name: 'gt2_pulley_pair',
    use: 'Two GT2 pulleys at the center distance for a closed belt of a stock tooth count (approximate printed GT2 groove; test one on the belt).',
    tags: 'pulley belt gt2 timing drive transmission reduction toothed',
    params:
      't1=20, t2=40, belt_teeth=100, belt=6 (width), bore1=5, bore2=8, part="both"|"pulley1"|"pulley2"; gt2_pulley(teeth, belt, bore)',
    ports: 'axis_1, axis_2 (bores)',
    notes:
      'Needs include <mechanisms.scad>. gt2_center(t1, t2, belt_teeth) gives the center distance, gt2_pd(t) the pitch diameter.',
    code: `${MECH}gt2_pulley_pair(20, 40, belt_teeth = 100);`,
    expect: { ports: ['axis_1', 'axis_2'] },
  },
  {
    name: 'four_bar',
    use: 'Four-bar linkage as flat pinned bars posed at a crank angle, with the closure solved in code (four_bar_pose) and a Grashof check.',
    tags: 'linkage four-bar 4-bar crank rocker coupler mechanism gripper leg pinned bars kinematic',
    params:
      'ground=60, crank=20, coupler=60, rocker=45, theta=60, w=8, t=4, pin=3, part="all"|"ground"|"crank"|"coupler"|"rocker"',
    ports: 'A, D (ground pivots), B, C (moving pivots), all bores',
    notes: 'Needs include <mechanisms.scad>. four_bar_grashof(...) is true when the shortest link turns fully.',
    code: `${MECH}four_bar(60, 20, 60, 45, theta = 60, part = "coupler");`,
    expect: { ports: ['A', 'B', 'C', 'D'] },
  },
  {
    name: 'snap_pin_part',
    use: 'BOSL2 snap pin printed flat, and its socket as a cutter (snap_socket_cut), for tool-free panels and pivots.',
    tags: 'snap pin clip socket fastener tool-free pivot joiner panel',
    params: 'size="standard"|"medium"|"small"|"tiny"; snap_socket_cut(size) cuts down -Z from its mouth',
    ports: 'snap (the socket mouth)',
    notes: 'Needs include <mechanisms.scad>.',
    code: `${MECH}difference() {
  printed_block([16, 16, 14], $ports = false);
  placed([0, 0, 14]) snap_socket_cut("standard");
}`,
    expect: { ports: ['snap'] },
  },
  {
    name: 'pip_hinge',
    use: 'Print-in-place knuckle hinge (BOSL2, interlocking cones) between two flat leaves, printed in one piece.',
    tags: 'hinge print-in-place knuckle lid door flap pivot folding',
    params: 'length=40, segs=5, knuckle=6, offset=4, leaf=20, t=3, gap=0.3, part="both"|"leaf1"|"leaf2"',
    ports: 'axis (bore along X)',
    notes:
      'Needs include <mechanisms.scad>. Print flat, leaves down; gap 0.3 separates on a 0.4 mm nozzle (test one first).',
    code: `${MECH}pip_hinge(length = 40, leaf = 18);`,
    expect: { ports: ['axis'] },
    checks: [
      {
        why: 'the leaves print apart',
        code: `${MECH}intersection() { pip_hinge(part = "leaf1", $ports = false); pip_hinge(part = "leaf2", $ports = false); }`,
        empty: true,
      },
    ],
  },
];
