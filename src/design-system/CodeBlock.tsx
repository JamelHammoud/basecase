import React, { useEffect, useState } from 'react';
import { CopyIcon, ExpandIcon, TickIcon } from './glyphs';
import { highlightLines, type Token, type TokenKind } from '../utils/highlight';
import { IconButton } from './IconButton';
import { Modal } from './Modal';

const TOKEN_CLASS: Record<TokenKind, string> = {
  plain: '',
  comment: 'text-[#7f8c98] italic',
  string: 'text-[#fc6a5d]',
  number: 'text-[#d9c97c]',
  keyword: 'text-[#fc5fa3] font-medium',
  builtin: 'text-[#67b7a4]',
  function: 'text-[#6bdfff]',
  special: 'text-[#d0a8ff]',
};

const COPIED_MS = 1400;

const LANGUAGE_NAMES: Record<string, string> = {
  openscad: 'OpenSCAD',
  replicad: 'replicad',
  js: 'JavaScript',
  javascript: 'JavaScript',
  ts: 'TypeScript',
  typescript: 'TypeScript',
  py: 'Python',
  python: 'Python',
  json: 'JSON',
};

const languageName = (language?: string) => (language ? (LANGUAGE_NAMES[language.toLowerCase()] ?? language) : 'Code');

const Line: React.FC<{ tokens: Token[] }> = ({ tokens }) => (
  <>
    {tokens.map((t, i) => (
      <span key={i} className={TOKEN_CLASS[t.kind]}>
        {t.text}
      </span>
    ))}
    {'\n'}
  </>
);

const Lines: React.FC<{ lines: Token[][]; numbered?: boolean }> = ({ lines, numbered }) => (
  <div className="flex min-w-max">
    {numbered && (
      <div aria-hidden className="pr-4 text-right text-white/25 select-none tabular-nums whitespace-pre">
        {lines.map((_, i) => `${i + 1}\n`).join('')}
      </div>
    )}
    <code className="block whitespace-pre text-white/80">
      {lines.map((tokens, i) => (
        <Line key={i} tokens={tokens} />
      ))}
    </code>
  </div>
);

function useCopy(code: string) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;

    const timer = window.setTimeout(() => setCopied(false), COPIED_MS);

    return () => window.clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
  };

  return { copied, copy };
}

const CopyButton: React.FC<{ code: string; size: 'xs' | 'sm' }> = ({ code, size }) => {
  const { copied, copy } = useCopy(code);

  return (
    <IconButton
      icon={copied ? <TickIcon className="w-3.5 h-3.5" /> : <CopyIcon className="w-3.5 h-3.5" />}
      title={copied ? 'Copied' : 'Copy'}
      size={size}
      tooltipSide="top"
      onClick={copy}
    />
  );
};

export interface CodeBlockProps {
  code: string;
  language?: string;
  title?: string;
  className?: string;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({ code, language, title, className = '' }) => {
  const [expanded, setExpanded] = useState(false);
  const lines = highlightLines(code, language);
  const name = languageName(language);

  return (
    <div
      className={`group/code relative rounded-xl bg-black/30 ring-1 ring-inset ring-white/[0.06] select-text ${className}`}
    >
      <pre
        data-inner-scroll
        className="max-h-72 overflow-auto p-3 text-[12px] leading-relaxed font-mono [overflow-wrap:normal]"
      >
        <Lines lines={lines} />
      </pre>
      <div className="absolute top-1.5 right-1.5 flex gap-0.5 rounded-[10px] bg-[#1d1d1d] opacity-0 group-hover/code:opacity-100 focus-within:opacity-100 transition-opacity duration-150">
        <CopyButton code={code} size="xs" />
        <IconButton
          icon={<ExpandIcon className="w-3.5 h-3.5" />}
          title="Expand"
          size="xs"
          tooltipSide="top"
          onClick={() => setExpanded(true)}
        />
      </div>
      <Modal
        isOpen={expanded}
        onClose={() => setExpanded(false)}
        title={title ?? name}
        subtitle={title ? name : undefined}
        maxWidth="max-w-[1100px]"
        headerActions={<CopyButton code={code} size="sm" />}
      >
        <pre className="p-4 rounded-xl bg-black/30 ring-1 ring-inset ring-white/[0.06] overflow-auto text-[13px] leading-relaxed font-mono select-text">
          <Lines lines={lines} numbered />
        </pre>
      </Modal>
    </div>
  );
};
