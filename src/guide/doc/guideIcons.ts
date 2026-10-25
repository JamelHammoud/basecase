import type { ToolIcon } from '../guideTypes';

const INK = '#111';
const TONE = '#e4e4e4';
const STROKE = `stroke="${INK}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"`;

const svg = (body: string) => `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;

const tilted = (body: string) => svg(`<g transform="rotate(45 60 60)">${body}</g>`);

const shape = (d: string, fill = '#fff') => `<path d="${d}" fill="${fill}" ${STROKE}/>`;

const rect = ([x, y, w, h]: [number, number, number, number], r: number, fill = '#fff') =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" ${STROKE}/>`;

const lines = (d: string, width = 2.2) =>
  `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${width}" stroke-linecap="round"/>`;

const HANDLE =
  rect([47, 66, 26, 44], 11, TONE) + lines('M55 76 V100 M60 76 V100 M65 76 V100') + rect([52, 58, 16, 9], 2.5);

const SHAFT = rect([57, 20, 6, 39], 1.5);

const TIPS = {
  cross: shape('M57 21 L60 9 L63 21 Z', INK),
  torx: shape('M57 21 L58 11 H62 L63 21 Z', INK) + lines('M60 11 V20', 1.4),
  flat: shape('M56.5 21 L57.5 10 H62.5 L63.5 21 Z', INK),
};

const driver = (tip: keyof typeof TIPS) => tilted(HANDLE + SHAFT + TIPS[tip]);

const WRENCH_HEAD =
  'M53 11.4 L53 25 A7 7 0 0 0 67 25 L67 11.4 A18 18 0 0 1 68 44.1 L68 104 A8 8 0 0 1 52 104 L52 44.1 A18 18 0 0 1 53 11.4 Z';

const TOOLS: Record<ToolIcon, string> = {
  'hex-key': svg(shape('M17.8 93.8 L76 35.5 Q80 31.5 84 35.5 L101.2 52.8 L92.8 61.2 L80 48.5 L26.2 102.2 Z')),
  torx: driver('torx'),
  screwdriver: driver('cross'),
  'flat-screwdriver': driver('flat'),
  wrench: tilted(shape(WRENCH_HEAD, TONE) + `<circle cx="60" cy="98" r="3.2" fill="#fff" ${STROKE}/>`),
  'soldering-iron': tilted(
    rect([49, 66, 22, 42], 9, TONE) +
      lines('M56 76 V98 M64 76 V98') +
      rect([45, 58, 30, 8], 4) +
      rect([56.5, 24, 7, 34], 2) +
      shape('M56.5 25 L60 9 L63.5 25 Z', INK) +
      lines('M60 108 Q60 118 50 118', 3),
  ),
  printer: svg(
    rect([14, 12, 92, 96], 8) +
      lines('M14 30 H106', 3) +
      rect([48, 24, 24, 16], 3, TONE) +
      shape('M56 40 L60 48 L64 40 Z', INK) +
      rect([44, 66, 32, 22], 3, TONE) +
      lines('M44 73 H76 M44 80 H76', 1.6) +
      rect([24, 88, 72, 7], 2),
  ),
};

export const toolIcon = (icon: ToolIcon) => TOOLS[icon];

export const rotateIcon = () =>
  svg(
    lines('M96 60 A36 36 0 1 1 78 28.8', 6) +
      `<path d="M70 12 L92 28 L70 42 Z" fill="${INK}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`,
  );

export const mirrorIcon = () =>
  svg(
    `<path d="M60 10 V110" fill="none" stroke="${INK}" stroke-width="3" stroke-dasharray="7 7" stroke-linecap="round"/>` +
      shape('M48 26 L14 94 H48 Z', INK) +
      shape('M72 26 L106 94 H72 Z'),
  );

export const checkMark = () =>
  svg(
    `<circle cx="60" cy="60" r="50" fill="#fff" stroke="${INK}" stroke-width="6"/>` + lines('M36 62 L53 79 L86 44', 9),
  );
