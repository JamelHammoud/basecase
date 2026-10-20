import React from 'react';
import { useScrollFade } from './useScrollFade';

const TABLE_FADE_PX = 24;

export const MarkdownTable: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { ref: fadeRef, style: fadeStyle } = useScrollFade(TABLE_FADE_PX, 'x');

  return (
    <div className="my-2 rounded-lg ring-1 ring-inset ring-white/[0.08]">
      <div ref={fadeRef} style={fadeStyle} data-inner-scroll className="overflow-x-auto overscroll-x-contain">
        <table className="w-max min-w-full text-[12.5px] tabular">{children}</table>
      </div>
    </div>
  );
};

export const TableCell: React.FC<{ header?: boolean; children: React.ReactNode }> = ({ header, children }) => {
  const content = <div className="w-max max-w-[240px] whitespace-normal [overflow-wrap:normal]">{children}</div>;

  if (header)
    return (
      <th className="text-left align-bottom font-medium text-white/60 px-2.5 py-1.5 border-b border-white/[0.08]">
        {content}
      </th>
    );

  return <td className="align-top px-2.5 py-1.5 border-b border-white/[0.04] text-white/85">{content}</td>;
};
