import { Button } from '../../design-system';

export function BoardBuildAction({ exists, onClick }: { exists: boolean; onClick: () => void }) {
  const label = exists ? 'Edit Board' : 'Define Board';

  return <div className="p-[12px]"><Button variant="secondary" onClick={onClick} title={label}>{label}</Button></div>;
}
