import type { ReactNode } from 'react';

/** Native disclosure: open is an initial state, not application state. */
export function InspSection({
  label,
  defaultOpen,
  headExtra,
  children,
}: {
  label: string;
  defaultOpen?: boolean;
  headExtra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <details className="insp-section" open={defaultOpen || undefined}>
      <summary className="insp-section-head">
        <span className="eyebrow">{label}</span>
        {headExtra}
      </summary>
      {children}
    </details>
  );
}
