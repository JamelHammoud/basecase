import React from 'react';
import ReactMarkdown, { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

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
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-[#5cb8ff] hover:underline underline-offset-2">
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-2 pl-3 border-l-2 border-white/15 text-white/60">{children}</blockquote>
  ),
  hr: () => <hr className="my-3 border-white/10" />,
  code: ({ className, children }) => {
    const isBlock = /language-/.test(className || '') || String(children).includes('\n');
    return isBlock ? (
      <code className="block font-mono text-[12.5px] leading-relaxed">{children}</code>
    ) : (
      <code className="px-1 py-0.5 rounded-[5px] bg-white/[0.08] font-mono text-[12.5px] text-white/90">{children}</code>
    );
  },
  pre: ({ children }) => (
    <pre className="my-2 p-3 rounded-xl bg-black/30 ring-1 ring-inset ring-white/[0.06] overflow-x-auto">{children}</pre>
  ),
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto rounded-lg ring-1 ring-inset ring-white/[0.08]">
      <table className="w-full text-[12.5px] tabular">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="text-left font-medium text-white/60 px-2.5 py-1.5 border-b border-white/[0.08]">{children}</th>,
  td: ({ children }) => <td className="px-2.5 py-1.5 border-b border-white/[0.04] text-white/85">{children}</td>,
};

/** GitHub-flavored markdown styled for chat (links open in the system browser) */
export const Markdown: React.FC<{ children: string; className?: string }> = ({ children, className = '' }) => (
  <div className={`text-[14px] leading-relaxed text-white/90 select-text break-words ${className}`}>
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {children}
    </ReactMarkdown>
  </div>
);
