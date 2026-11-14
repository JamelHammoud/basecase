import type React from 'react';

export type ToolIcon = React.FC<{ className?: string }>;

export interface ToolLabel {
  title: string;
  detail?: string;
}

export interface LabelContext {
  input: Record<string, unknown>;
  verb: (ing: string, ed: string) => string;
}

export interface ToolRule {
  keys: string[];
  icon: ToolIcon;
  label: (ctx: LabelContext) => ToolLabel | null;
}

export const plainRule = (keys: string[], icon: ToolIcon, [ing, ed]: [string, string]): ToolRule => ({
  keys,
  icon,
  label: ({ verb }) => ({ title: verb(ing, ed) }),
});
