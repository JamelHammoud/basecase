export const LOOP_MARK = '<!-- loop -->';

export const withMark = (body) => (body.includes(LOOP_MARK) ? body : `${body.trimEnd()}\n\n${LOOP_MARK}`);
