import React, { useEffect, useRef, useState } from 'react';
import { Button, MenuDivider, MenuItem, MenuLabel, SparklesIcon, TextInput } from '../../design-system';
import { skillChoice, STEP_GROUPS, type StepChoice } from '../../routines/stepMenu';
import { STEP_ICONS } from './stepIcons';

interface AddStepMenuProps {
  choices: StepChoice[];
  onPick: (choice: StepChoice) => void;
}

const STEP_KEYS: Record<string, (index: number, count: number) => number> = {
  ArrowDown: (i, n) => (i + 1) % n,
  ArrowUp: (i, n) => (i - 1 + n) % n,
  Home: () => 0,
  End: (_, n) => n - 1,
};

function moveFocus(e: React.KeyboardEvent<HTMLDivElement>) {
  const step = STEP_KEYS[e.key];
  const items = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')];

  if (!step || items.length === 0) return;

  e.preventDefault();

  const at = items.indexOf(document.activeElement as HTMLButtonElement);

  items[step(Math.max(at, 0), items.length)].focus();
}

function AnySkillField({ onAdd }: { onAdd: (name: string) => void }) {
  const [name, setName] = useState('');
  const ready = name.trim().length > 0;

  return (
    <form
      className="flex items-center gap-1.5 p-1 w-60"
      onSubmit={(e) => {
        e.preventDefault();

        if (ready) onAdd(name);
      }}
    >
      <TextInput
        autoFocus
        aria-label="Skill name"
        placeholder="e.g. Jump"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <Button type="submit" size="sm" variant="primary" disabled={!ready}>
        Add
      </Button>
    </form>
  );
}

export function AddStepMenu({ choices, onPick }: AddStepMenuProps) {
  const [naming, setNaming] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() =>
      listRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus(),
    );

    return () => cancelAnimationFrame(frame);
  }, []);

  if (naming) return <AnySkillField onAdd={(name) => onPick(skillChoice(name))} />;

  return (
    <div ref={listRef} onKeyDown={moveFocus} className="max-h-[min(560px,75vh)] overflow-y-auto w-56">
      {STEP_GROUPS.map((group, i) => {
        const items = choices.filter((c) => c.group === group);

        return (
          <React.Fragment key={group}>
            {i > 0 && <MenuDivider />}
            <MenuLabel>{group}</MenuLabel>
            {items.map((c) => {
              const Icon = STEP_ICONS[c.icon];

              return (
                <MenuItem
                  key={c.key}
                  icon={<Icon className="w-4 h-4" />}
                  label={c.label}
                  detail={c.detail}
                  onSelect={() => onPick(c)}
                />
              );
            })}
            {group === 'Skills' && (
              <MenuItem
                icon={<SparklesIcon className="w-4 h-4" />}
                label="Any Skill"
                onSelect={() => setNaming(true)}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
