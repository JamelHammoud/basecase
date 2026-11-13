import React, { createContext, useContext, useLayoutEffect, useState } from 'react';

interface GutterScope {
  shown: boolean;
  claim: () => () => void;
}

const GutterContext = createContext<GutterScope | null>(null);

const claimNothing = () => () => undefined;

export const MenuGutterScope: React.FC<{ shown?: boolean; children: React.ReactNode }> = ({ shown, children }) => {
  const [claims, setClaims] = useState(0);
  const [claim] = useState(() => () => {
    setClaims((n) => n + 1);

    return () => setClaims((n) => n - 1);
  });
  const scope = shown === undefined ? { shown: claims > 0, claim } : { shown, claim: claimNothing };

  return <GutterContext value={scope}>{children}</GutterContext>;
};

export function useMenuGutter(own: boolean) {
  const scope = useContext(GutterContext);
  const claim = scope?.claim;

  useLayoutEffect(() => (own && claim ? claim() : undefined), [own, claim]);

  return !own && !!scope?.shown;
}

export const MenuGutterPad: React.FC = () => <span aria-hidden className="w-4 shrink-0" />;
