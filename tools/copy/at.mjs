export const AT_COPY = [
  {
    pattern: /\s@\s/u,
    fix: 'Write “at” for a number’s condition: “0.52 N·m at 5 V”, not “0.52 N·m @ 5 V”.',
    section: '§3b-23',
  },
];
