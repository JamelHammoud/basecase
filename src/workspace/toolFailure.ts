const MAX_LENGTH = 4000;
const FENCED = /^```[^\n]*\n([\s\S]*?)\n?```$/;
const TOOL_USE_ERROR = /^<tool_use_error>([\s\S]*)<\/tool_use_error>$/;
const CODE_PREFIX = /^MCP error -?\d+:\s*/;

interface ContentItem {
  type?: unknown;
  content?: { type?: unknown; text?: unknown };
}

function contentTexts(content: unknown): string[] {
  if (!Array.isArray(content)) return [];

  return (content as ContentItem[]).flatMap((item) =>
    item?.type === 'content' && item.content?.type === 'text' && typeof item.content.text === 'string'
      ? [item.content.text]
      : [],
  );
}

const cleaned = (text: string) =>
  text.trim().replace(FENCED, '$1').trim().replace(TOOL_USE_ERROR, '$1').trim().replace(CODE_PREFIX, '');

export function failureText(update: { content?: unknown; rawOutput?: unknown }): string {
  const texts = contentTexts(update.content);

  if (!texts.length && typeof update.rawOutput === 'string') texts.push(update.rawOutput);

  return texts.map(cleaned).filter(Boolean).join('\n\n').slice(0, MAX_LENGTH);
}
