import { Button } from './Button';

export function PageNavigation({
  after,
  next,
  disabled,
  onChange,
}: {
  after: string;
  next: string | null;
  disabled?: boolean;
  onChange: (cursor: string) => void;
}) {
  return (
    <div className="flex gap-3">
      {after && (
        <Button type="button" disabled={disabled} onClick={() => onChange('')}>
          First Page
        </Button>
      )}
      {next && (
        <Button type="button" disabled={disabled} onClick={() => onChange(next)}>
          Next Page
        </Button>
      )}
    </div>
  );
}
