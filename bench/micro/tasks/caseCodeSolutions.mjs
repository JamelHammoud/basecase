const STYLE = `<style>
button{font:inherit;color:var(--bc-ink);background:var(--bc-surface);border:0;border-radius:var(--bc-radius-control);min-height:var(--bc-control);padding:0 12px}
button:hover{background:var(--bc-raised)}
.grid{display:grid;gap:var(--bc-gap);padding:var(--bc-inset)}
canvas{display:block;width:100%;background:var(--bc-surface);border-radius:var(--bc-radius-control);touch-action:none}
label{display:grid;gap:4px;color:var(--bc-ink-2)}
</style>`;

const ONCE = `let started = null;
const startDriving = () => (started ??= basecase.action('drive'));`;

const DRAW = `const strokes = (pad, onDone) => {
  const g = pad.getContext('2d');
  let path = [];
  pad.addEventListener('pointerdown', (e) => { pad.setPointerCapture(e.pointerId); path = [[e.offsetX, e.offsetY]]; });
  pad.addEventListener('pointermove', (e) => {
    if (!pad.hasPointerCapture(e.pointerId)) return;
    path.push([e.offsetX, e.offsetY]);
    g.clearRect(0, 0, pad.width, pad.height);
    g.strokeStyle = getComputedStyle(document.body).getPropertyValue('--bc-accent');
    g.lineWidth = 3;
    g.beginPath();
    path.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.stroke();
  });
  pad.addEventListener('pointerup', () => onDone(path.map(([x, y]) => [x / pad.clientWidth, y / pad.clientHeight])));
};`;

const piano = `${STYLE}
<div class="grid" role="group" aria-label="Piano" style="grid-template-columns:repeat(6,1fr)"></div>
<script>
const keys = ['A', 'S', 'D', 'F', 'G', 'H'];
const group = document.querySelector('[role=group]');
keys.forEach((key, leg) => {
  const button = document.createElement('button');
  button.textContent = key;
  button.style.height = '140px';
  button.addEventListener('pointerdown', () => basecase.event('lift', leg));
  group.append(button);
});
addEventListener('keydown', (e) => {
  const leg = keys.indexOf(e.key.toUpperCase());
  if (leg >= 0) basecase.event('lift', leg);
});
</script>`;

const drawingPad = `${STYLE}
<div class="grid"><canvas width="320" height="320" aria-label="Drawing pad"></canvas><button>Go</button></div>
<script>
${DRAW}
let route = [];
strokes(document.querySelector('canvas'), (path) => { route = path; });
${ONCE}
document.querySelector('button').addEventListener('click', async () => {
  if (route.length < 2) return;
  await startDriving();
  const [x0, y0] = route[0];
  const [x1, y1] = route.at(-1);
  const turn = Math.max(-1, Math.min(1, (x0 - x1) * 2));
  const seconds = Math.min(8, 2 + Math.hypot(x1 - x0, y1 - y0) * 8);
  basecase.drive({ v: [1, 0, turn] });
  setTimeout(() => basecase.drive(null), seconds * 1000);
});
</script>`;

const cockpitControls = `${STYLE}
<div class="grid">
  <canvas width="200" height="200" aria-label="Joystick"></canvas>
  <label>Throttle <input type="range" min="0" max="100" value="0" aria-label="Throttle"></label>
</div>
<script>
const stick = document.querySelector('canvas');
const throttle = document.querySelector('input');
let turn = 0;
${ONCE}
const send = async () => {
  await startDriving();
  basecase.drive({ v: [Number(throttle.value) / 100, 0, turn] });
};
throttle.addEventListener('input', send);
stick.addEventListener('pointerdown', (e) => stick.setPointerCapture(e.pointerId));
stick.addEventListener('pointermove', (e) => {
  if (!stick.hasPointerCapture(e.pointerId)) return;
  turn = Math.max(-1, Math.min(1, (100 - e.offsetX) / 80));
  send();
});
stick.addEventListener('pointerup', () => { turn = 0; send(); });
</script>`;

