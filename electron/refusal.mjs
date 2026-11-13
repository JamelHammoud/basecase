export const asSentence = (text) => (/[.!?]$/.test(text) ? text : `${text}.`);

export function serviceRefusal(service, { status, detail, again }) {
  if (status === 429) return `${service} is limiting requests. ${again} in a minute.`;

  if (detail) return `${service} refused the request: ${asSentence(detail)}`;

  return `${service} couldn’t finish the request. ${again} in a minute.`;
}
