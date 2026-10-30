const INC = 'include <robotics.scad>\n';

export const FEATURE_RECIPES = [
  {
    name: 'placed',
    use: 'Place a recipe module so the ports it reports move with it (use instead of translate/rotate around recipe modules).',
    tags: 'port ports place placement position rotate transform frame prefix interface',
    params: 'pos=[x,y,z], r=[rx,ry,rz] (XYZ degrees), prefix="" (prepended to port names)',
    ports: 'whatever its children report, moved into the part frame',
    code: `${INC}placed([0, 0, 6], [180, 0, 0], "lid_") heatset_boss(3, 8);`,
    expect: { ports: ['lid_boss'] },
  },
  {
    name: 'seam_shell',
    use: 'Hollow box enclosure split into base and lid: lip-and-step seam, shadow-line reveal, concentric corners, corner screw towers with M3 heat-set inserts, bed chamfer.',
    tags: 'shell enclosure box case housing lid base seam split torso body cover electronics reveal lip',
    params:
      'size=[80,60,40], r=8 (plan radius), wall=3, split=size.z/2, part="base"|"lid"|"both", top=4 (top edge radius), bed=0.6, lip=2.4, clr=0.2, reveal=0.5, m=3, screws=[[x,y],…] (default: one per corner), screw_side="bottom" (heads hidden on the bed face, inserts in the lid) | "top"',
    ports: 'seam (face), screw_i (screw seats on the bed face), boss_i (insert mouths in the other half)',
    notes:
      'Model base and lid as two parts from the same call. Screw length: split_shell_screw(split) (M3 × 20 for split 20). Print the base bed-face down and the lid upside down.',
    code: `${INC}seam_shell([90, 64, 44], r = 10, part = "base");`,
    expect: { ports: ['seam', 'screw_0', 'screw_3'] },
  },
  {
    name: 'split_shell',
    use: 'Seam, hollow and screw any body that shrinks by $inset (silhouette_body, shell_box or your own module): the sculpted-shell version of seam_shell.',
    tags: 'shell head torso cover sculpted silhouette profile seam split lid base hollow enclosure body organic',
    params:
      'split (z of the seam), wall=3, part="base"|"lid"|"both", lip=2.4, clr=0.2, reveal=0.5, screws=[[x,y],…], m=3, screw_side="bottom"|"top", top_z (needed for "top"), boss_d; children: the body, which must read $inset',
    ports: 'seam (face), screw_i, boss_i',
    notes:
      'silhouette_body(front, side, soft) intersects a front outline (x, z) and a side outline (y, z; front = -y) and honours $inset. Screw towers fuse 0.8 mm into the wall; put them where the shell is at least boss-wide inside.',
    code: `${INC}front = [[-50, 0], [50, 0], [44, 70], [-44, 70]];
side = [[-36, 0], [36, 0], [30, 70], [-30, 70]];
split_shell(32, wall = 2.4, part = "lid", screws = [[30, 18], [-30, 18], [30, -18], [-30, -18]])
  silhouette_body(front, side, soft = 10);`,
    expect: { ports: ['seam', 'boss_0'] },
  },
  {
    name: 'printed_block',
    use: 'Solid block with a plan radius, a 45° bed-edge chamfer (no elephant foot) and a rounded top edge: the base shape for brackets, pads and plates.',
    tags: 'block plate pad bracket base chamfer bed edge fillet rounded print printable cuboid',
    params: 'size=[40,30,12], r=4 (plan radius), top=1 (top edge radius), bed=0.6 (bed chamfer)',
    ports: 'bottom (face), top (face)',
    code: `${INC}difference() {
  printed_block([50, 30, 8], r = 5);
  placed([15, 0, 8]) counterbore_cut(3, 10);
  placed([-15, 0, 8]) counterbore_cut(3, 10, name = "screw_2");
}`,
    expect: { ports: ['bottom', 'top', 'screw', 'screw_2'] },
  },
  {
    name: 'heatset_boss',
    use: 'Boss with a heat-set insert hole (CNC Kitchen sizes, wall ≥ 1.6 mm), flared root, fused 0.2 mm into the surface it stands on.',
    tags: 'boss insert heat-set heatset threaded standoff screw tower mount m3 m2.5 m2',
    params: 'm=3 (M2, M2.5, M3, M4), h=8 (height above z = 0), flare=1, name="boss"',
    ports: 'boss (the insert mouth, axis toward the incoming screw)',
    notes: 'Insert lengths: M2 3, M2.5 4, M3 5.7, M4 8.1 mm (insert_len(m)); boss Ø insert_boss_d(m).',
    code: `${INC}printed_block([30, 20, 3]);
placed([0, 0, 3]) heatset_boss(3, 9);`,
    expect: { ports: ['boss'] },
  },
  {
    name: 'counterbore_cut',
    use: 'Counterbored clearance hole for a socket-head screw (ISO 4762 head, ISO 273 clearance), as a cutter; tap_hole is the self-tapping pilot.',
    tags: 'screw hole counterbore clearance socket head cutter fastener bolt m3 tap pilot self-tapping',
    params: 'm=3, depth=10, sink=0.4 (head below the surface), name="screw"; tap_hole(m=2, depth=8)',
    ports: 'screw (the head seat, axis toward the driver)',
    notes: 'Origin on the outer surface, drills -Z. Place with placed() inside difference().',
    code: `${INC}difference() {
  printed_block([24, 24, 10]);
  placed([0, 0, 10]) counterbore_cut(3, 12);
}`,
    expect: { ports: ['screw'] },
  },
  {
    name: 'rib',
    use: 'Stiffening rib or gusset between a floor and a wall (thickness 40–60 % of the wall, at least 1.5 mm).',
    tags: 'rib gusset stiffener web brace support strengthen wall floor',
    params: 'l=20 (along +X), h=10, t=1.6, gusset=true (tapered) | false (straight, chamfered end)',
    ports: 'none',
    code: `${INC}union() {
  printed_block([40, 30, 3], r = 3);
  translate([-20, -15, 0]) cube([3, 30, 20]);
  for (y = [-8, 8]) translate([-17, y, 3]) rib(20, 14);
}`,
    expect: { ports: [] },
  },
  {
    name: 'vent_slots',
    use: 'Row of rounded vent slots (cutter) for electronics bays and covers.',
    tags: 'vent vents slots cooling airflow grille louvre cutter holes',
    params: 'n=5, l=16 (slot length, Y), w=2.4, pitch=5 (X), depth=4 (cut down from z = 0)',
    ports: 'none',
    code: `${INC}difference() {
  printed_block([50, 30, 3], r = 4);
  placed([0, 0, 3]) vent_slots(n = 7, l = 18);
}`,
    expect: { ports: [] },
  },
  {
    name: 'joint_disc',
    use: 'Round flange with a center bore and a bolt circle: joint covers, horn adapters, turntables and wheel hubs.',
    tags: 'disc flange joint cover horn adapter turntable hub bolt circle round plate bearing',
    params:
      'd=40, t=6, bore=8, bc=30 (bolt circle), holes=4, m=3, fix="through" (counterbored) | "insert" (needs t ≥ insert + 1) | "tap", chamfer=0.6',
    ports: 'face, bottom (faces), bore, bolts (hole_circle, d = bc), bolt_i (screw seats when fix = "through")',
    notes: 'An STS3215 horn adapter is joint_disc(d = 26, bore = 6.5, bc = 14, m = 3).',
    code: `${INC}joint_disc(d = 32, t = 6, bore = 6.5, bc = 14);`,
    expect: { ports: ['face', 'bore', 'bolts', 'bolt_0'] },
  },
];
