import React from 'react';
import { Section } from '../../../design-system';

export const Titled: React.FC<{ title: string | undefined; children: React.ReactNode }> = ({ title, children }) =>
  title ? <Section title={title}>{children}</Section> : <div className="px-[12px] py-3">{children}</div>;
