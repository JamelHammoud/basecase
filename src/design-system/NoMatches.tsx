import React from 'react';
import { EmptyState } from './EmptyState';

export const NoMatches: React.FC<{ query: string; action?: React.ReactNode }> = ({ query, action }) => (
  <EmptyState title={`No matches for “${query.trim()}”`} action={action} />
);
