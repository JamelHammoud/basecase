export const APOSTROPHE_COPY = [
  {
    pattern: /\p{L}'\p{L}/u,
    fix: "Write the apostrophe as ’: “can’t”, not “can't”.",
    section: '§3b-21',
  },
];
