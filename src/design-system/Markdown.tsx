import React, { createContext, useContext } from 'react';
import ReactMarkdown, { Components, Options } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from './CodeBlock';
import { HexSwatch } from './HexSwatch';
import { HoverCard } from './HoverCard';
import { MarkdownTable, TableCell } from './MarkdownTable';
import { remarkHexSwatches, SWATCH_ATTRIBUTE } from './remarkHexSwatches';
import { remarkHtmlAsText } from './remarkHtmlAsText';

const LINK_CLASS = 'text-[#5cb8ff] hover:underline underline-offset-2';

export type LinkPreview = (href: string) => { content: () => React.ReactNode; width: number } | null;

interface InternalLinks {
  onClick?: (href: string) => void;
  preview?: LinkPreview;
}

const InternalLinkContext = createContext<InternalLinks>({});

const MarkdownLink: React.FC<{ href?: string; children?: React.ReactNode }> = ({ href, children }) => {
  const { onClick, preview } = useContext(InternalLinkContext);

  if (href?.startsWith('#') && onClick) {
    const link = (
      <a
        href={href}
        className={LINK_CLASS}
        onClick={(e) => {
          e.preventDefault();
          onClick(href);
        }}
      >
        {children}
      </a>
    );
    const card = preview?.(href);

    return card ? (
      <HoverCard content={card.content} width={card.width} placement="below" inline>
        {link}
      </HoverCard>
    ) : (
      link
    );
  }

  return (
    <a href={href} target="_blank" rel="noreferrer" className={LINK_CLASS}>
      {children}
    </a>
  );
};

const components: Components = {
  p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  h1: ({ children }) => <h3 className="text-[15px] font-semibold text-white mt-4 mb-1.5 first:mt-0">{children}</h3>,
  h2: ({ children }) => <h3 className="text-[14.5px] font-semibold text-white mt-4 mb-1.5 first:mt-0">{children}</h3>,
  h3: ({ children }) => <h4 className="text-[14px] font-semibold text-white mt-3 mb-1 first:mt-0">{children}</h4>,
  ul: ({ children }) => <ul className="my-2 pl-5 list-disc space-y-1 marker:text-white/30">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 pl-5 list-decimal space-y-1 marker:text-white/40">{children}</ol>,
  li: ({ children }) => <li className="pl-0.5">{children}</li>,
  a: ({ href, children }) => <MarkdownLink href={href}>{children}</MarkdownLink>,
  blockquote: ({ children }) => (
    <blockquote className="my-2 pl-3 border-l-2 border-white/15 text-white/60">{children}</blockquote>
  ),
  hr: () => <hr className="my-3 border-white/10" />,
  code: ({ className, children }) => {
    const language = /language-([\w-]+)/.exec(className || '')?.[1];
    const text = String(children);

    if (language || text.includes('\n'))
      return <CodeBlock code={text.replace(/\n$/, '')} language={language} className="my-2" />;

    return (
      <code className="px-1 py-0.5 rounded-[5px] bg-white/[0.08] font-mono text-[12.5px] text-white/90">
        {children}
      </code>
    );
  },
  pre: ({ children }) => <>{children}</>,
  span: ({ children, ...props }) => {
    const color = (props as Record<string, unknown>)[SWATCH_ATTRIBUTE];

    return typeof color === 'string' ? <HexSwatch color={color} /> : <span>{children}</span>;
  },
  table: ({ children }) => <MarkdownTable>{children}</MarkdownTable>,
  th: ({ children }) => <TableCell header>{children}</TableCell>,
  td: ({ children }) => <TableCell>{children}</TableCell>,
};

export const Markdown: React.FC<{
  children: string;
  className?: string;
  remarkPlugins?: Options['remarkPlugins'];
  onInternalLink?: (href: string) => void;
  linkPreview?: LinkPreview;
}> = ({ children, className = '', remarkPlugins = [], onInternalLink, linkPreview }) => (
  <div className={`text-[14px] leading-relaxed text-white/90 select-text break-words ${className}`}>
    <InternalLinkContext value={{ onClick: onInternalLink, preview: linkPreview }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkHtmlAsText, remarkHexSwatches, ...(remarkPlugins ?? [])]}
        components={components}
      >
        {children}
      </ReactMarkdown>
    </InternalLinkContext>
  </div>
);
