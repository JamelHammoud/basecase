const PURPOSE = [
  "People place this figure next to their robot in Basecase's Measure tool to judge its size. It's drawn as a translucent light-blue ghost, so only the shape counts: no clothing, texture, colors or fur detail.",
  'It has to read at a glance as the real thing, like a 3D scan, never as cylinders, spheres and capsules joined together.',
];

const METHOD = (subject) => [
  `1. Find references first: use find_images and view_image to study clean front and side photos (or 3D-scan turnarounds) of ${subject} in this pose. Pick one front and one side reference that each show a single subject, whole, on a plain background, with no watermark, so compare can measure its silhouette band by band; compare against them throughout.`,
  '2. Sculpt smooth organic shells with replicad: lofts through cross-sections and profileBody from the front and side outlines traced from your references, so every part swells and tapers like real anatomy. No primitive body parts left.',
  '3. A few watertight parts are fine (one per body section); they may overlap where they meet, since the ghost hides the seams. Mirror left and right. One color for everything (#b8b8b8).',
  '4. look and compare against your references from the front, side and iso views; fix proportions and shapes until the silhouette matches from every side. check_scene must be clean apart from overlaps between your own parts.',
];

export const FIGURES = {
  human: {
    name: 'Human',
    prompt: [
      'Sculpt a life-size human scale figure.',
      ...PURPOSE,
      '',
      'Subject: an adult man of average build, exactly 1753 mm tall (the average US adult man), standing relaxed and symmetric: weight on both feet, feet 150 mm apart pointing forward, arms hanging about 8° out from the torso with palms facing the thighs, head level and looking forward. Front faces −Y, feet on the floor (z = 0), centred on x = 0, y = 0.',
      '',
      'Proportions as fractions of height (standard anthropometry; check them against your references): top of head 1.000, chin 0.870, shoulder (acromion) 0.818, nipple 0.720, elbow 0.630, navel 0.600, hip joint 0.530, wrist 0.485, crotch 0.470, fingertips 0.377, knee 0.285, ankle 0.039. Shoulder breadth 0.259, hip breadth 0.191, chest depth 0.13, head 0.13 tall × 0.087 wide × 0.11 deep, foot 0.152 long.',
      '',
      'Breadths (side to side) and depths (front to back) as fractions of height, from ANSUR II averages for US men: neck 0.071 wide; across the deltoids 0.285; chest at the armpits 0.19 wide × 0.145 deep; waist 0.18 × 0.13; hips 0.20 × 0.14; each thigh at the crotch 0.11 × 0.115; knee 0.06; calf 0.07 × 0.075; ankle 0.04; upper arm 0.06 × 0.065; forearm below the elbow 0.055; wrist 0.035 × 0.025; hand 0.05 wide × 0.108 long. Check your model against these with the profile compare prints.',
      '',
      'Anatomy to get right: skull and jaw with the brow, nose, chin and ears in silhouette (the head is egg-shaped, not elongated); a short neck flowing into the trapezius, which slopes down to the shoulders; one continuous torso shell from neck to crotch that includes the shoulders and the deltoid caps, with the arms starting beneath the deltoids, never as cylinders capped on above the shoulder line; a V from the deltoids and chest to the waist, then the pelvis and buttocks; thighs with real mass tapering to the knee, the calf bulge, ankles, feet with heels and toes; upper arms and forearms that swell and taper; hands as mittens with the thumb apart.',
      '',
      ...METHOD('a standing man'),
      '',
      'Final message: a table of the proportions above (target and modeled), then anything you could not match.',
    ].join('\n'),
  },
  dog: {
    name: 'Dog',
    prompt: [
      'Sculpt a life-size dog scale figure.',
      ...PURPOSE,
      '',
      'Subject: an adult male Labrador Retriever of standard size, 570 mm at the withers (top of the shoulder blades), about 32 kg, standing square: all four legs vertical under the body, head up with the muzzle level, looking forward, ears hanging, tail relaxed straight back and slightly down. Nose faces −Y, paws on the floor (z = 0), centred on x = 0.',
      '',
      'Proportions (breed standard; check them against your references): body from point of shoulder to point of buttock 600–620 mm; chest depth half the withers height, its bottom at elbow level; top of the head about 720 mm; skull broad with a clear stop, muzzle about as long as the skull (about 100 mm); the otter tail thick at the root, tapering, reaching the hock.',
      '',
      'Anatomy to get right: a muscular neck flowing into the withers, a deep barrel ribcage with a slight tuck-up behind it, a strong loin, straight forelegs with the elbows close to the body, well-angled stifles and hocks on the hind legs, round compact paws, drop ears hanging beside the cheeks.',
      '',
      ...METHOD('a standing Labrador Retriever'),
      '',
      'Final message: a table of the proportions above (target and modeled), then anything you could not match.',
    ].join('\n'),
  },
};

export const REVIEW = [
  'Review the figure against your references before we save it.',
  '',
  '1. compare it with your front and side references, and look at it from the iso view.',
  '2. List the five biggest differences in shape or proportion (a limb too thick, a joint at the wrong height, a body section that still reads as a primitive, a pose that differs).',
  '3. Fix all five, then compare again.',
  '',
  'Final message: the proportion table after the fixes, then anything you could not match.',
].join('\n');
