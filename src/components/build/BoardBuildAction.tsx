import { Button } from '../../design-system';

export function BoardBuildAction({ exists, onClick }: { exists: boolean; onClick: () => void }) {
  const label = exists ? 'Edit Board' : 'Define Board';

  return (
    <div className="pl-[31px] pr-[7px] py-1">
      <Button variant="secondary" onClick={onClick}>
        {label}
      </Button>
    </div>
  );
}
