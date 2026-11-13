import React from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

const LINK_CLASS = 'text-[#5cb8ff] underline-offset-2 hover:underline';

const isExternal = (href: string | undefined) => /^[a-z]+:/i.test(href ?? '');

const components: Components = {
  h1: ({ children }) => <h2 className="mt-[32px] text-[20px] leading-[1.3] font-semibold text-white/90">{children}</h2>,
  h2: ({ children }) => <h2 className="mt-[32px] text-[20px] leading-[1.3] font-semibold text-white/90">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-[24px] text-[16px] leading-[1.4] font-semibold text-white/90">{children}</h3>,
  p: ({ children }) => <p className="mt-[14px] first:mt-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-white/90">{children}</strong>,
  ul: ({ children }) => (
    <ul className="mt-[14px] pl-[22px] list-disc flex flex-col gap-[8px] marker:text-white/50">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mt-[14px] pl-[22px] list-decimal flex flex-col gap-[8px] marker:text-white/50">{children}</ol>
  ),
  a: ({ href, children }) =>
    isExternal(href) ? (
      <a href={href} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
        {children}
      </a>
    ) : (
      <a href={href} className={LINK_CLASS}>
        {children}
      </a>
    ),
  blockquote: ({ children }) => (
    <blockquote className="mt-[14px] pl-[14px] border-l-2 border-white/15 text-white/60">{children}</blockquote>
  ),
  code: ({ children }) => (
    <code className="px-[5px] py-[1px] rounded-[6px] bg-white/[0.08] font-mono text-[0.9em] text-white/90">
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="mt-[14px] p-[14px] rounded-[12px] bg-white/[0.06] overflow-x-auto text-[13px] leading-[1.5] [&_code]:p-0 [&_code]:bg-transparent">
      {children}
    </pre>
  ),
  img: ({ src, alt }) => (
    <img
      src={typeof src === 'string' ? src : undefined}
      alt={alt ?? ''}
      className="mt-[14px] max-w-full rounded-[12px]"
    />
  ),
  hr: () => <hr className="my-[28px] border-0 h-px bg-white/[0.06]" />,
};

export const SiteMarkdown: React.FC<{ children: string; className?: string }> = ({ children, className }) => (
  <div className={className}>
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} skipHtml>
      {children}
    </ReactMarkdown>
  </div>
);
