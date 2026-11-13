const PLAIN_WORDS = /^\p{Lu}[\p{L}’' ]*$/u;
const SEARCH = /^Search\b/;

export const PLACEHOLDER_FIX = 'Show an example (“e.g. Servo bracket”), or name what a search field searches (§3b-11).';

export const isInstructionPlaceholder = (text) => PLAIN_WORDS.test(text.trim()) && !SEARCH.test(text.trim());