const cockpitHud = `<div style="padding:8px 12px;font-variant-numeric:tabular-nums">
  Speed <b data-speed>0.00</b> m/s, Tilt <b data-tilt>0</b>°
</div>
<script>
basecase.signals(['robot.speed', 'robot.tilt'], (v) => {
  document.querySelector('[data-speed]').textContent = (v['robot.speed'] ?? 0).toFixed(2);
  document.querySelector('[data-tilt]').textContent = (v['robot.tilt'] ?? 0).toFixed(0);
});
</script>`;

const puppet = `${STYLE}
<div class="grid" style="grid-template-columns:1fr 1fr"></div>
<script>
const joints = ['l_roll', 'l_pitch', 'l_bend', 'l_tilt', 'r_roll', 'r_pitch', 'r_bend', 'r_tilt'];
const grid = document.querySelector('.grid');
for (const id of joints) {
  const label = document.createElement('label');
  const slider = Object.assign(document.createElement('input'), { type: 'range', min: -60, max: 60, value: 0 });
  slider.setAttribute('aria-label', id);
  slider.addEventListener('input', () => basecase.event('joint-' + id, Number(slider.value)));
  label.append(id, slider);
  grid.append(label);
}
</script>`;

const sequencer = `${STYLE}
<div class="grid" style="grid-template-columns:repeat(8,1fr)"></div>
<div class="grid"><button>Play</button></div>
<script>
const poses = ['lean', 'squat', 'kick'];
const grid = document.querySelector('.grid');
const cells = poses.flatMap((pose) =>
  Array.from({ length: 8 }, (_, beat) => {
    const box = Object.assign(document.createElement('input'), { type: 'checkbox' });
    box.setAttribute('aria-label', pose + ' on beat ' + (beat + 1));
    grid.append(box);
    return { pose, beat, box };
  }),
);
let beat = 0;
let timer = 0;
document.querySelector('button').addEventListener('click', () => {
  clearInterval(timer);
  timer = setInterval(() => {
    cells.filter((c) => c.beat === beat && c.box.checked).forEach((c) => basecase.event('pose', c.pose));
    beat = (beat + 1) % 8;
  }, 500);
});
</script>`;

const remote = `${STYLE}
<div class="grid" style="grid-template-columns:1fr 1fr">
  <button data-move="wave">Wave</button><button data-move="dance">Dance</button>
  <button data-move="sit">Sit</button><button data-move="stop">Stop</button>
</div>
<script>
for (const button of document.querySelectorAll('button')) button.style.height = '96px';
let dancing = false;
document.querySelector('[data-move=dance]').addEventListener('click', async () => {
  if (!dancing) dancing = (await basecase.action('drive')).ok;
  basecase.drive({ v: [0, 0, 0.5] });
});
document.querySelector('[data-move=wave]').addEventListener('click', () => basecase.event('wave'));
document.querySelector('[data-move=sit]').addEventListener('click', () => basecase.event('sit'));
document.querySelector('[data-move=stop]').addEventListener('click', () => {
  basecase.drive(null);
  if (dancing) basecase.action('stop');
  dancing = false;
});
</script>`;

const pickStation = `${STYLE}
<div class="grid"><ol aria-label="Orders"></ol><button>Next Order</button></div>
<script>
const orders = [[0, 300, -150], [120, 250, -120], [-120, 250, -120], [0, 220, -200]];
const list = document.querySelector('ol');
const show = () => (list.innerHTML = orders.map((o, i) => '<li>Order ' + (i + 1) + ': ' + o.join(', ') + ' mm</li>').join(''));
show();
${ONCE}
document.querySelector('button').addEventListener('click', async () => {
  await startDriving();
  const order = orders.shift();
  orders.push(order);
  show();
  basecase.drive({ v: [0, 0, 0], target: order });
});
</script>`;

const benchTest = `${STYLE}
<div class="grid">
  <label>Joint <select aria-label="Joint"><option>arm0</option><option>arm1</option><option>arm2</option></select></label>
  <button>Sweep</button><canvas width="300" height="160" aria-label="Effort against angle"></canvas>
  <button>Download CSV</button>
</div>
<script>
const rows = [];
basecase.signals('joint.*.effort', (values) => rows.push(values));
document.querySelectorAll('button')[0].addEventListener('click', () => basecase.event('sweep', document.querySelector('select').value));
</script>`;

