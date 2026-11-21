export const csvCell = (value: unknown): string => {
  const raw = value === undefined || value === null ? '' : String(value);
  const safe = /^\s*[=+@-]/.test(raw) ? `'${raw}` : raw;

  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
