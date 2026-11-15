export const pairKey = (a, b, separator = '|') => (a < b ? `${a}${separator}${b}` : `${b}${separator}${a}`);
