const MIN_SECRET = 12;

export const usableSecrets = (secrets) => secrets.filter((s) => typeof s === 'string' && s.length >= MIN_SECRET);

export const leakCount = (text, secrets) => usableSecrets(secrets).filter((s) => text.includes(s)).length;

export const redact = (text, secrets) => usableSecrets(secrets).reduce((out, s) => out.split(s).join('[hidden]'), text);
