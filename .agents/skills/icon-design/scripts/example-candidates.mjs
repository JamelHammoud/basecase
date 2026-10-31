import { nut, NUT_PARAMS } from './geometry.mjs';

export const mask = (id, knock) =>
  `<defs><mask id="${id}" maskUnits="userSpaceOnUse" x="-2" y="-2" width="28" height="28"><rect x="-2" y="-2" width="28" height="28" fill="#fff"/><g stroke="#000" fill="none" stroke-width="1.5">${knock}</g></mask></defs>`;

const N = nut(NUT_PARAMS);
const BOOKMARK =
  'M6 5.5A2.5 2.5 0 0 1 8.5 3h7A2.5 2.5 0 0 1 18 5.5v14.7a.8.8 0 0 1-1.25.66L12 17.5l-4.75 3.36A.8.8 0 0 1 6 20.2z';

export default {
  Parts: {
    o: `<path d="${N.body}${N.edges}${N.hole}"/>`,
    f:
      mask('MASK', `<path d="${N.cuts}"/><path fill="#000" d="${N.hole}"/>`) +
      `<path mask="url(#MASK)" fill="currentColor" d="${N.body}"/>`,
  },
  Layers: {
    o: '<path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83zM2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"/>',
  },
  Library: { o: `<path d="${BOOKMARK}"/>`, f: `<path fill="currentColor" d="${BOOKMARK}"/>` },
  Settings: 'lib:SettingsIcon',
};