const fence = `${STYLE}
<div class="grid"><canvas width="240" height="240" aria-label="Zone"></canvas><button>Start</button></div>
<script>
${DRAW}
const HALF_MM = 1000;
let zone = null;
let start = null;
let stopped = false;
strokes(document.querySelector('canvas'), (path) => {
  const xs = path.map(([x]) => (x * 2 - 1) * HALF_MM);
  const zs = path.map(([, y]) => (y * 2 - 1) * HALF_MM);
  zone = { x: [Math.min(...xs), Math.max(...xs)], z: [Math.min(...zs), Math.max(...zs)] };
});
basecase.signals(['robot.x', 'robot.z'], (v) => {
  if (typeof v['robot.x'] !== 'number' || typeof v['robot.z'] !== 'number') return;
  start ??= [v['robot.x'], v['robot.z']];
  const x = v['robot.x'] - start[0];
  const z = v['robot.z'] - start[1];
  const out = zone && (x < zone.x[0] || x > zone.x[1] || z < zone.z[0] || z > zone.z[1]);
  if (!out || stopped) return;
  stopped = true;
  basecase.drive(null);
  basecase.action('stop');
  document.body.style.background = 'var(--bc-red)';
});
document.querySelector('button').addEventListener('click', async () => {
  stopped = false;
  start = null;
  await basecase.action('drive');
  basecase.drive({ v: [1, 0, 0] });
});
</script>`;

const tugOfWar = `${STYLE}
<div class="grid"><b>Rope score <span data-score>0</span></b></div>
<script>
const held = new Set();
addEventListener('keydown', (e) => held.add(e.key));
addEventListener('keyup', (e) => held.delete(e.key));
</script>`;

const teleop = `${STYLE}
<div class="grid"><button style="height:120px">Grip</button></div>
<script>
const grip = document.querySelector('button');
${ONCE}
grip.addEventListener('pointerdown', async () => {
  await startDriving();
  basecase.drive({ v: [0, 0, 0], aux: [0, 1] });
});
grip.addEventListener('pointerup', () => basecase.drive({ v: [0, 0, 0], aux: [0, -1] }));
</script>`;

const g1Teleop = `${STYLE}
<div class="grid"><button>Start</button></div>
<script>
document.querySelector('button').addEventListener('click', () => basecase.action('try'));
</script>`;

const metronome = `${STYLE}
<div class="grid">
  <label>Tempo <input type="range" min="40" max="160" value="90" aria-label="Tempo"></label>
  <button>Start</button>
</div>
<script>
let timer = 0;
document.querySelector('button').addEventListener('click', () => {
  clearInterval(timer);
  timer = setInterval(() => basecase.event('nod'), 60000 / Number(document.querySelector('input').value));
});
</script>`;

export const SOLUTIONS = {
  W1: [{ id: 'piano', title: 'Piano', source: piano }],
  W2: [{ id: 'pad', title: 'Drawing Pad', source: drawingPad, height: 420 }],
  W3: [
    { id: 'cockpit', title: 'Cockpit', source: cockpitControls },
    { id: 'hud', source: cockpitHud, overlay: { anchor: 'top-left', width: 280, height: 48 } },
  ],
  W4: [{ id: 'puppet', title: 'Puppet', source: puppet, height: 420 }],
  W5: [{ id: 'sequencer', title: 'Dance', source: sequencer }],
  W6: [{ id: 'remote', title: 'Remote', source: remote }],
  W7: [{ id: 'orders', title: 'Orders', source: pickStation }],
  W8: [{ id: 'bench', title: 'Bench Test', source: benchTest, height: 420 }],
  W9: [{ id: 'fence', title: 'Safety Fence', source: fence, height: 360 }],
  W10: [{ id: 'rope', title: 'Tug of War', source: tugOfWar }],
  W11: [{ id: 'grip', title: 'Gripper', source: teleop }],
  W12: [{ id: 'start', title: 'Teleop', source: g1Teleop }],
  W13: [{ id: 'metronome', title: 'Metronome', source: metronome }],
};
