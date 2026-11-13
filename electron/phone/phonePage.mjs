const STYLE = `
* { box-sizing: border-box; margin: 0; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
html, body { height: 100%; overflow: hidden; overscroll-behavior: none; }
body {
  background: #1e1e1e; color: #e6e6e6; font: 500 16px/1.4 system-ui, -apple-system, sans-serif;
  touch-action: none; display: flex; flex-direction: column; gap: 16px;
  padding: max(16px, env(safe-area-inset-top)) 16px max(16px, env(safe-area-inset-bottom));
  transition: opacity 0.2s;
}
p { text-align: center; color: #a6a6a6; }
#pad { position: relative; flex: 1; border-radius: 12px; background: #2a2a2a; touch-action: none; }
#dot {
  position: absolute; left: 0; top: 0; width: 56px; height: 56px; margin: -28px 0 0 -28px; border-radius: 50%;
  background: #0d99ff; opacity: 0; pointer-events: none;
}
#pad.on #dot { opacity: 1; }
nav { display: flex; justify-content: space-around; }
button {
  width: 96px; height: 96px; border: 0; border-radius: 50%; background: #2a2a2a; color: #e6e6e6;
  font: 600 24px system-ui, -apple-system, sans-serif; touch-action: none;
}
button.on { background: #0d99ff; color: #ffffff; }
`;

const SCRIPT = `
const token = new URLSearchParams(location.search).get('t') || '';
const socket = new WebSocket('wss://' + location.host + '/socket?t=' + encodeURIComponent(token));
const pad = document.getElementById('pad');
const dot = document.getElementById('dot');
const state = { beta: 0, gamma: 0, pad: null, buttons: [false, false] };
const clamp = (value, limit) => Math.max(-limit, Math.min(limit, value));
const tenth = (value) => Math.round(value * 10) / 10;
const thousandth = (value) => Math.round(value * 1000) / 1000;
let asked = false;

addEventListener('pointerdown', () => {
  if (asked) return;
  asked = true;
  try {
    const request = typeof DeviceOrientationEvent === 'undefined' ? undefined : DeviceOrientationEvent.requestPermission;
    if (request) Promise.resolve(DeviceOrientationEvent.requestPermission()).catch(() => {});
  } catch {}
}, { capture: true });

addEventListener('deviceorientation', (event) => {
  state.beta = event.beta ?? 0;
  state.gamma = event.gamma ?? 0;
});

const touchPad = (event) => {
  const box = pad.getBoundingClientRect();
  const x = clamp(((event.clientX - box.left) / box.width) * 2 - 1, 1);
  const y = clamp(1 - ((event.clientY - box.top) / box.height) * 2, 1);
  state.pad = [x, y];
  dot.style.transform = 'translate(' + (event.clientX - box.left) + 'px, ' + (event.clientY - box.top) + 'px)';
  pad.classList.add('on');
};

const releasePad = () => {
  state.pad = null;
  pad.classList.remove('on');
};

pad.addEventListener('pointerdown', (event) => {
  pad.setPointerCapture(event.pointerId);
  touchPad(event);
});
pad.addEventListener('pointermove', (event) => {
  if (pad.hasPointerCapture(event.pointerId)) touchPad(event);
});
pad.addEventListener('pointerup', releasePad);
pad.addEventListener('pointercancel', releasePad);

for (const button of document.querySelectorAll('button')) {
  const index = Number(button.dataset.index);
  const press = (on) => () => {
    state.buttons[index] = on;
    button.classList.toggle('on', on);
  };
  button.addEventListener('pointerdown', (event) => {
    button.setPointerCapture(event.pointerId);
    press(true)();
  });
  button.addEventListener('pointerup', press(false));
  button.addEventListener('pointercancel', press(false));
}

const timer = setInterval(() => {
  if (socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify({
    tilt: [tenth(clamp(state.beta, 180)), tenth(clamp(state.gamma, 90))],
    pad: state.pad && [thousandth(state.pad[0]), thousandth(state.pad[1])],
    buttons: [state.buttons[0], state.buttons[1]],
  }));
}, 33);

socket.addEventListener('close', () => {
  clearInterval(timer);
  document.body.style.opacity = '0.4';
});
`;

const NONCE = /^[A-Za-z0-9+/]+={0,2}$/;

export function phonePage(nonce) {
  if (!NONCE.test(nonce)) throw new Error('The page nonce must be base64');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
<meta name="color-scheme" content="dark">
<title>Basecase</title>
<style nonce="${nonce}">${STYLE}</style>
</head>
<body>
<p>Tilt to drive</p>
<div id="pad"><div id="dot"></div></div>
<nav><button type="button" data-index="0">A</button><button type="button" data-index="1">B</button></nav>
<script nonce="${nonce}">${SCRIPT}</script>
</body>
</html>
`;
}
