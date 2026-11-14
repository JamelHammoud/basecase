export const MINUS_COPY = [
  {
    pattern: /(?<=^|[\s(“[])-\d[\d.,]*/u,
    afterValue: /(?<=[\s(“[])-\d[\d.,]*/u,
    fix: 'Write a negative number with a minus sign: “−90°”, not “-90°”; `negative` and `signed` in electron/minus.mjs write it.',
    section: '§3b-22',
  },
];
