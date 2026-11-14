import type React from 'react';

interface FieldRowProps {
  label: string;
  children: React.ReactNode;
  group?: boolean;
}

export function FieldRow({ label, children, group = false }: FieldRowProps) {
  const Row = group ? 'div' : 'label';

  return (
    <Row className={group ? 'flex flex-col gap-1.5' : 'grid grid-cols-[88px_1fr] items-center gap-2'}>
      <span className="text-[13px] text-white/50 truncate">{label}</span>
      {children}
    </Row>
  );
}
